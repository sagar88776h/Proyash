/**
 * End-to-end tests of the staff-api edge function and the real Supabase Auth
 * email flows (invitation, password recovery) in the local stack.
 */
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonClient, closePool, createUser, expectOk, randomPhone, serviceClient, sql, stack, type TestUser } from '../helpers/stack';

afterAll(closePool);

const ORIGIN = 'http://127.0.0.1:4173';
const base = `${stack.apiUrl}/functions/v1/staff-api`;
const MAIL = 'http://127.0.0.1:54324/messages';

async function call(user: TestUser | null, path: string, body: unknown, token?: string) {
  const jwt = token ?? (user ? (await user.client.auth.getSession()).data.session?.access_token : undefined);
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...(jwt ? { authorization: `Bearer ${jwt}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

async function latestEmail(to: string, subject: RegExp) {
  for (let i = 0; i < 40; i += 1) {
    const messages = (await (await fetch(`${MAIL}?to=${encodeURIComponent(to)}`)).json()) as Array<{ subject: string; html: string }>;
    const match = messages.find((m) => subject.test(m.subject));
    if (match) return match;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No email "${subject}" for ${to}`);
}

function tokenFrom(html: string, type: string) {
  const decoded = html.replace(/&amp;/g, '&');
  const m = decoded.match(/\/admin\/auth\/confirm\?token_hash=([^&"]+)&type=([a-z_]+)/);
  expect(m?.[2]).toBe(type);
  return m![1]!;
}

function freshClient() {
  return createClient(stack.apiUrl, stack.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

let admin: TestUser;
let publisher: TestUser;

beforeAll(async () => {
  admin = await createUser(['admin'], 'admin');
  publisher = await createUser(['publisher'], 'publisher');
});

describe('authentication of staff-api calls', () => {
  it('requires a valid session', async () => {
    expect((await call(null, '/users/invite', {})).status).toBe(401);
    expect((await call(null, '/users/invite', {}, 'not-a-token')).status).toBe(401);
    // The anon key is not a user session.
    expect((await call(null, '/users/invite', { email: 'a@b.org', full_name: 'A B', roles: ['volunteer'] }, stack.anonKey)).status).toBe(401);
  });
});

describe('inviting staff and accepting the invitation', () => {
  it('lets only admins invite, sends a working invitation link and grants roles', async () => {
    const email = `invitee-${randomUUID().slice(0, 8)}@test.prayash.local`;
    const denied = await call(publisher, '/users/invite', { email, full_name: 'New Person', roles: ['treasurer'] });
    expect(denied.status).toBe(403);

    const res = await call(admin, '/users/invite', { email, full_name: 'New Person', roles: ['treasurer'] });
    expect(res.status).toBe(200);
    expect(res.body.roles).toEqual(['treasurer']);
    const [profile] = await sql<{ full_name: string }>('select full_name from public.profiles where id = $1', [res.body.user_id]);
    expect(profile?.full_name).toBe('New Person');

    const mail = await latestEmail(email, /invited/i);
    const tokenHash = tokenFrom(mail.html, 'invite');
    const client = freshClient();
    const verified = await client.auth.verifyOtp({ token_hash: tokenHash, type: 'invite' });
    expect(verified.error).toBeNull();
    const newPassword = `Pw-${randomUUID()}`;
    expect((await client.auth.updateUser({ password: newPassword })).error).toBeNull();

    const signIn = await freshClient().auth.signInWithPassword({ email, password: newPassword });
    expect(signIn.error).toBeNull();
    // Invitation links are single-use.
    expect((await freshClient().auth.verifyOtp({ token_hash: tokenHash, type: 'invite' })).error).not.toBeNull();

    const again = await call(admin, '/users/invite', { email, full_name: 'New Person', roles: ['treasurer'] });
    expect(again.status).toBe(409);
  });

  it('validates invitation input', async () => {
    const res = await call(admin, '/users/invite', { email: 'nope', full_name: 'X', roles: [] });
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['email', 'full_name', 'roles']);
    const badRole = await call(admin, '/users/invite', { email: 'a@b.org', full_name: 'Ab Cd', roles: ['superuser'] });
    expect(badRole.status).toBe(422);
  });
});

describe('password recovery', () => {
  it('resets a password through the emailed link', async () => {
    const user = await createUser(['publisher'], 'forgetful');
    const client = freshClient();
    expect((await client.auth.resetPasswordForEmail(user.email, { redirectTo: `${ORIGIN}/admin/auth/confirm` })).error).toBeNull();
    const mail = await latestEmail(user.email, /reset/i);
    const tokenHash = tokenFrom(mail.html, 'recovery');
    expect((await client.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })).error).toBeNull();
    const newPassword = `Pw-${randomUUID()}`;
    expect((await client.auth.updateUser({ password: newPassword })).error).toBeNull();
    expect((await freshClient().auth.signInWithPassword({ email: user.email, password: user.password })).error).not.toBeNull();
    expect((await freshClient().auth.signInWithPassword({ email: user.email, password: newPassword })).error).toBeNull();
  });

  it('does not reveal whether an email address has an account', async () => {
    const res = await freshClient().auth.resetPasswordForEmail(`nobody-${randomUUID()}@test.prayash.local`);
    expect(res.error).toBeNull();
  });

  it('refuses public sign-up', async () => {
    const res = await freshClient().auth.signUp({ email: `self-${randomUUID().slice(0, 6)}@test.prayash.local`, password: `Pw-${randomUUID()}` });
    expect(res.error).not.toBeNull();
  });
});

describe('deactivating accounts', () => {
  it('blocks the database immediately and ends future sign-ins', async () => {
    const user = await createUser(['treasurer'], 'leaving');
    expect((await call(user, '/users/set-active', { user_id: admin.id, active: false })).status).toBe(403);
    const res = await call(admin, '/users/set-active', { user_id: user.id, active: false });
    expect(res.body).toEqual({ ok: true, sessions_revoked: true });
    expect(expectOk(await user.client.rpc('my_roles'))).toEqual([]);
    expect((await freshClient().auth.signInWithPassword({ email: user.email, password: user.password })).error).not.toBeNull();
    expect((await call(admin, '/users/set-active', { user_id: user.id, active: true })).status).toBe(200);
    expect((await freshClient().auth.signInWithPassword({ email: user.email, password: user.password })).error).toBeNull();
  });
});

describe('publishing photos', () => {
  it('copies only consented, described photos to the public bucket and removes them on unpublish', async () => {
    const coordinator = await createUser(['volunteer_coordinator'], 'coord');
    const id = randomUUID();
    const privatePath = `uploads/${id}.png`;
    const png = new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 9, 9, 9, 9])], { type: 'image/png' });
    expect((await coordinator.client.storage.from('media-private').upload(privatePath, png)).error).toBeNull();
    expectOk(
      await coordinator.client.from('media_assets').insert({
        id, private_path: privatePath, mime_type: 'image/png', byte_size: png.size, uploaded_by: coordinator.id,
      }),
    );

    expect((await call(coordinator, '/media/publish', { media_id: id })).status).toBe(403);
    const blocked = await call(publisher, '/media/publish', { media_id: id });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('alt_text_required');

    expectOk(
      await publisher.client
        .from('media_assets')
        .update({ alt_text: 'Volunteers packing food kits', shows_identifiable_people: false, consent_status: 'not_required' })
        .eq('id', id),
    );
    const published = await call(publisher, '/media/publish', { media_id: id });
    expect(published.status).toBe(200);
    const publicUrl = anonClient().storage.from('media-public').getPublicUrl(published.body.public_path).data.publicUrl;
    expect((await fetch(publicUrl)).status).toBe(200);

    expect((await call(publisher, '/media/unpublish', { media_id: id, status: 'archived' })).status).toBe(200);
    expect((await fetch(publicUrl)).status).not.toBe(200);
    const [row] = await sql<{ status: string; public_path: string | null }>(
      'select status, public_path from public.media_assets where id = $1',
      [id],
    );
    expect(row).toEqual({ status: 'archived', public_path: null });
  });
});

describe('redacting assistance requests', () => {
  it('deletes attached files along with the personal data', async () => {
    const phone = randomPhone();
    const service = serviceClient();
    const created = expectOk(
      await service.rpc('submit_assistance_request', {
        p_category: 'food', p_urgency: 'standard', p_applicant_name: 'Lata Bai', p_phone: phone, p_email: null,
        p_village_id: null, p_locality: 'Riverside', p_description: 'We need ration support for this month please.',
        p_relationship: 'self', p_preferred_contact: 'phone_call', p_consent: true, p_client_submission_id: randomUUID(),
      }),
    ) as { reference_code: string };
    const [req] = await sql<{ id: string }>('select id from public.assistance_requests where reference_code = $1', [created.reference_code]);
    const filePath = `${req!.id}/${randomUUID()}.pdf`;
    await service.storage.from('assistance-files').upload(filePath, new Blob(['%PDF-1.4 x'], { type: 'application/pdf' }));
    await sql(`update public.assistance_requests set status = 'more_information_required' where id = $1`, [req!.id]);
    expectOk(
      await service.rpc('assistance_add_followup', {
        p_request_id: req!.id, p_message: 'Ration card attached', p_attachment_path: filePath, p_attachment_name: 'card.pdf',
        p_attachment_mime: 'application/pdf', p_attachment_size: 10,
      }),
    );
    const reviewer = await createUser(['assistance_reviewer'], 'rev');
    expectOk(await reviewer.client.rpc('assistance_change_status', { p_request_id: req!.id, p_new_status: 'declined', p_reason: 'Duplicate' }));

    expect((await call(reviewer, '/assistance/redact', { request_id: req!.id })).status).toBe(403);
    const res = await call(admin, '/assistance/redact', { request_id: req!.id });
    expect(res.body).toEqual({ ok: true, files_removed: 1 });
    const left = await sql('select 1 from storage.objects where bucket_id = $1 and name = $2', ['assistance-files', filePath]);
    expect(left).toEqual([]);
  });
});
