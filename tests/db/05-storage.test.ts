/**
 * Storage policies, exercised with the real supabase-js Storage client against
 * the local Storage emulator (which runs every object operation as the
 * caller's role, so storage.objects RLS is enforced as written).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonClient, closePool, createUser, daysAgo, expectOk, serviceClient, sql, stack, type TestUser } from '../helpers/stack';

afterAll(closePool);

const png = new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])], { type: 'image/png' });
const pdf = new Blob([new TextEncoder().encode('%PDF-1.4\n%test\n')], { type: 'application/pdf' });

let publisher: TestUser;
let coordinator: TestUser;
let treasurerA: TestUser;
let treasurerB: TestUser;
let reviewer: TestUser;

beforeAll(async () => {
  publisher = await createUser(['publisher'], 'pub');
  coordinator = await createUser(['volunteer_coordinator'], 'coord');
  treasurerA = await createUser(['treasurer'], 'trA');
  treasurerB = await createUser(['treasurer'], 'trB');
  reviewer = await createUser(['assistance_reviewer'], 'rev');
});

describe('media-private bucket', () => {
  it('accepts uploads from the media team only, at the expected path', async () => {
    const path = `uploads/${randomUUID()}.png`;
    expect((await coordinator.client.storage.from('media-private').upload(path, png)).error).toBeNull();
    expect((await reviewer.client.storage.from('media-private').upload(`uploads/${randomUUID()}.png`, png)).error).not.toBeNull();
    expect((await anonClient().storage.from('media-private').upload(`uploads/${randomUUID()}.png`, png)).error).not.toBeNull();
    // Arbitrary paths are refused even for the media team.
    expect((await coordinator.client.storage.from('media-private').upload('elsewhere/file.png', png)).error).not.toBeNull();

    expect((await publisher.client.storage.from('media-private').download(path)).error).toBeNull();
    expect((await anonClient().storage.from('media-private').download(path)).error).not.toBeNull();
    expect((await treasurerA.client.storage.from('media-private').download(path)).error).not.toBeNull();
    expect((await anonClient().storage.from('media-private').createSignedUrl(path, 60)).error).not.toBeNull();
  });

  it('rejects files that are not images', async () => {
    const res = await coordinator.client.storage.from('media-private').upload(`uploads/${randomUUID()}.png`, pdf);
    expect(res.error).not.toBeNull();
  });
});

describe('media-public bucket', () => {
  it('cannot be written by signed-in users (only the staff-api edge function)', async () => {
    const res = await publisher.client.storage.from('media-public').upload(`media/${randomUUID()}.png`, png);
    expect(res.error).not.toBeNull();
    const service = await serviceClient().storage.from('media-public').upload(`media/${randomUUID()}.png`, png);
    expect(service.error).toBeNull();
    const publicUrl = serviceClient().storage.from('media-public').getPublicUrl(service.data!.path).data.publicUrl;
    expect((await fetch(publicUrl)).status).toBe(200);
  });
});

describe('finance-evidence bucket', () => {
  it('is restricted to finance staff and locked once an entry is verified', async () => {
    const [account] = await sql<{ id: string }>(
      `insert into public.financial_accounts (name, account_type) values ($1, 'bank') returning id`,
      [`Evidence ${randomUUID().slice(0, 6)}`],
    );
    const entryId = expectOk(
      await treasurerA.client.rpc('finance_record_expense', {
        p_entry_date: daysAgo(1), p_amount: 450, p_account_id: account!.id, p_payment_method: 'cash',
        p_transaction_reference: null, p_description: 'Medicines for camp', p_expense_category: 'medical_support',
        p_payee_name: 'Village Pharmacy',
      }),
    ) as string;
    const path = `entries/${entryId}/bill.pdf`;
    expect((await reviewer.client.storage.from('finance-evidence').upload(path, pdf)).error).not.toBeNull();
    expect((await treasurerA.client.storage.from('finance-evidence').upload(`entries/${randomUUID()}/bill.pdf`, pdf)).error).not.toBeNull();
    expect((await treasurerA.client.storage.from('finance-evidence').upload(path, pdf)).error).toBeNull();
    expect((await publisher.client.storage.from('finance-evidence').download(path)).error).not.toBeNull();
    expect((await treasurerB.client.storage.from('finance-evidence').download(path)).error).toBeNull();

    expectOk(
      await treasurerA.client.from('ledger_evidence').insert({
        ledger_entry_id: entryId, storage_path: path, file_name: 'bill.pdf', mime_type: 'application/pdf', byte_size: 15,
        kind: 'bill', uploaded_by: treasurerA.id,
      }),
    );
    expectOk(await treasurerB.client.rpc('finance_verify_entry', { p_entry_id: entryId }));
    const removed = await treasurerA.client.storage.from('finance-evidence').remove([path]);
    expect(removed.data ?? []).toEqual([]);
    expect((await treasurerB.client.storage.from('finance-evidence').download(path)).error).toBeNull();
  });
});

describe('report-documents bucket', () => {
  it('becomes publicly readable only when the report is published', async () => {
    const reportId = expectOk(
      await treasurerA.client.rpc('finance_create_report', {
        p_title: 'Storage test report', p_period_type: 'custom', p_start: daysAgo(40), p_end: daysAgo(35),
      }),
    ) as string;
    const path = `reports/${reportId}/statement.pdf`;
    expect((await publisher.client.storage.from('report-documents').upload(path, pdf)).error).not.toBeNull();
    expect((await treasurerA.client.storage.from('report-documents').upload(path, pdf)).error).toBeNull();
    expectOk(
      await treasurerA.client.from('financial_report_documents').insert({
        report_id: reportId, title: 'Bank statement (redacted)', storage_path: path, mime_type: 'application/pdf',
        byte_size: 15, redaction_confirmed: true, uploaded_by: treasurerA.id,
      }),
    );
    const anon = anonClient();
    expect((await anon.storage.from('report-documents').createSignedUrl(path, 60)).error).not.toBeNull();

    expectOk(await treasurerB.client.rpc('finance_publish_report', { p_report_id: reportId }));
    const signed = await anon.storage.from('report-documents').createSignedUrl(path, 60);
    expect(signed.error).toBeNull();
    expect((await fetch(signed.data!.signedUrl)).status).toBe(200);

    // Documents cannot be added once the report is published.
    expect((await treasurerA.client.storage.from('report-documents').upload(`reports/${reportId}/extra.pdf`, pdf)).error).not.toBeNull();
    expect(stack.apiUrl).toContain('127.0.0.1');
  });
});

describe('assistance-files bucket', () => {
  it('is readable by reviewers only and writable by nobody but the service role', async () => {
    const path = `${randomUUID()}/${randomUUID()}.pdf`;
    expect((await reviewer.client.storage.from('assistance-files').upload(path, pdf)).error).not.toBeNull();
    expect((await serviceClient().storage.from('assistance-files').upload(path, pdf)).error).toBeNull();
    expect((await reviewer.client.storage.from('assistance-files').download(path)).error).toBeNull();
    expect((await publisher.client.storage.from('assistance-files').download(path)).error).not.toBeNull();
    expect((await anonClient().storage.from('assistance-files').download(path)).error).not.toBeNull();
  });
});
