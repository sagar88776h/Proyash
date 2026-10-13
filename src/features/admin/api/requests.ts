import { sanitizeSearch } from '@/lib/api/public';
import { AppError, unwrap } from '@/lib/errors';
import type { Enums, Tables } from '@/types/database';
import { db } from '../components/db';

export type RequestRow = Pick<
  Tables<'assistance_requests'>,
  | 'id'
  | 'reference_code'
  | 'category'
  | 'urgency'
  | 'applicant_name'
  | 'status'
  | 'locality'
  | 'created_at'
  | 'has_unread_followup'
  | 'assigned_reviewer_id'
  | 'source'
  | 'redacted_at'
> & { village: { name: string } | null; reviewer: { full_name: string } | null };

export type RequestFilters = {
  status?: Enums<'assistance_status'> | '' | 'open';
  category?: Enums<'assistance_category'> | '';
  urgency?: Enums<'assistance_urgency'> | '';
  assignedTo?: string;
  search?: string;
  page: number;
  pageSize: number;
};

const LIST_COLUMNS = `id, reference_code, category, urgency, applicant_name, status, locality, created_at, has_unread_followup,
  assigned_reviewer_id, source, redacted_at,
  village:villages(name), reviewer:profiles!assistance_requests_assigned_reviewer_id_fkey(full_name)`;

export async function listRequests(f: RequestFilters) {
  let q = db()
    .from('assistance_requests')
    .select(LIST_COLUMNS, { count: 'exact' })
    .order('urgency', { ascending: false })
    .order('created_at', { ascending: false })
    .range((f.page - 1) * f.pageSize, f.page * f.pageSize - 1);
  if (f.status === 'open') q = q.in('status', ['pending', 'under_review', 'more_information_required', 'approved']);
  else if (f.status) q = q.eq('status', f.status);
  if (f.category) q = q.eq('category', f.category);
  if (f.urgency) q = q.eq('urgency', f.urgency);
  if (f.assignedTo) q = q.eq('assigned_reviewer_id', f.assignedTo);
  const s = f.search ? sanitizeSearch(f.search) : '';
  if (s) {
    const digits = s.replace(/\D/g, '');
    const parts = [`reference_code.ilike.%${s.replace(/\s/g, '')}%`, `applicant_name.ilike.%${s}%`];
    if (digits.length >= 6) parts.push(`phone.ilike.%${digits.slice(-10)}%`);
    q = q.or(parts.join(','));
  }
  const res = await q;
  return { rows: (unwrap(res) ?? []) as unknown as RequestRow[], count: res.count ?? 0 };
}

export async function getRequest(id: string) {
  const client = db();
  const [request, notes, history, followups] = await Promise.all([
    client
      .from('assistance_requests')
      .select('*, village:villages(name), reviewer:profiles!assistance_requests_assigned_reviewer_id_fkey(full_name), recorder:profiles!assistance_requests_recorded_by_fkey(full_name)')
      .eq('id', id)
      .maybeSingle(),
    client.from('assistance_request_notes').select('id, body, created_at, author:profiles(full_name)').eq('request_id', id).order('created_at'),
    client.from('assistance_status_history').select('id, from_status, to_status, reason, created_at, actor:profiles(full_name)').eq('request_id', id).order('id'),
    client.from('assistance_followups').select('*').eq('request_id', id).order('created_at'),
  ]);
  return {
    request: unwrap(request) as
      | (Tables<'assistance_requests'> & {
          village: { name: string } | null;
          reviewer: { full_name: string } | null;
          recorder: { full_name: string } | null;
        })
      | null,
    notes: (unwrap(notes) ?? []) as unknown as Array<{ id: string; body: string; created_at: string; author: { full_name: string } | null }>,
    history: (unwrap(history) ?? []) as unknown as Array<{
      id: number;
      from_status: Enums<'assistance_status'> | null;
      to_status: Enums<'assistance_status'>;
      reason: string | null;
      created_at: string;
      actor: { full_name: string } | null;
    }>,
    followups: (unwrap(followups) ?? []) as Tables<'assistance_followups'>[],
  };
}

export async function listReviewers() {
  const rows = unwrap(
    await db().from('user_roles').select('user_id, role, profile:profiles!user_roles_user_id_fkey(full_name, is_active)').in('role', ['assistance_reviewer', 'admin']),
  ) as unknown as Array<{ user_id: string; profile: { full_name: string; is_active: boolean } | null }> | null;
  const seen = new Map<string, string>();
  for (const r of rows ?? []) if (r.profile?.is_active) seen.set(r.user_id, r.profile.full_name || 'Team member');
  return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function changeStatus(id: string, status: Enums<'assistance_status'>, reason: string, applicantMessage?: string) {
  unwrap(
    await db().rpc('assistance_change_status', {
      p_request_id: id,
      p_new_status: status,
      p_reason: reason || null,
      p_applicant_message: applicantMessage || null,
    }),
  );
}

export async function assignReviewer(id: string, reviewerId: string | null) {
  unwrap(await db().rpc('assistance_assign', { p_request_id: id, p_reviewer_id: reviewerId }));
}

export async function setApplicantMessage(id: string, message: string) {
  unwrap(await db().rpc('assistance_set_applicant_message', { p_request_id: id, p_message: message }));
}

export async function addNote(id: string, body: string) {
  unwrap(await db().from('assistance_request_notes').insert({ request_id: id, body }));
}

export async function markFollowupsRead(id: string) {
  unwrap(await db().rpc('assistance_mark_followups_read', { p_request_id: id }));
}

export async function followupAttachmentUrl(path: string) {
  const { data, error } = await db().storage.from('assistance-files').createSignedUrl(path, 120, { download: true });
  if (error || !data) throw new AppError('server', 'The attachment could not be opened.');
  return data.signedUrl;
}

export const ALLOWED_TRANSITIONS: Record<Enums<'assistance_status'>, Enums<'assistance_status'>[]> = {
  pending: ['under_review', 'more_information_required', 'declined'],
  under_review: ['more_information_required', 'approved', 'declined'],
  more_information_required: ['under_review', 'declined'],
  approved: ['assistance_provided', 'under_review', 'declined'],
  declined: ['under_review'],
  assistance_provided: [],
};
