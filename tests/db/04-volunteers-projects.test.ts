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

let admin: TestUser;
let publisher: TestUser;
let coordinator: TestUser;

beforeAll(async () => {
  admin = await createUser(['admin'], 'admin');
  publisher = await createUser(['publisher'], 'publisher');
  coordinator = await createUser(['volunteer_coordinator'], 'coord');
});

function volunteerSubmission(overrides: Record<string, unknown> = {}) {
  return {
    p_full_name: 'Priya Sharma',
    p_phone: randomPhone(),
    p_email: 'priya@example.org',
    p_village_id: null,
    p_locality: 'Station Road',
    p_is_adult: true,
    p_guardian_name: null,
    p_guardian_phone: null,
    p_skills: ['teaching_tutoring', 'first_aid'],
    p_skills_other: null,
    p_availability: ['weekends'],
    p_preferred_activities: ['education'],
    p_languages: 'Hindi, English',
    p_motivation: 'I want to help children in my village.',
    p_consent_contact: true,
    p_consent_public_recognition: false,
    p_client_submission_id: randomUUID(),
    ...overrides,
  };
}

async function newProject(client: TestUser['client'], overrides: Record<string, unknown> = {}) {
  return expectOk(
    await client
      .from('projects')
      .insert({
        slug: `project-${randomUUID().slice(0, 8)}`,
        title: 'School kit distribution',
        summary: 'Providing school kits to children who need them.',
        category: 'education',
        ...overrides,
      })
      .select('id, slug')
      .single(),
  ) as { id: string; slug: string };
}

describe('volunteer registration', () => {
  it('registers through the service role only and rejects duplicates by phone', async () => {
    const body = volunteerSubmission();
    expectFailure(await anonClient().rpc('submit_volunteer_registration', body), { code: '42501' });
    const res = expectOk(await serviceClient().rpc('submit_volunteer_registration', body)) as { result: string };
    expect(res.result).toBe('created');
    expect(expectOk(await serviceClient().rpc('submit_volunteer_registration', body))).toEqual({ result: 'replayed' });
    const dup = expectOk(
      await serviceClient().rpc('submit_volunteer_registration', { ...body, p_client_submission_id: randomUUID() }),
    );
    expect(dup).toEqual({ result: 'already_registered' });
  });

  it('requires guardian details for volunteers under 18', async () => {
    expectFailure(await serviceClient().rpc('submit_volunteer_registration', volunteerSubmission({ p_is_adult: false })), {
      hint: 'invalid:guardian',
    });
    const ok = expectOk(
      await serviceClient().rpc(
        'submit_volunteer_registration',
        volunteerSubmission({ p_is_adult: false, p_guardian_name: 'Sunita Sharma', p_guardian_phone: randomPhone() }),
      ),
    ) as { result: string };
    expect(ok.result).toBe('created');
  });

  it('rejects unknown skills and availability', async () => {
    expectFailure(await serviceClient().rpc('submit_volunteer_registration', volunteerSubmission({ p_skills: ['hacking'] })), {
      hint: 'invalid:skills',
    });
    expectFailure(await serviceClient().rpc('submit_volunteer_registration', volunteerSubmission({ p_availability: [] })), {
      hint: 'invalid:availability',
    });
  });

  it('keeps volunteer contact details private to coordinators and admins', async () => {
    const phone = randomPhone();
    expectOk(await serviceClient().rpc('submit_volunteer_registration', volunteerSubmission({ p_phone: phone })));
    const [row] = await sql<{ id: string }>('select id from public.volunteers where phone = $1', [`+91${phone}`]);
    for (const role of ['publisher', 'treasurer', 'assistance_reviewer'] as const) {
      const user = await createUser([role], role);
      expect(expectOk(await user.client.from('volunteers').select('id').eq('id', row!.id)), role).toEqual([]);
    }
    expect(expectOk(await coordinator.client.from('volunteers').select('phone').eq('id', row!.id))).toEqual([
      { phone: `+91${phone}` },
    ]);
    expectFailure(await anonClient().from('volunteers').select('id'), { code: '42501' });
  });
});

describe('assignments and volunteer self-service', () => {
  it('assigns only approved volunteers, and linked volunteers see just their own work', async () => {
    const phone = randomPhone();
    expectOk(await serviceClient().rpc('submit_volunteer_registration', volunteerSubmission({ p_phone: phone })));
    const [vol] = await sql<{ id: string }>('select id from public.volunteers where phone = $1', [`+91${phone}`]);
    const project = await newProject(coordinator.client);

    expectFailure(await coordinator.client.from('project_volunteers').insert({ project_id: project.id, volunteer_id: vol!.id }), {
      hint: 'volunteer_not_approved',
    });
    expectOk(await coordinator.client.from('volunteers').update({ status: 'approved' }).eq('id', vol!.id));
    const [reviewed] = await sql<{ reviewed_by: string }>('select reviewed_by from public.volunteers where id = $1', [vol!.id]);
    expect(reviewed?.reviewed_by).toBe(coordinator.id);
    expectOk(
      await coordinator.client
        .from('project_volunteers')
        .insert({ project_id: project.id, volunteer_id: vol!.id, role_description: 'Distribution helper' }),
    );

    // Coordinators cannot change a volunteer's public-recognition consent.
    expectFailure(await coordinator.client.from('volunteers').update({ consent_public_recognition: true }).eq('id', vol!.id), {
      code: '42501',
    });

    const volunteerUser = await createUser(['volunteer'], 'vol');
    expectFailure(await coordinator.client.rpc('link_volunteer_account', { p_volunteer_id: vol!.id, p_profile_id: volunteerUser.id }), {
      hint: 'forbidden',
    });
    expectOk(await admin.client.rpc('link_volunteer_account', { p_volunteer_id: vol!.id, p_profile_id: volunteerUser.id }));

    const mine = expectOk(await volunteerUser.client.from('volunteers').select('id, full_name'));
    expect(mine).toHaveLength(1);
    const assignments = expectOk(await volunteerUser.client.from('project_volunteers').select('project_id, status'));
    expect(assignments).toEqual([{ project_id: project.id, status: 'assigned' }]);
    // The assigned (unpublished) project is visible to them; other drafts are not.
    const other = await newProject(coordinator.client);
    const visible = expectOk(await volunteerUser.client.from('projects').select('id').in('id', [project.id, other.id]));
    expect(visible).toEqual([{ id: project.id }]);

    expectOk(await volunteerUser.client.rpc('respond_to_assignment', { p_project_id: project.id, p_response: 'confirmed' }));
    expectFailure(await volunteerUser.client.rpc('respond_to_assignment', { p_project_id: other.id, p_response: 'confirmed' }), {
      hint: 'not_found',
    });
    // RLS gives volunteers no UPDATE policy: the write silently affects no rows.
    await volunteerUser.client.from('project_volunteers').update({ status: 'completed' }).eq('project_id', project.id);
    const [assignment] = await sql<{ status: string }>(
      'select status from public.project_volunteers where project_id = $1 and volunteer_id = $2',
      [project.id, vol!.id],
    );
    expect(assignment?.status).toBe('confirmed');

    expectOk(
      await volunteerUser.client.rpc('update_my_volunteer_profile', {
        p_availability: ['weekends', 'remote'],
        p_skills: ['teaching_tutoring'],
        p_skills_other: null,
        p_preferred_activities: ['education'],
        p_languages: 'Hindi',
        p_consent_public_recognition: true,
      }),
    );
    const [after] = await sql<{ consent_public_recognition: boolean }>(
      'select consent_public_recognition from public.volunteers where id = $1',
      [vol!.id],
    );
    expect(after?.consent_public_recognition).toBe(true);
  });
});

describe('projects and publication', () => {
  it('lets coordinators draft but only publishers publish', async () => {
    const project = await newProject(coordinator.client);
    expectFailure(await coordinator.client.from('projects').update({ is_published: true }).eq('id', project.id), {
      hint: 'publisher_required',
    });
    expect(expectOk(await anonClient().from('projects').select('id').eq('id', project.id))).toEqual([]);

    expectOk(await publisher.client.from('projects').update({ is_published: true, is_featured: true }).eq('id', project.id));
    const [row] = await sql<{ published_by: string; published_at: string | null }>(
      'select published_by, published_at from public.projects where id = $1',
      [project.id],
    );
    expect(row?.published_by).toBe(publisher.id);
    expect(row?.published_at).not.toBeNull();
    expect(expectOk(await anonClient().from('projects').select('id, title').eq('id', project.id))).toHaveLength(1);

    // Once public, coordinators can no longer edit it.
    expectFailure(await coordinator.client.from('projects').update({ title: 'Changed title' }).eq('id', project.id), {
      hint: 'publisher_required',
    });
    // Unpublishing clears the featured flag automatically.
    expectOk(await publisher.client.from('projects').update({ is_published: false }).eq('id', project.id));
    const [unpub] = await sql<{ is_featured: boolean }>('select is_featured from public.projects where id = $1', [project.id]);
    expect(unpub?.is_featured).toBe(false);
  });

  it('enforces completion dates and date order', async () => {
    expectFailure(
      await publisher.client.from('projects').insert({
        slug: `bad-${randomUUID().slice(0, 6)}`, title: 'Bad dates', summary: 'Summary of the project', category: 'other',
        start_date: '2026-05-10', end_date: '2026-05-01',
      }),
      { code: '23514' },
    );
    expectFailure(
      await publisher.client.from('projects').insert({
        slug: `bad-${randomUUID().slice(0, 6)}`, title: 'No end date', summary: 'Summary of the project', category: 'other',
        status: 'completed',
      }),
      { code: '23514' },
    );
  });

  it('publishes only verified outcomes of published projects, without internal notes', async () => {
    const project = await newProject(publisher.client, { is_published: true });
    const outcome = expectOk(
      await coordinator.client
        .from('project_outcomes')
        .insert({ project_id: project.id, label: 'School kits distributed', quantity: 120, unit: 'kits', verification_note: 'Signed register' })
        .select('id')
        .single(),
    ) as { id: string };
    const anon = anonClient();
    expect(expectOk(await anon.from('project_outcomes').select('id, label').eq('id', outcome.id))).toEqual([]);
    expectFailure(await coordinator.client.from('project_outcomes').update({ is_verified: true }).eq('id', outcome.id), {
      hint: 'publisher_required',
    });
    expectOk(await publisher.client.from('project_outcomes').update({ is_verified: true, is_featured: true }).eq('id', outcome.id));
    expect(expectOk(await anon.from('project_outcomes').select('id, label, quantity').eq('id', outcome.id))).toHaveLength(1);
    expectFailure(await anon.from('project_outcomes').select('verification_note').eq('id', outcome.id), { code: '42501' });

    const impact = expectOk(await anon.rpc('get_public_impact_summary')) as { featured_outcomes: Array<{ id: string }> };
    expect(impact.featured_outcomes.some((o) => o.id === outcome.id)).toBe(true);
  });
});

describe('media consent workflow', () => {
  async function newMedia(user: TestUser, overrides: Record<string, unknown> = {}) {
    const id = randomUUID();
    return expectOk(
      await user.client
        .from('media_assets')
        .insert({
          id,
          private_path: `uploads/${id}.webp`,
          mime_type: 'image/webp',
          width: 1600,
          height: 1000,
          byte_size: 120000,
          uploaded_by: user.id,
          ...overrides,
        })
        .select('id')
        .single(),
    ) as { id: string };
  }

  it('starts every upload in review and blocks direct publication', async () => {
    expectFailure(
      await coordinator.client.from('media_assets').insert({
        id: randomUUID(), private_path: `uploads/${randomUUID()}.webp`, mime_type: 'image/webp', uploaded_by: coordinator.id,
        status: 'published', public_path: 'media/x.webp', alt_text: 'People at a camp',
      }),
      { hint: 'invalid_media_state' },
    );
    const media = await newMedia(coordinator);
    expectFailure(
      await publisher.client.from('media_assets').update({ status: 'published', public_path: 'media/x.webp' }).eq('id', media.id),
      { code: '42501' },
    );
  });

  it('requires alt text and informed consent before publishing photos of people', async () => {
    const media = await newMedia(coordinator);
    expectFailure(await publisher.client.rpc('media_prepare_publish', { p_media_id: media.id }), { hint: 'alt_text_required' });
    expectOk(await publisher.client.from('media_assets').update({ alt_text: 'Volunteers sorting school kits' }).eq('id', media.id));
    expectFailure(await publisher.client.rpc('media_prepare_publish', { p_media_id: media.id }), {
      hint: 'people_assessment_required',
    });
    expectOk(
      await publisher.client
        .from('media_assets')
        .update({ shows_identifiable_people: true, consent_status: 'pending' })
        .eq('id', media.id),
    );
    expectFailure(await publisher.client.rpc('media_prepare_publish', { p_media_id: media.id }), { hint: 'consent_required' });
    expectOk(
      await publisher.client
        .from('media_assets')
        .update({ consent_status: 'obtained', consent_notes: 'Signed consent form #12' })
        .eq('id', media.id),
    );
    const prep = expectOk(await publisher.client.rpc('media_prepare_publish', { p_media_id: media.id })) as { private_path: string };
    expect(prep.private_path).toBe(`uploads/${media.id}.webp`);
    expectFailure(await coordinator.client.rpc('media_prepare_publish', { p_media_id: media.id }), { hint: 'forbidden' });

    // Marking as published requires the public copy to exist.
    expectFailure(await publisher.client.rpc('media_mark_published', { p_media_id: media.id, p_public_path: `media/${media.id}.webp` }), {
      hint: 'public_copy_missing',
    });
    await sql(`insert into storage.objects (bucket_id, name, metadata) values ('media-public', $1, '{}')`, [`media/${media.id}.webp`]);
    expectOk(await publisher.client.rpc('media_mark_published', { p_media_id: media.id, p_public_path: `media/${media.id}.webp` }));

    const anon = anonClient();
    expect(expectOk(await anon.from('media_assets').select('id, public_path, alt_text').eq('id', media.id))).toHaveLength(1);
    expectFailure(await anon.from('media_assets').select('consent_notes').eq('id', media.id), { code: '42501' });

    // Consent cannot be withdrawn while the photo is public: it must be unpublished first.
    expectFailure(await publisher.client.from('media_assets').update({ consent_status: 'refused' }).eq('id', media.id), {
      code: '23514',
    });
    expectOk(await publisher.client.rpc('media_set_unpublished', { p_media_id: media.id, p_status: 'archived' }));
    expect(expectOk(await anon.from('media_assets').select('id').eq('id', media.id))).toEqual([]);
  });
});

describe('content and settings', () => {
  it('shows only public settings to visitors and validates payment details server-side', async () => {
    const anon = anonClient();
    const keys = (expectOk(await anon.from('site_settings').select('key')) as Array<{ key: string }>).map((r) => r.key).sort();
    expect(keys).toEqual(['contact', 'donation', 'organisation', 'social']);

    // Publishers have no UPDATE policy on settings: no rows are affected.
    const attempt = await publisher.client
      .from('site_settings')
      .update({ value: { accepting: true, upi_id: 'org@bank' } })
      .eq('key', 'donation')
      .select('key');
    expect(attempt.data ?? []).toEqual([]);
    const unchanged = await sql<{ value: { upi_id: string | null } }>(`select value from public.site_settings where key = 'donation'`);
    expect(unchanged[0]?.value.upi_id).toBeNull();

    expectFailure(
      await admin.client.from('site_settings').update({ value: { accepting: true, upi_id: 'not a upi id' } }).eq('key', 'donation'),
      { hint: 'invalid_setting' },
    );
    expectFailure(
      await admin.client
        .from('site_settings')
        .update({ value: { accepting: true, bank: { ifsc: 'BAD' } } })
        .eq('key', 'donation'),
      { hint: 'invalid_setting' },
    );
    expectFailure(
      await admin.client.from('site_settings').update({ value: { email: 'x@y.org', password: 'nope' } }).eq('key', 'contact'),
      { hint: 'invalid_setting' },
    );
    expectOk(
      await admin.client
        .from('site_settings')
        .update({ value: { phone: '+91 98765 43210', email: 'contact@example.org' } })
        .eq('key', 'contact'),
    );
    const log = await sql<{ actor_id: string }>(
      `select actor_id from public.activity_logs where entity_type = 'site_settings' and entity_id = 'contact' order by id desc limit 1`,
    );
    expect(log[0]?.actor_id).toBe(admin.id);
    // Restore the seeded empty state for other tests.
    await sql(`update public.site_settings set value = '{"phone": null, "whatsapp": null, "email": null, "address": null, "hours": null, "map_url": null}' where key = 'contact'`);
  });

  it('keeps drafts private and publishes versions', async () => {
    const anon = anonClient();
    expectOk(await publisher.client.from('site_content').update({ draft: { title: 'Draft about page' } }).eq('key', 'about'));
    expectFailure(await anon.from('site_content').select('draft').eq('key', 'about'), { code: '42501' });
    expectFailure(await coordinator.client.rpc('publish_site_content', { p_key: 'about' }), { hint: 'forbidden' });
    const version = expectOk(await publisher.client.rpc('publish_site_content', { p_key: 'about' })) as number;
    expect(version).toBeGreaterThan(0);
    const rows = expectOk(await anon.from('site_content').select('key, published, version').eq('key', 'about')) as Array<{
      published: { title: string };
    }>;
    expect(rows[0]?.published.title).toBe('Draft about page');
    expectFailure(await publisher.client.from('site_content').update({ published: { title: 'sneaky' } }).eq('key', 'about'), {
      code: '42501',
    });
    expectOk(await publisher.client.rpc('unpublish_site_content', { p_key: 'about' }));
    expect(expectOk(await anon.from('site_content').select('key').eq('key', 'about'))).toEqual([]);
  });
});

describe('rate limiting', () => {
  it('is service-role only and enforces the limit', async () => {
    const bucket = `test_rl:${randomUUID().replace(/-/g, '').slice(0, 32)}`;
    expectFailure(await anonClient().rpc('consume_rate_limit', { p_bucket: bucket, p_limit: 2, p_window_seconds: 60 }), {
      code: '42501',
    });
    const service = serviceClient();
    const results = [];
    for (let i = 0; i < 3; i += 1) {
      results.push(expectOk(await service.rpc('consume_rate_limit', { p_bucket: bucket, p_limit: 2, p_window_seconds: 60 })));
    }
    expect(results).toEqual([true, true, false]);
    expectFailure(await service.rpc('consume_rate_limit', { p_bucket: 'raw-ip:1.2.3.4', p_limit: 2, p_window_seconds: 60 }));
  });
});
