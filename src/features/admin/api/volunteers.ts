import { sanitizeSearch } from '@/lib/api/public';
import { unwrap } from '@/lib/errors';
import type { Enums, Tables, TablesUpdate } from '@/types/database';
import { db } from '../components/db';

export type VolunteerRow = Pick<
  Tables<'volunteers'>,
  'id' | 'full_name' | 'phone' | 'status' | 'skills' | 'availability' | 'created_at' | 'is_adult' | 'locality' | 'profile_id'
> & { village: { name: string } | null };

export async function listVolunteers(f: {
  status?: Enums<'volunteer_status'> | '';
  skill?: string;
  availability?: string;
  search?: string;
  page: number;
  pageSize: number;
}) {
  let q = db()
    .from('volunteers')
    .select('id, full_name, phone, status, skills, availability, created_at, is_adult, locality, profile_id, village:villages(name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((f.page - 1) * f.pageSize, f.page * f.pageSize - 1);
  if (f.status) q = q.eq('status', f.status);
  if (f.skill) q = q.contains('skills', [f.skill]);
  if (f.availability) q = q.contains('availability', [f.availability]);
  const s = f.search ? sanitizeSearch(f.search) : '';
  if (s) {
    const digits = s.replace(/\D/g, '');
    q = q.or([`full_name.ilike.%${s}%`, ...(digits.length >= 5 ? [`phone.ilike.%${digits.slice(-10)}%`] : [])].join(','));
  }
  const res = await q;
  return { rows: (unwrap(res) ?? []) as unknown as VolunteerRow[], count: res.count ?? 0 };
}

export type AssignmentRow = Tables<'project_volunteers'> & { project: { id: string; title: string; status: Enums<'project_status'>; start_date: string | null } | null };

export async function getVolunteer(id: string) {
  const client = db();
  const [vol, assignments] = await Promise.all([
    client
      .from('volunteers')
      .select('*, village:villages(name), reviewer:profiles!volunteers_reviewed_by_fkey(full_name), account:profiles!volunteers_profile_id_fkey(full_name, email)')
      .eq('id', id)
      .maybeSingle(),
    client
      .from('project_volunteers')
      .select('*, project:projects(id, title, status, start_date)')
      .eq('volunteer_id', id)
      .order('assigned_at', { ascending: false }),
  ]);
  return {
    volunteer: unwrap(vol) as
      | (Tables<'volunteers'> & {
          village: { name: string } | null;
          reviewer: { full_name: string } | null;
          account: { full_name: string; email: string | null } | null;
        })
      | null,
    assignments: (unwrap(assignments) ?? []) as unknown as AssignmentRow[],
  };
}

export async function updateVolunteer(id: string, changes: TablesUpdate<'volunteers'>) {
  unwrap(await db().from('volunteers').update(changes).eq('id', id));
}

export async function listAssignableProjects() {
  return (unwrap(
    await db().from('projects').select('id, title, status').not('status', 'in', '(cancelled,completed)').order('title'),
  ) ?? []) as Array<{ id: string; title: string; status: Enums<'project_status'> }>;
}

export async function assignVolunteer(projectId: string, volunteerId: string, roleDescription: string) {
  unwrap(
    await db().from('project_volunteers').insert({ project_id: projectId, volunteer_id: volunteerId, role_description: roleDescription || null }),
  );
}

export async function updateAssignment(projectId: string, volunteerId: string, changes: TablesUpdate<'project_volunteers'>) {
  unwrap(await db().from('project_volunteers').update(changes).eq('project_id', projectId).eq('volunteer_id', volunteerId));
}

export async function removeAssignment(projectId: string, volunteerId: string) {
  unwrap(await db().from('project_volunteers').delete().eq('project_id', projectId).eq('volunteer_id', volunteerId));
}

export async function listVolunteerAccounts() {
  const rows = unwrap(
    await db().from('user_roles').select('user_id, profile:profiles!user_roles_user_id_fkey(full_name, email)').eq('role', 'volunteer'),
  ) as unknown as Array<{ user_id: string; profile: { full_name: string; email: string | null } | null }> | null;
  return (rows ?? []).map((r) => ({ id: r.user_id, label: r.profile?.full_name || r.profile?.email || r.user_id }));
}

export async function linkVolunteerAccount(volunteerId: string, profileId: string | null) {
  unwrap(await db().rpc('link_volunteer_account', { p_volunteer_id: volunteerId, p_profile_id: profileId }));
}

/** The signed-in volunteer's own record and assignments (RLS limits rows to theirs). */
export async function getMyVolunteerProfile() {
  const client = db();
  const [vol, assignments] = await Promise.all([
    client.from('volunteers').select('*').maybeSingle(),
    client
      .from('project_volunteers')
      .select('*, project:projects(id, title, summary, status, start_date, end_date, locality, village:villages(name))')
      .order('assigned_at', { ascending: false }),
  ]);
  return {
    volunteer: unwrap(vol) as Tables<'volunteers'> | null,
    assignments: (unwrap(assignments) ?? []) as unknown as Array<
      Tables<'project_volunteers'> & {
        project: {
          id: string;
          title: string;
          summary: string;
          status: Enums<'project_status'>;
          start_date: string | null;
          end_date: string | null;
          locality: string | null;
          village: { name: string } | null;
        } | null;
      }
    >,
  };
}

export async function respondToAssignment(projectId: string, response: 'confirmed' | 'withdrawn') {
  unwrap(await db().rpc('respond_to_assignment', { p_project_id: projectId, p_response: response }));
}

export async function updateMyVolunteerProfile(input: {
  availability: string[];
  skills: string[];
  skills_other: string | null;
  preferred_activities: Enums<'activity_category'>[];
  languages: string | null;
  consent_public_recognition: boolean;
}) {
  unwrap(
    await db().rpc('update_my_volunteer_profile', {
      p_availability: input.availability,
      p_skills: input.skills,
      p_skills_other: input.skills_other,
      p_preferred_activities: input.preferred_activities,
      p_languages: input.languages,
      p_consent_public_recognition: input.consent_public_recognition,
    }),
  );
}
