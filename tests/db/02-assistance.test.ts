import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  closePool,
  createUser,
  expectFailure,
  expectOk,
  randomPhone,
  serviceClient,
  sql,
  type TestUser,
} from '../helpers/stack';

afterAll(closePool);

function submission(overrides: Record<string, unknown> = {}) {
  return {
    p_category: 'education',
    p_urgency: 'standard',
    p_applicant_name: 'Asha Devi',
    p_phone: randomPhone(),
    p_email: null,
    p_village_id: null,
    p_locality: 'Ward 4, near the primary school',
    p_description: 'My daughter needs school fees and books for class 9 this year.',
    p_relationship: 'self',
    p_preferred_contact: 'phone_call',
    p_consent: true,
    p_client_submission_id: randomUUID(),
    ...overrides,
  };
}

describe('public submission (service role via public-api)', () => {
  it('is not callable by anonymous visitors or signed-in users', async () => {
    expectFailure(await anonClient().rpc('submit_assistance_request', submission()), { code: '42501' });
    const user = await createUser(['assistance_reviewer'], 'rev');
    expectFailure(await user.client.rpc('submit_assistance_request', submission()), { code: '42501' });
  });

  it('creates a pending private request with a unique reference', async () => {
    const result = expectOk(await serviceClient().rpc('submit_assistance_request', submission())) as {
      result: string;
      reference_code: string;
    };
    expect(result.result).toBe('created');
    expect(result.reference_code).toMatch(/^PRY-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const [row] = await sql<{ status: string; phone: string }>(
      'select status, phone from public.assistance_requests where reference_code = $1',
      [result.reference_code],
    );
    expect(row?.status).toBe('pending');
    expect(row?.phone).toMatch(/^\+91\d{10}$/);
  });

  it('replays an identical submission instead of duplicating it', async () => {
    const body = submission();
    const first = expectOk(await serviceClient().rpc('submit_assistance_request', body)) as { reference_code: string };
    const second = expectOk(await serviceClient().rpc('submit_assistance_request', body)) as {
      result: string;
      reference_code: string;
    };
    expect(second.result).toBe('replayed');
    expect(second.reference_code).toBe(first.reference_code);
  });

  it('refuses a second open request for the same phone and category without revealing the first', async () => {
    const phone = randomPhone();
    expectOk(await serviceClient().rpc('submit_assistance_request', submission({ p_phone: phone })));
    const dup = expectOk(
      await serviceClient().rpc('submit_assistance_request', submission({ p_phone: `+91 ${phone}` })),
    ) as Record<string, unknown>;
    expect(dup).toEqual({ result: 'duplicate_open_request' });
    // A different category is a separate need and is accepted.
    const other = expectOk(
      await serviceClient().rpc('submit_assistance_request', submission({ p_phone: phone, p_category: 'medical' })),
    ) as { result: string };
    expect(other.result).toBe('created');
  });

  it.each([
    [{ p_consent: false }, 'invalid:consent'],
    [{ p_applicant_name: 'A' }, 'invalid:applicant_name'],
    [{ p_phone: '12345' }, 'invalid:phone'],
    [{ p_email: 'not-an-email' }, 'invalid:email'],
    [{ p_locality: '' }, 'invalid:locality'],
    [{ p_description: 'too short' }, 'invalid:description'],
  ])('validates input server-side: %o', async (override, hint) => {
    expectFailure(await serviceClient().rpc('submit_assistance_request', submission(override)), { hint });
  });
});

describe('reviewer workflow', () => {
  let reviewer: TestUser;
  let reference: string;
  let phone: string;
  let requestId: string;

  beforeAll(async () => {
    reviewer = await createUser(['assistance_reviewer'], 'reviewer');
    phone = randomPhone();
    const res = expectOk(await serviceClient().rpc('submit_assistance_request', submission({ p_phone: phone }))) as {
      reference_code: string;
    };
    reference = res.reference_code;
    const [row] = await sql<{ id: string }>('select id from public.assistance_requests where reference_code = $1', [reference]);
    requestId = row!.id;
  });

  it('is invisible to every role except reviewers and admins', async () => {
    for (const role of ['treasurer', 'publisher', 'volunteer_coordinator', 'volunteer'] as const) {
      const user = await createUser([role], role);
      const rows = expectOk(await user.client.from('assistance_requests').select('id').eq('id', requestId));
      expect(rows, role).toEqual([]);
      const notes = expectOk(await user.client.from('assistance_request_notes').select('id').eq('request_id', requestId));
      expect(notes, role).toEqual([]);
    }
    expectFailure(await anonClient().from('assistance_requests').select('id'), { code: '42501' });
    const rows = expectOk(await reviewer.client.from('assistance_requests').select('id, applicant_name').eq('id', requestId));
    expect(rows).toHaveLength(1);
  });

  it('cannot be edited directly, even by reviewers', async () => {
    expectFailure(await reviewer.client.from('assistance_requests').update({ status: 'approved' }).eq('id', requestId), {
      code: '42501',
    });
    expectFailure(await reviewer.client.from('assistance_requests').delete().eq('id', requestId), { code: '42501' });
  });

  it('enforces the status workflow', async () => {
    expectFailure(
      await reviewer.client.rpc('assistance_change_status', { p_request_id: requestId, p_new_status: 'assistance_provided' }),
      { hint: 'invalid_transition' },
    );
    expectOk(await reviewer.client.rpc('assistance_change_status', { p_request_id: requestId, p_new_status: 'under_review' }));
    expectFailure(
      await reviewer.client.rpc('assistance_change_status', {
        p_request_id: requestId,
        p_new_status: 'more_information_required',
        p_reason: 'Need fee receipt',
      }),
      { hint: 'applicant_message_required' },
    );
    expectOk(
      await reviewer.client.rpc('assistance_change_status', {
        p_request_id: requestId,
        p_new_status: 'more_information_required',
        p_reason: 'Need the school fee receipt',
        p_applicant_message: 'Please share the school fee receipt.',
      }),
    );
    const history = expectOk(
      await reviewer.client.from('assistance_status_history').select('from_status, to_status').eq('request_id', requestId).order('id'),
    );
    expect(history!.map((h) => h.to_status)).toEqual(['pending', 'under_review', 'more_information_required']);
  });

  it('only shows applicants coarse status when both reference and phone match', async () => {
    const service = serviceClient();
    const wrong = expectOk(await service.rpc('assistance_status_lookup', { p_reference_code: reference, p_phone: randomPhone() }));
    expect(wrong).toEqual({ found: false });
    const right = expectOk(
      await service.rpc('assistance_status_lookup', { p_reference_code: reference.toLowerCase(), p_phone: `0${phone}` }),
    ) as Record<string, unknown>;
    expect(right.found).toBe(true);
    expect(right.status).toBe('more_information_required');
    expect(right.applicant_message).toBe('Please share the school fee receipt.');
    expect(right.can_follow_up).toBe(true);
    expect(right).not.toHaveProperty('applicant_name');
    expect(right).not.toHaveProperty('description');
  });

  it('accepts applicant follow-up and moves the request back to review', async () => {
    const service = serviceClient();
    const target = expectOk(await service.rpc('assistance_followup_target', { p_reference_code: reference, p_phone: phone }));
    expect(target).toBe(requestId);
    expectOk(await service.rpc('assistance_add_followup', { p_request_id: requestId, p_message: 'Receipt sent by WhatsApp.' }));
    const [row] = await sql<{ status: string; has_unread_followup: boolean }>(
      'select status, has_unread_followup from public.assistance_requests where id = $1',
      [requestId],
    );
    expect(row).toEqual({ status: 'under_review', has_unread_followup: true });
    expectFailure(await service.rpc('assistance_add_followup', { p_request_id: requestId, p_message: 'again' }), {
      hint: 'followup_not_allowed',
    });
  });

  it('lets reviewers add internal notes but not impersonate other authors', async () => {
    expectOk(await reviewer.client.from('assistance_request_notes').insert({ request_id: requestId, body: 'Called the family.' }));
    const other = await createUser(['assistance_reviewer'], 'rev2');
    expectFailure(
      await reviewer.client.from('assistance_request_notes').insert({ request_id: requestId, body: 'x', author_id: other.id }),
      { code: '42501' },
    );
    const treasurer = await createUser(['treasurer'], 'tr');
    expectFailure(await treasurer.client.from('assistance_request_notes').insert({ request_id: requestId, body: 'x' }), {
      code: '42501',
    });
  });

  it('never writes personal content to the audit log', async () => {
    const logs = await sql<{ changes: unknown }>(
      `select changes from public.activity_logs where entity_type in ('assistance_requests','assistance_request_notes','assistance_followups') and entity_id = $1
       union all
       select changes from public.activity_logs where entity_type = 'assistance_request_notes' and changes::text like $2`,
      [requestId, `%${requestId}%`],
    );
    expect(logs.length).toBeGreaterThan(0);
    const text = JSON.stringify(logs);
    expect(text).not.toContain('Asha');
    expect(text).not.toContain(phone);
    expect(text).not.toContain('school fees');
    expect(text).not.toContain('Called the family');
  });

  it('allows admins to redact closed requests, and only closed ones', async () => {
    const admin = await createUser(['admin'], 'adm');
    expectFailure(await admin.client.rpc('assistance_redact', { p_request_id: requestId }), { hint: 'not_closed' });
    expectOk(await reviewer.client.rpc('assistance_change_status', { p_request_id: requestId, p_new_status: 'approved' }));
    expectOk(await reviewer.client.rpc('assistance_change_status', { p_request_id: requestId, p_new_status: 'assistance_provided' }));
    expectFailure(await reviewer.client.rpc('assistance_redact', { p_request_id: requestId }), { hint: 'forbidden' });
    expectOk(await admin.client.rpc('assistance_redact', { p_request_id: requestId }));
    const [row] = await sql<Record<string, unknown>>(
      'select applicant_name, phone, description, status, category from public.assistance_requests where id = $1',
      [requestId],
    );
    expect(row).toEqual({ applicant_name: null, phone: null, description: '[redacted]', status: 'assistance_provided', category: 'education' });
    const notes = await sql<{ body: string }>('select body from public.assistance_request_notes where request_id = $1', [requestId]);
    expect(notes.every((n) => n.body === '[redacted]')).toBe(true);
    expectFailure(
      await reviewer.client.rpc('assistance_change_status', { p_request_id: requestId, p_new_status: 'under_review' }),
      { hint: 'redacted' },
    );
  });

  it('records phone/in-person requests entered by staff', async () => {
    const res = expectOk(
      await reviewer.client.rpc('assistance_create_staff_entry', {
        p_category: 'food',
        p_urgency: 'urgent',
        p_applicant_name: 'Ramesh Kumar',
        p_phone: randomPhone(),
        p_email: null,
        p_village_id: null,
        p_locality: 'Lower hamlet',
        p_description: 'Family of five without food supplies after flooding.',
        p_relationship: 'neighbour',
        p_preferred_contact: 'phone_call',
        p_consent_confirmed: true,
      }),
    ) as { result: string; id: string };
    expect(res.result).toBe('created');
    const [row] = await sql<{ source: string; recorded_by: string }>(
      'select source, recorded_by from public.assistance_requests where id = $1',
      [res.id],
    );
    expect(row).toEqual({ source: 'staff_entry', recorded_by: reviewer.id });
  });

  it('only assigns active reviewers', async () => {
    const publisher = await createUser(['publisher'], 'pub');
    const [{ id }] = (await sql<{ id: string }>(
      `select id from public.assistance_requests where redacted_at is null order by created_at desc limit 1`,
    )) as [{ id: string }];
    expectFailure(await reviewer.client.rpc('assistance_assign', { p_request_id: id, p_reviewer_id: publisher.id }), {
      hint: 'invalid_reviewer',
    });
    expectOk(await reviewer.client.rpc('assistance_assign', { p_request_id: id, p_reviewer_id: reviewer.id }));
  });
});
