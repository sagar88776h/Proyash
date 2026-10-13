/**
 * End-to-end tests of the public-api edge function running under Deno in the
 * local stack (request → gateway → Deno → PostgREST → Postgres/Storage).
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, createUser, expectOk, randomPhone, randomReference, sql, stack } from '../helpers/stack';

afterAll(closePool);

const ORIGIN = 'http://127.0.0.1:4173';
const base = `${stack.apiUrl}/functions/v1/public-api`;

function ip() {
  return `198.51.100.${Math.floor(Math.random() * 250)}-${randomUUID().slice(0, 6)}`;
}

function meta() {
  return { client_submission_id: randomUUID(), started_at: Date.now() - 60_000, website: '' };
}

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': ip(), ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, headers: res.headers, body: (await res.json()) as Record<string, any> };
}

function assistanceBody(overrides: Record<string, unknown> = {}) {
  return {
    ...meta(),
    category: 'medical',
    urgency: 'standard',
    applicant_name: 'Meena Kumari',
    phone: randomPhone(),
    email: '',
    village_id: '',
    locality: 'Upper hamlet, near the temple',
    description: 'My father needs help with the cost of cataract surgery next month.',
    relationship: 'family_member',
    preferred_contact: 'whatsapp',
    consent: true,
    ...overrides,
  };
}

describe('transport and CORS', () => {
  it('reports health', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
  });

  it('answers preflight requests only for allowed origins', async () => {
    const ok = await fetch(`${base}/assistance`, { method: 'OPTIONS', headers: { origin: ORIGIN } });
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    const bad = await fetch(`${base}/assistance`, { method: 'OPTIONS', headers: { origin: 'https://evil.example' } });
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('rejects requests from other websites', async () => {
    const res = await post('/assistance', assistanceBody(), { origin: 'https://evil.example' });
    expect(res.status).toBe(403);
  });

  it('rejects unsupported formats and oversized bodies', async () => {
    const text = await fetch(`${base}/assistance`, {
      method: 'POST', headers: { 'content-type': 'text/plain', origin: ORIGIN }, body: 'hello',
    });
    expect(text.status).toBe(415);
    const big = await post('/assistance', assistanceBody({ description: 'x'.repeat(40_000) }));
    expect(big.status).toBe(413);
  });

  it('returns 404 for unknown routes and 405 for wrong methods', async () => {
    expect((await post('/nope', {})).status).toBe(404);
    expect((await fetch(`${base}/assistance`, { headers: { origin: ORIGIN } })).status).toBe(405);
  });
});

describe('assistance requests', () => {
  it('creates a private request and returns a reference number', async () => {
    const body = assistanceBody();
    const res = await post('/assistance', body);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, result: 'created' });
    expect(res.body.reference_code).toMatch(/^PRY-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const [row] = await sql<{ status: string; preferred_contact: string }>(
      'select status, preferred_contact from public.assistance_requests where reference_code = $1',
      [res.body.reference_code],
    );
    expect(row).toEqual({ status: 'pending', preferred_contact: 'whatsapp' });

    // Retrying the exact same submission does not create a duplicate.
    const again = await post('/assistance', body);
    expect(again.body.reference_code).toBe(res.body.reference_code);
  });

  it('returns field errors for invalid input', async () => {
    const res = await post('/assistance', assistanceBody({ phone: '123', description: 'short', consent: false }));
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['consent', 'description', 'phone']);
  });

  it('silently discards honeypot submissions', async () => {
    const phone = randomPhone();
    const res = await post('/assistance', assistanceBody({ phone, website: 'http://spam.example' }));
    expect(res.body).toEqual({ ok: true, result: 'received' });
    const rows = await sql('select 1 from public.assistance_requests where phone = $1', [`+91${phone}`]);
    expect(rows).toEqual([]);
  });

  it('asks bots that submit instantly to slow down', async () => {
    const res = await post('/assistance', assistanceBody({ started_at: Date.now() }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('too_fast');
  });

  it('rate limits repeated submissions from one connection', async () => {
    const sameIp = `203.0.113.${Math.floor(Math.random() * 250)}`;
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push((await post('/assistance', assistanceBody(), { 'cf-connecting-ip': sameIp })).status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 200)).toBe(true);
    expect(statuses[5]).toBe(429);
  });

  it('looks up status with reference + phone and accepts follow-up files', async () => {
    const phone = randomPhone();
    const created = await post('/assistance', assistanceBody({ phone }));
    const reference = created.body.reference_code as string;

    const wrong = await post('/assistance/status', { reference_code: reference, phone: randomPhone() });
    expect(wrong.status).toBe(404);
    const status = await post('/assistance/status', { reference_code: reference.replace(/-/g, ' ').toLowerCase(), phone });
    expect(status.body.status).toMatchObject({ found: true, status: 'pending', can_follow_up: false });

    // A reviewer asks for more information.
    const reviewer = await createUser(['assistance_reviewer'], 'rev');
    const [req] = await sql<{ id: string }>('select id from public.assistance_requests where reference_code = $1', [reference]);
    expectOk(
      await reviewer.client.rpc('assistance_change_status', {
        p_request_id: req!.id, p_new_status: 'more_information_required', p_reason: 'Need prescription',
        p_applicant_message: 'Please upload the doctor\'s prescription.',
      }),
    );

    const form = (file?: Blob, name = 'prescription.png') => {
      const fd = new FormData();
      fd.set('payload', JSON.stringify({ ...meta(), reference_code: reference, phone, message: 'Prescription attached.' }));
      if (file) fd.set('file', file, name);
      return fd;
    };
    // A text file disguised as an image is rejected (content is sniffed, not trusted).
    const disguised = await fetch(`${base}/assistance/follow-up`, {
      method: 'POST', headers: { origin: ORIGIN, 'cf-connecting-ip': ip() },
      body: form(new Blob(['not really an image'], { type: 'image/png' })),
    });
    expect(disguised.status).toBe(422);

    const png = new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4])], { type: 'image/png' });
    const ok = await fetch(`${base}/assistance/follow-up`, {
      method: 'POST', headers: { origin: ORIGIN, 'cf-connecting-ip': ip() }, body: form(png, '../../etc/passwd.png'),
    });
    expect(ok.status).toBe(200);
    const [followup] = await sql<{ attachment_path: string; attachment_name: string; attachment_mime: string }>(
      'select attachment_path, attachment_name, attachment_mime from public.assistance_followups where request_id = $1',
      [req!.id],
    );
    expect(followup?.attachment_path.startsWith(`${req!.id}/`)).toBe(true);
    expect(followup?.attachment_name).not.toContain('/');
    expect(followup?.attachment_mime).toBe('image/png');
    const [obj] = await sql('select 1 as ok from storage.objects where bucket_id = $1 and name = $2', [
      'assistance-files', followup!.attachment_path,
    ]);
    expect(obj).toEqual({ ok: 1 });

    const after = await post('/assistance/status', { reference_code: reference, phone });
    expect(after.body.status.status).toBe('under_review');
  });
});

describe('volunteers, contact and donation reports', () => {
  it('registers volunteers once per phone number', async () => {
    const body = {
      ...meta(), full_name: 'Arjun Das', phone: randomPhone(), email: 'arjun@example.org', village_id: '',
      locality: 'Bazaar Road', is_adult: true, skills: ['logistics'], availability: ['weekends'],
      preferred_activities: ['food_security'], consent_contact: true, consent_public_recognition: false,
    };
    expect((await post('/volunteer', body)).body).toEqual({ ok: true, result: 'created' });
    expect((await post('/volunteer', { ...body, client_submission_id: randomUUID() })).body).toEqual({
      ok: true, result: 'already_registered',
    });
  });

  it('stores contact messages for administrators', async () => {
    const subject = `Question ${randomUUID().slice(0, 6)}`;
    const res = await post('/contact', { ...meta(), name: 'Visitor', email: 'visitor@example.org', subject, message: 'How can our school partner with you?' });
    expect(res.body).toEqual({ ok: true, result: 'received' });
    const [row] = await sql<{ status: string }>('select status from public.contact_messages where subject = $1', [subject]);
    expect(row?.status).toBe('new');
  });

  it('records donation reports as pending with the screenshot as evidence', async () => {
    const reference = randomReference('UPI');
    const fd = new FormData();
    fd.set('payload', JSON.stringify({
      ...meta(), amount: '501', paid_on: new Date().toISOString().slice(0, 10), payment_method: 'upi',
      transaction_reference: reference, is_anonymous: false, donor_name: 'Well Wisher', donor_phone: randomPhone(),
      acknowledge_publicly: false, message: 'For the food drive',
    }));
    const jpeg = new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70])], { type: 'image/jpeg' });
    fd.set('file', jpeg, 'payment.jpg');
    const res = await fetch(`${base}/donation-report`, { method: 'POST', headers: { origin: ORIGIN, 'cf-connecting-ip': ip() }, body: fd });
    const body = await res.json();
    expect(body).toEqual({ ok: true, result: 'created', evidence_saved: true });
    const [entry] = await sql<{ id: string; status: string; source: string }>(
      'select id, status, source from public.ledger_entries where transaction_reference = $1',
      [reference],
    );
    expect(entry).toMatchObject({ status: 'pending', source: 'public_report' });
    const evidence = await sql<{ kind: string }>('select kind from public.ledger_evidence where ledger_entry_id = $1', [entry!.id]);
    expect(evidence).toEqual([{ kind: 'payment_screenshot' }]);
  });
});

describe('privacy of logs', () => {
  it('never writes submitted personal data to function logs', async () => {
    const phone = randomPhone();
    await post('/assistance', assistanceBody({ phone, applicant_name: 'Unique Logname Person' }));
    await post('/assistance', assistanceBody({ phone: 'bad', applicant_name: 'Another Logname Person' }));
    const log = readFileSync(join(process.cwd(), '.local-stack', 'logs', 'fn-public-api.log'), 'utf8');
    expect(log).not.toContain(phone);
    expect(log).not.toContain('Logname');
  });
});
