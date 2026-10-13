import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  closePool,
  createUser,
  daysAgo,
  expectFailure,
  expectOk,
  randomPhone,
  randomReference,
  serviceClient,
  sql,
  todayIST,
  type TestUser,
} from '../helpers/stack';

afterAll(closePool);

let treasurerA: TestUser;
let treasurerB: TestUser;
let bankAccountId: string;
let cashAccountId: string;

async function newAccount(client: TestUser['client'], name: string, type = 'bank') {
  const row = expectOk(
    await client.from('financial_accounts').insert({ name, account_type: type }).select('id').single(),
  ) as { id: string };
  return row.id;
}

async function attachEvidence(user: TestUser, entryId: string, kind = 'bill') {
  const path = `entries/${entryId}/${randomUUID()}.pdf`;
  expectOk(
    await user.client.from('ledger_evidence').insert({
      ledger_entry_id: entryId,
      storage_path: path,
      file_name: 'bill.pdf',
      mime_type: 'application/pdf',
      byte_size: 1000,
      kind,
      uploaded_by: user.id,
    }),
  );
}

async function recordDonation(user: TestUser, overrides: Record<string, unknown> = {}) {
  return expectOk(
    await user.client.rpc('finance_record_donation', {
      p_entry_type: 'member_contribution',
      p_entry_date: daysAgo(2),
      p_amount: 1000 + Math.floor(Math.random() * 9000),
      p_account_id: bankAccountId,
      p_payment_method: 'upi',
      p_transaction_reference: randomReference(),
      p_description: 'Monthly member contribution',
      p_donor_name: 'Member One',
      ...overrides,
    }),
  ) as string;
}

beforeAll(async () => {
  treasurerA = await createUser(['treasurer'], 'treasA');
  treasurerB = await createUser(['treasurer'], 'treasB');
  bankAccountId = await newAccount(treasurerA.client, `Bank ${randomUUID().slice(0, 6)}`);
  cashAccountId = await newAccount(treasurerA.client, `Cash ${randomUUID().slice(0, 6)}`, 'cash');
});

describe('access control', () => {
  it('hides the ledger from everyone except treasurers and admins', async () => {
    const id = await recordDonation(treasurerA);
    for (const role of ['assistance_reviewer', 'publisher', 'volunteer_coordinator', 'volunteer'] as const) {
      const user = await createUser([role], role);
      expect(expectOk(await user.client.from('ledger_entries').select('id').eq('id', id)), role).toEqual([]);
      expect(expectOk(await user.client.from('donations').select('donor_name').eq('ledger_entry_id', id)), role).toEqual([]);
      expectFailure(await user.client.rpc('finance_verify_entry', { p_entry_id: id, p_note: 'x' }), { hint: 'forbidden' });
      expectFailure(await user.client.rpc('finance_period_summary', { p_start: daysAgo(30), p_end: todayIST() }), {
        hint: 'forbidden',
      });
    }
    expectFailure(await anonClient().from('ledger_entries').select('id'), { code: '42501' });
  });

  it('allows no direct writes to the ledger, even for treasurers', async () => {
    expectFailure(
      await treasurerA.client.from('ledger_entries').insert({
        entry_date: todayIST(), entry_type: 'other_income', direction: 'in', amount: 10, account_id: bankAccountId,
        payment_method: 'cash', description: 'direct insert',
      }),
      { code: '42501' },
    );
    const id = await recordDonation(treasurerA);
    expectFailure(await treasurerA.client.from('ledger_entries').update({ amount: 1 }).eq('id', id), { code: '42501' });
    expectFailure(await treasurerA.client.from('ledger_entries').delete().eq('id', id), { code: '42501' });
  });
});

describe('verification', () => {
  it('requires a different person to verify (four-eyes) and issues a receipt number', async () => {
    const id = await recordDonation(treasurerA);
    expectFailure(await treasurerA.client.rpc('finance_verify_entry', { p_entry_id: id, p_note: 'Matched statement' }), {
      hint: 'independent_verification_required',
    });
    expectFailure(await treasurerB.client.rpc('finance_verify_entry', { p_entry_id: id }), {
      hint: 'verification_note_required',
    });
    const res = expectOk(
      await treasurerB.client.rpc('finance_verify_entry', { p_entry_id: id, p_note: 'Matched bank statement line 4' }),
    ) as { receipt_number: string };
    expect(res.receipt_number).toMatch(/^PRY\/\d{4}-\d{2}\/\d{4}$/);
    const [row] = await sql<{ status: string; verified_by: string }>(
      'select status, verified_by from public.ledger_entries where id = $1',
      [id],
    );
    expect(row).toEqual({ status: 'verified', verified_by: treasurerB.id });
  });

  it('makes verified entries immutable even for the database owner', async () => {
    const id = await recordDonation(treasurerA);
    expectOk(await treasurerB.client.rpc('finance_verify_entry', { p_entry_id: id, p_note: 'Checked' }));
    await expect(sql('update public.ledger_entries set amount = 1 where id = $1', [id])).rejects.toThrow(/cannot be changed/);
    await expect(sql('delete from public.ledger_entries where id = $1', [id])).rejects.toThrow(/cannot be deleted/);
    await expect(sql(`update public.donations set donor_name = 'Changed' where ledger_entry_id = $1`, [id])).rejects.toThrow(
      /cannot be changed/,
    );
    await expect(sql('truncate public.ledger_entries cascade')).rejects.toThrow();
  });

  it('requires a bill or receipt before an expense can be verified', async () => {
    const id = expectOk(
      await treasurerA.client.rpc('finance_record_expense', {
        p_entry_date: daysAgo(1), p_amount: 800, p_account_id: bankAccountId, p_payment_method: 'bank_transfer',
        p_transaction_reference: randomReference('EXP'), p_description: 'School books', p_expense_category: 'education_support',
        p_payee_name: 'City Book Depot',
      }),
    ) as string;
    expectFailure(await treasurerB.client.rpc('finance_verify_entry', { p_entry_id: id, p_note: 'ok' }), {
      hint: 'evidence_required',
    });
    await attachEvidence(treasurerA, id);
    expectOk(await treasurerB.client.rpc('finance_verify_entry', { p_entry_id: id }));
  });

  it('lets anyone in finance reject a pending entry with a reason', async () => {
    const id = await recordDonation(treasurerA);
    expectFailure(await treasurerA.client.rpc('finance_reject_entry', { p_entry_id: id, p_reason: 'no' }), {
      hint: 'invalid:reason',
    });
    expectOk(await treasurerA.client.rpc('finance_reject_entry', { p_entry_id: id, p_reason: 'Recorded twice by mistake' }));
    expectFailure(await treasurerB.client.rpc('finance_verify_entry', { p_entry_id: id, p_note: 'x' }), { hint: 'not_pending' });
  });

  it('treats an editor like a recorder for four-eyes purposes', async () => {
    const id = await recordDonation(treasurerA);
    expectOk(await treasurerB.client.rpc('finance_update_pending_entry', { p_entry_id: id, p_changes: { amount: 1600 } }));
    expectFailure(await treasurerB.client.rpc('finance_verify_entry', { p_entry_id: id, p_note: 'x' }), {
      hint: 'independent_verification_required',
    });
    const admin = await createUser(['admin'], 'finadmin');
    expectOk(await admin.client.rpc('finance_verify_entry', { p_entry_id: id, p_note: 'Checked by admin' }));
  });
});

describe('duplicate prevention', () => {
  it('rejects a second live entry with the same payment reference', async () => {
    const ref = randomReference();
    await recordDonation(treasurerA, { p_transaction_reference: ref });
    expectFailure(
      await treasurerA.client.rpc('finance_record_donation', {
        p_entry_type: 'public_donation', p_entry_date: daysAgo(1), p_amount: 99, p_account_id: bankAccountId,
        p_payment_method: 'upi', p_transaction_reference: ` ${ref.toLowerCase()} `, p_description: 'dup', p_donor_name: 'X Y',
      }),
      { code: '23505' },
    );
  });

  it('asks for confirmation when an entry looks like a duplicate', async () => {
    const amount = 1234 + Math.floor(Math.random() * 1000);
    await recordDonation(treasurerA, {
      p_amount: amount, p_transaction_reference: null, p_payment_method: 'cash', p_account_id: cashAccountId, p_donor_name: 'Member Two',
    });
    // A different member paying the same amount on the same day is not a duplicate.
    expectOk(
      await treasurerA.client.rpc('finance_record_donation', {
        p_entry_type: 'member_contribution', p_entry_date: daysAgo(1), p_amount: amount, p_account_id: cashAccountId,
        p_payment_method: 'cash', p_transaction_reference: null, p_description: 'Contribution', p_donor_name: 'Member Seven',
      }),
    );
    const again = await treasurerA.client.rpc('finance_record_donation', {
      p_entry_type: 'member_contribution', p_entry_date: daysAgo(1), p_amount: amount, p_account_id: cashAccountId,
      p_payment_method: 'cash', p_transaction_reference: null, p_description: 'Contribution', p_donor_name: 'Member Two',
    });
    expectFailure(again, { hint: 'possible_duplicate' });
    expectOk(
      await treasurerA.client.rpc('finance_record_donation', {
        p_entry_type: 'member_contribution', p_entry_date: daysAgo(1), p_amount: amount, p_account_id: cashAccountId,
        p_payment_method: 'cash', p_transaction_reference: null, p_description: 'Contribution', p_donor_name: 'Member Two',
        p_allow_possible_duplicate: true,
      }),
    );
  });
});

describe('corrections and balances', () => {
  let account: string;

  beforeAll(async () => {
    account = await newAccount(treasurerA.client, `Ledger test ${randomUUID().slice(0, 6)}`);
  });

  async function balance(asOf?: string) {
    const rows = expectOk(await treasurerA.client.rpc('finance_account_balances', asOf ? { p_as_of: asOf } : {})) as Array<{
      account_id: string;
      balance: number;
    }>;
    return Number(rows.find((r) => r.account_id === account)!.balance);
  }

  it('computes balances from verified entries only and corrects with reversals', async () => {
    const opening = expectOk(
      await treasurerA.client.rpc('finance_record_entry', {
        p_entry_type: 'opening_balance', p_entry_date: daysAgo(20), p_amount: 10000, p_description: 'Balance when the ledger started',
        p_account_id: account, p_payment_method: 'bank_transfer',
      }),
    ) as string;
    expect(await balance()).toBe(0); // pending entries do not count
    await attachEvidence(treasurerA, opening, 'bank_statement');
    expectOk(await treasurerB.client.rpc('finance_verify_entry', { p_entry_id: opening }));
    expect(await balance()).toBe(10000);

    // A second opening balance is refused.
    expectFailure(
      await treasurerA.client.rpc('finance_record_entry', {
        p_entry_type: 'opening_balance', p_entry_date: daysAgo(20), p_amount: 5, p_description: 'again', p_account_id: account,
        p_payment_method: 'bank_transfer',
      }),
      { hint: 'opening_balance_exists' },
    );
    // Nothing can be dated before the opening balance.
    expectFailure(await recordDonationOn(account, daysAgo(25)), { hint: 'before_opening_balance' });

    const donation = expectOk(await recordDonationOn(account, daysAgo(10), 2500)) as string;
    expectOk(await treasurerB.client.rpc('finance_verify_entry', { p_entry_id: donation, p_note: 'statement' }));
    expect(await balance()).toBe(12500);

    // Wrong amount discovered: reverse it (pending until verified), then verify the reversal.
    const reversal = expectOk(
      await treasurerA.client.rpc('finance_reverse_entry', { p_entry_id: donation, p_reason: 'Amount was recorded incorrectly' }),
    ) as string;
    expect(await balance()).toBe(12500);
    expectFailure(await treasurerA.client.rpc('finance_reverse_entry', { p_entry_id: donation, p_reason: 'Second reversal' }), {
      hint: 'already_reversed',
    });
    expectOk(await treasurerB.client.rpc('finance_verify_entry', { p_entry_id: reversal, p_note: 'Correction approved' }));
    expect(await balance()).toBe(10000);

    // The replacement links back to the original.
    const replacement = expectOk(await recordDonationOn(account, todayIST(), 2000, { p_replaces_entry_id: donation })) as string;
    const [link] = await sql<{ replaces_entry_id: string }>('select replaces_entry_id from public.ledger_entries where id = $1', [
      replacement,
    ]);
    expect(link?.replaces_entry_id).toBe(donation);
    expectFailure(await treasurerA.client.rpc('finance_reverse_entry', { p_entry_id: reversal, p_reason: 'reverse a reversal' }), {
      hint: 'cannot_reverse_reversal',
    });
  });

  it('keeps the period summary arithmetic consistent with balances', async () => {
    const start = daysAgo(30);
    const end = todayIST();
    const s = expectOk(await treasurerA.client.rpc('finance_period_summary', { p_start: start, p_end: end })) as {
      opening_balance: number;
      closing_balance: number;
      income: Record<string, number>;
      opening_balances_recorded: number;
      expenditure_total: number;
      refunds: number;
      accounts: Array<{ account_id: string; closing: number }>;
    };
    const income = Object.values(s.income).reduce((a, b) => a + Number(b), 0);
    const expected = Number(s.opening_balance) + income + Number(s.opening_balances_recorded) - Number(s.expenditure_total) - Number(s.refunds);
    expect(Number(s.closing_balance)).toBeCloseTo(expected, 2);
    const total = s.accounts.reduce((a, acc) => a + Number(acc.closing), 0);
    expect(total).toBeCloseTo(Number(s.closing_balance), 2);
  });

  it('closes the period once an account is reconciled with no difference', async () => {
    const current = await balance(daysAgo(5));
    const mismatch = expectOk(
      await treasurerA.client.rpc('finance_reconcile', {
        p_account_id: account, p_statement_date: daysAgo(5), p_statement_balance: current + 1, p_notes: 'Off by one',
      }),
    ) as { difference: number };
    expect(Number(mismatch.difference)).toBe(1);
    // A discrepancy does not lock the period.
    expectOk(await recordDonationOn(account, daysAgo(6), 77, { p_allow_possible_duplicate: true }));
    const balanced = expectOk(
      await treasurerA.client.rpc('finance_reconcile', {
        p_account_id: account, p_statement_date: daysAgo(5), p_statement_balance: current,
      }),
    ) as { difference: number; pending_entries_count: number };
    expect(Number(balanced.difference)).toBe(0);
    expect(balanced.pending_entries_count).toBeGreaterThan(0);
    expectFailure(await recordDonationOn(account, daysAgo(6), 55), { hint: 'period_closed' });
    // Pending entries dated in the closed period can no longer be verified either.
    const [pending] = await sql<{ id: string }>(
      `select id from public.ledger_entries where account_id = $1 and status = 'pending' and entry_date <= $2 limit 1`,
      [account, daysAgo(5)],
    );
    expectFailure(await treasurerB.client.rpc('finance_verify_entry', { p_entry_id: pending!.id, p_note: 'x' }), {
      hint: 'period_closed',
    });
    // Reconciliations themselves are immutable.
    await expect(sql('delete from public.reconciliations where account_id = $1', [account])).rejects.toThrow();
  });

  function recordDonationOn(acc: string, date: string, amount = 100, extra: Record<string, unknown> = {}) {
    return treasurerA.client.rpc('finance_record_donation', {
      p_entry_type: 'member_contribution', p_entry_date: date, p_amount: amount, p_account_id: acc, p_payment_method: 'upi',
      p_transaction_reference: randomReference(), p_description: 'Contribution', p_donor_name: 'Member Three', ...extra,
    });
  }
});

describe('transfers, refunds and allocations', () => {
  it('verifies both legs of a transfer together and keeps the total unchanged', async () => {
    const group = expectOk(
      await treasurerA.client.rpc('finance_record_transfer', {
        p_entry_date: daysAgo(1), p_amount: 300, p_from_account_id: cashAccountId, p_to_account_id: bankAccountId,
        p_payment_method: 'cash', p_transaction_reference: null, p_description: 'Cash deposited at branch',
      }),
    ) as string;
    const legs = await sql<{ id: string }>('select id from public.ledger_entries where transfer_group_id = $1', [group]);
    expect(legs).toHaveLength(2);
    const res = expectOk(await treasurerB.client.rpc('finance_verify_entry', { p_entry_id: legs[0]!.id, p_note: 'Deposit slip' })) as {
      verified: string[];
    };
    expect(res.verified).toHaveLength(2);
  });

  it('limits refunds to the original verified donation', async () => {
    const id = await recordDonation(treasurerA, { p_amount: 500 });
    expectFailure(
      await treasurerA.client.rpc('finance_record_entry', {
        p_entry_type: 'refund', p_entry_date: todayIST(), p_amount: 100, p_description: 'Refund', p_account_id: bankAccountId,
        p_payment_method: 'upi', p_related_entry_id: id,
      }),
      { hint: 'invalid:related_entry_id' },
    );
    expectOk(await treasurerB.client.rpc('finance_verify_entry', { p_entry_id: id, p_note: 'ok' }));
    expectFailure(
      await treasurerA.client.rpc('finance_record_entry', {
        p_entry_type: 'refund', p_entry_date: todayIST(), p_amount: 600, p_description: 'Refund', p_account_id: bankAccountId,
        p_payment_method: 'upi', p_related_entry_id: id,
      }),
      { hint: 'invalid:amount' },
    );
    expectOk(
      await treasurerA.client.rpc('finance_record_entry', {
        p_entry_type: 'refund', p_entry_date: todayIST(), p_amount: 200, p_description: 'Partial refund requested by donor',
        p_account_id: bankAccountId, p_payment_method: 'upi', p_related_entry_id: id,
      }),
    );
  });

  it('records project allocations without moving cash', async () => {
    const [project] = await sql<{ id: string }>(
      `insert into public.projects (slug, title, summary, category) values ($1, 'Allocation test', 'Summary for allocation test', 'education') returning id`,
      [`alloc-${randomUUID().slice(0, 8)}`],
    );
    const id = expectOk(
      await treasurerA.client.rpc('finance_record_entry', {
        p_entry_type: 'allocation', p_entry_date: todayIST(), p_amount: 5000, p_description: 'Committee allocation',
        p_project_id: project!.id,
      }),
    ) as string;
    const [row] = await sql<{ account_id: string | null; direction: string }>(
      'select account_id, direction from public.ledger_entries where id = $1',
      [id],
    );
    expect(row).toEqual({ account_id: null, direction: 'internal' });
  });
});

describe('donor self-reports', () => {
  it('creates a pending entry that a screenshot alone can never verify', async () => {
    const service = serviceClient();
    const ref = randomReference('UPI');
    const res = expectOk(
      await service.rpc('submit_donation_report', {
        p_amount: 1001, p_paid_on: daysAgo(1), p_payment_method: 'upi', p_transaction_reference: ref, p_donor_name: 'Kind Donor',
        p_donor_phone: randomPhone(), p_donor_email: null, p_is_anonymous: false, p_acknowledge_publicly: true,
        p_message: 'For school kits', p_client_submission_id: randomUUID(),
      }),
    ) as { result: string; entry_id: string };
    expect(res.result).toBe('created');
    expectOk(
      await service.rpc('attach_donation_report_evidence', {
        p_entry_id: res.entry_id, p_storage_path: `entries/${res.entry_id}/screenshot.png`, p_file_name: 'screenshot.png',
        p_mime_type: 'image/png', p_byte_size: 2000,
      }),
    );
    const [row] = await sql<{ status: string; account_id: string | null; source: string }>(
      'select status, account_id, source from public.ledger_entries where id = $1',
      [res.entry_id],
    );
    expect(row).toEqual({ status: 'pending', account_id: null, source: 'public_report' });

    expectFailure(await treasurerA.client.rpc('finance_verify_entry', { p_entry_id: res.entry_id, p_note: 'x' }), {
      hint: 'account_required',
    });
    expectFailure(await treasurerA.client.rpc('finance_verify_entry', { p_entry_id: res.entry_id, p_account_id: bankAccountId }), {
      hint: 'verification_note_required',
    });
    const ok = expectOk(
      await treasurerA.client.rpc('finance_verify_entry', {
        p_entry_id: res.entry_id, p_account_id: bankAccountId, p_note: 'Found in bank statement',
      }),
    ) as { receipt_number: string };
    expect(ok.receipt_number).toBeTruthy();

    const again = expectOk(
      await service.rpc('submit_donation_report', {
        p_amount: 1001, p_paid_on: daysAgo(1), p_payment_method: 'upi', p_transaction_reference: ref, p_donor_name: 'Kind Donor',
        p_donor_phone: randomPhone(), p_donor_email: null, p_is_anonymous: false, p_acknowledge_publicly: false, p_message: null,
        p_client_submission_id: randomUUID(),
      }),
    ) as { result: string };
    expect(again.result).toBe('already_reported');
  });

  it('is not callable by visitors directly', async () => {
    expectFailure(
      await anonClient().rpc('submit_donation_report', {
        p_amount: 1, p_paid_on: todayIST(), p_payment_method: 'upi', p_transaction_reference: 'ABCDEF1', p_donor_name: 'A B',
        p_donor_phone: randomPhone(), p_donor_email: null, p_is_anonymous: false, p_acknowledge_publicly: false, p_message: null,
        p_client_submission_id: randomUUID(),
      }),
      { code: '42501' },
    );
  });
});

describe('public financial reports', () => {
  it('requires independent approval and exposes only published aggregates', async () => {
    const id = expectOk(
      await treasurerA.client.rpc('finance_create_report', {
        p_title: 'Test period report', p_period_type: 'custom', p_start: daysAgo(30), p_end: daysAgo(1), p_narrative: 'Summary',
      }),
    ) as string;
    const anon = anonClient();
    expect(expectOk(await anon.from('financial_reports').select('id, title').eq('id', id))).toEqual([]);
    expectFailure(await treasurerA.client.rpc('finance_publish_report', { p_report_id: id }), {
      hint: 'independent_approval_required',
    });
    expectOk(await treasurerB.client.rpc('finance_publish_report', { p_report_id: id }));
    const published = expectOk(await anon.from('financial_reports').select('id, title, summary, status').eq('id', id)) as Array<{
      summary: Record<string, unknown>;
    }>;
    expect(published).toHaveLength(1);
    const summaryText = JSON.stringify(published[0]!.summary);
    expect(summaryText).not.toMatch(/Member One|Kind Donor|City Book Depot/);
    expect(published[0]!.summary).not.toHaveProperty('accounts');
    // Staff identities are not exposed to the public.
    expectFailure(await anon.from('financial_reports').select('prepared_by').eq('id', id), { code: '42501' });
    // Published reports are frozen.
    await expect(sql(`update public.financial_reports set narrative = 'changed' where id = $1`, [id])).rejects.toThrow(
      /cannot be edited/,
    );
    expectFailure(await treasurerA.client.rpc('finance_withdraw_report', { p_report_id: id, p_reason: 'Error found' }), {
      hint: 'forbidden',
    });
    const admin = await createUser(['admin'], 'repadmin');
    expectOk(await admin.client.rpc('finance_withdraw_report', { p_report_id: id, p_reason: 'Figures restated in a new report' }));
    expect(expectOk(await anon.from('financial_reports').select('id').eq('id', id))).toEqual([]);
  });
});

describe('financial audit trail', () => {
  it('lets treasurers read only financial audit entries', async () => {
    const rows = expectOk(await treasurerA.client.from('activity_logs').select('entity_type').limit(500)) as Array<{ entity_type: string }>;
    expect(rows.length).toBeGreaterThan(0);
    const allowed = new Set([
      'ledger_entries', 'donations', 'expenses', 'ledger_evidence', 'financial_accounts', 'reconciliations',
      'financial_reports', 'financial_report_documents', 'project_budgets',
    ]);
    expect(rows.every((r) => allowed.has(r.entity_type))).toBe(true);
  });

  it('never logs donor contact details', async () => {
    const logs = await sql<{ changes: unknown }>(`select changes from public.activity_logs where entity_type = 'donations'`);
    expect(JSON.stringify(logs)).not.toMatch(/\+91\d{10}/);
  });

  it('cannot be altered by anyone', async () => {
    await expect(sql('update public.activity_logs set action = $1 where id = (select max(id) from public.activity_logs)', ['x'])).rejects.toThrow(
      /cannot be modified/,
    );
    await expect(sql('delete from public.activity_logs where id = (select max(id) from public.activity_logs)')).rejects.toThrow();
  });
});
