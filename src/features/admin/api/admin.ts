import { type ContactSettings, type DonationSettings, type OrganisationSettings, type SocialSettings } from '@/lib/api/public';
import { callFunction } from '@/lib/api/functions';
import { AppError, unwrap } from '@/lib/errors';
import type { Enums, Json, Tables } from '@/types/database';
import { db } from '../components/db';

/* ----------------------------------------------------------------------------
 * Page content
 * ------------------------------------------------------------------------- */

export type ContentRow = Pick<
  Tables<'site_content'>,
  'key' | 'draft' | 'published' | 'published_at' | 'published_by' | 'draft_updated_at' | 'draft_updated_by' | 'version'
>;
export type ContentVersion = Pick<Tables<'site_content_versions'>, 'id' | 'version' | 'content' | 'published_at' | 'published_by'>;

const CONTENT_COLUMNS = 'key, draft, published, published_at, published_by, draft_updated_at, draft_updated_by, version';

/** Whether a page has a published override and unpublished draft changes. */
export function contentState(row: Pick<ContentRow, 'draft' | 'published'> | null | undefined) {
  const hasPublished = Boolean(row?.published);
  const hasChanges = Boolean(row?.draft) && JSON.stringify(row?.draft) !== JSON.stringify(row?.published);
  return { hasPublished, hasChanges };
}

export async function listContent(): Promise<ContentRow[]> {
  return (unwrap(await db().from('site_content').select(CONTENT_COLUMNS).order('key')) ?? []) as ContentRow[];
}

export async function getContent(key: string) {
  const client = db();
  const [row, versions] = await Promise.all([
    client.from('site_content').select(CONTENT_COLUMNS).eq('key', key).maybeSingle(),
    client
      .from('site_content_versions')
      .select('id, version, content, published_at, published_by')
      .eq('content_key', key)
      .order('version', { ascending: false })
      .limit(20),
  ]);
  return { row: unwrap(row) as ContentRow | null, versions: (unwrap(versions) ?? []) as ContentVersion[] };
}

/** Saves a draft. Returns false when the row was not updated (no permission). */
export async function saveContentDraft(key: string, draft: Record<string, unknown> | null) {
  const rows = unwrap(await db().from('site_content').update({ draft: draft as Json }).eq('key', key).select('key'));
  if (!rows?.length) throw new AppError('forbidden', 'You do not have permission to edit this page.');
}

export async function publishContent(key: string): Promise<number> {
  return unwrap(await db().rpc('publish_site_content', { p_key: key })) as number;
}

export async function unpublishContent(key: string) {
  unwrap(await db().rpc('unpublish_site_content', { p_key: key }));
}

/* ----------------------------------------------------------------------------
 * Site settings
 * ------------------------------------------------------------------------- */

export type FinanceControls = { require_independent_verification: boolean; require_independent_report_approval: boolean };
export type SettingsMap = {
  contact: ContactSettings;
  social: SocialSettings;
  donation: DonationSettings;
  organisation: OrganisationSettings;
  'finance.controls': FinanceControls;
};
export type SettingKey = keyof SettingsMap;
export type SettingMeta = { updated_at: string; updated_by: string | null };

export async function getAllSettings() {
  const rows = unwrap(await db().from('site_settings').select('key, value, updated_at, updated_by')) ?? [];
  const values: Partial<SettingsMap> = {};
  const meta: Partial<Record<SettingKey, SettingMeta>> = {};
  for (const row of rows) {
    const key = row.key as SettingKey;
    (values as Record<string, unknown>)[key] = row.value;
    meta[key] = { updated_at: row.updated_at, updated_by: row.updated_by };
  }
  return { values, meta };
}

export async function saveSetting<K extends SettingKey>(key: K, value: SettingsMap[K]) {
  const rows = unwrap(await db().from('site_settings').update({ value: value as unknown as Json }).eq('key', key).select('key'));
  if (!rows?.length) throw new AppError('forbidden', 'Only administrators can change settings.');
}

/* ----------------------------------------------------------------------------
 * Contact messages
 * ------------------------------------------------------------------------- */

export type MessageRow = Tables<'contact_messages'>;

export async function listMessages(f: { status: Enums<'message_status'> | ''; page: number; pageSize: number }) {
  let q = db()
    .from('contact_messages')
    .select('id, name, email, phone, subject, message, status, handled_by, created_at, updated_at, client_submission_id', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((f.page - 1) * f.pageSize, f.page * f.pageSize - 1);
  if (f.status) q = q.eq('status', f.status);
  const res = await q;
  return { rows: (unwrap(res) ?? []) as MessageRow[], count: res.count ?? 0 };
}

export async function updateMessage(id: string, patch: { status?: Enums<'message_status'>; handled_by?: string | null }) {
  const rows = unwrap(await db().from('contact_messages').update(patch).eq('id', id).select('id'));
  if (!rows?.length) throw new AppError('forbidden', 'Only administrators can update messages.');
}

/* ----------------------------------------------------------------------------
 * Team members, roles and activation
 * ------------------------------------------------------------------------- */

export type AppRole = Enums<'app_role'>;
export type TeamMember = Tables<'profiles'> & { roles: AppRole[]; has_mfa: boolean | null };

export async function listTeam(): Promise<TeamMember[]> {
  const client = db();
  const [profiles, roles, mfa] = await Promise.all([
    client.from('profiles').select('id, full_name, email, is_active, created_at, updated_at').order('full_name'),
    client.from('user_roles').select('user_id, role'),
    client.rpc('admin_list_mfa_status'),
  ]);
  const roleMap = new Map<string, AppRole[]>();
  for (const r of unwrap(roles) ?? []) roleMap.set(r.user_id, [...(roleMap.get(r.user_id) ?? []), r.role]);
  // MFA status is informational; the list still renders if it cannot be read.
  const mfaMap = new Map<string, boolean>();
  for (const m of mfa.error ? [] : (mfa.data ?? [])) if (m.user_id) mfaMap.set(m.user_id, Boolean(m.has_mfa));
  return (unwrap(profiles) ?? []).map((p) => ({ ...p, roles: roleMap.get(p.id) ?? [], has_mfa: mfaMap.get(p.id) ?? null }));
}

/** Names of team members, for showing who did what. */
export async function teamNames(): Promise<Map<string, string>> {
  const rows = unwrap(await db().from('profiles').select('id, full_name, email')) ?? [];
  return new Map(rows.map((r) => [r.id, r.full_name || r.email || 'Team member']));
}

export async function inviteUser(input: { email: string; full_name: string; roles: AppRole[] }) {
  return callFunction<{ ok: true; user_id: string; roles: AppRole[] }>('staff-api', '/users/invite', { body: input, auth: true });
}

export async function setUserRoles(userId: string, roles: AppRole[]) {
  return unwrap(await db().rpc('admin_set_user_roles', { p_user_id: userId, p_roles: roles })) as AppRole[];
}

export async function setUserActive(userId: string, active: boolean) {
  return callFunction<{ ok: true; sessions_revoked: boolean }>('staff-api', '/users/set-active', {
    body: { user_id: userId, active },
    auth: true,
  });
}

export async function updateMyName(userId: string, fullName: string) {
  const rows = unwrap(await db().from('profiles').update({ full_name: fullName }).eq('id', userId).select('id'));
  if (!rows?.length) throw new AppError('forbidden', 'Your name could not be updated.');
}

/* ----------------------------------------------------------------------------
 * Audit history
 * ------------------------------------------------------------------------- */

export type AuditRow = Tables<'activity_logs'>;

export const AUDIT_ENTITIES: Record<string, string> = {
  profiles: 'Team accounts',
  user_roles: 'Roles',
  site_settings: 'Settings',
  site_content: 'Page content',
  contact_messages: 'Contact messages',
  villages: 'Villages',
  projects: 'Projects',
  project_outcomes: 'Project outcomes',
  media_assets: 'Photos',
  project_budgets: 'Project budgets',
  assistance_requests: 'Requests for help',
  assistance_request_notes: 'Request notes',
  volunteers: 'Volunteers',
  project_volunteers: 'Volunteer assignments',
  financial_accounts: 'Financial accounts',
  ledger_entries: 'Ledger entries',
  donations: 'Donations',
  expenses: 'Expenses',
  ledger_evidence: 'Ledger evidence',
  reconciliations: 'Reconciliations',
  financial_reports: 'Financial reports',
  financial_report_documents: 'Report documents',
};

export async function listAudit(f: {
  entity: string;
  entityId: string;
  actor: string;
  from: string;
  to: string;
  page: number;
  pageSize: number;
}) {
  let q = db()
    .from('activity_logs')
    .select('id, occurred_at, actor_id, action, entity_type, entity_id, changes', { count: 'exact' })
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    .range((f.page - 1) * f.pageSize, f.page * f.pageSize - 1);
  if (f.entity) q = q.eq('entity_type', f.entity);
  const entityId = f.entityId.trim().slice(0, 200);
  if (entityId) q = q.eq('entity_id', entityId);
  if (f.actor) q = q.eq('actor_id', f.actor);
  if (f.from) q = q.gte('occurred_at', `${f.from}T00:00:00+05:30`);
  if (f.to) q = q.lte('occurred_at', `${f.to}T23:59:59.999+05:30`);
  const res = await q;
  return { rows: (unwrap(res) ?? []) as AuditRow[], count: res.count ?? 0 };
}

/* ----------------------------------------------------------------------------
 * Overview counts (each query is limited by the caller's row-level access)
 * ------------------------------------------------------------------------- */

async function countOf(promise: PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> {
  const res = await promise;
  return res.error ? null : (res.count ?? 0);
}

export async function overviewCounts(roles: AppRole[], userId: string) {
  const client = db();
  const has = (...r: AppRole[]) => r.some((x) => roles.includes(x));
  const head = { count: 'exact' as const, head: true };
  const tasks: Record<string, Promise<number | null>> = {};
  if (has('admin', 'assistance_reviewer')) {
    tasks.openRequests = countOf(client.from('assistance_requests').select('id', head).in('status', ['pending', 'under_review', 'more_information_required']));
    tasks.newRequests = countOf(client.from('assistance_requests').select('id', head).eq('status', 'pending'));
    tasks.myRequests = countOf(
      client.from('assistance_requests').select('id', head).eq('assigned_reviewer_id', userId).in('status', ['pending', 'under_review', 'more_information_required']),
    );
    tasks.unreadFollowups = countOf(client.from('assistance_requests').select('id', head).eq('has_unread_followup', true));
  }
  if (has('admin', 'volunteer_coordinator')) {
    tasks.pendingVolunteers = countOf(client.from('volunteers').select('id', head).eq('status', 'pending'));
  }
  if (has('admin', 'publisher', 'volunteer_coordinator')) {
    tasks.draftProjects = countOf(client.from('projects').select('id', head).eq('is_published', false));
    tasks.photosToReview = countOf(client.from('media_assets').select('id', head).eq('status', 'pending_review'));
  }
  if (has('admin', 'treasurer')) {
    tasks.pendingEntries = countOf(client.from('ledger_entries').select('id', head).eq('status', 'pending'));
    tasks.draftReports = countOf(client.from('financial_reports').select('id', head).eq('status', 'draft'));
  }
  if (has('admin')) {
    tasks.newMessages = countOf(client.from('contact_messages').select('id', head).eq('status', 'new'));
  }
  const entries = await Promise.all(Object.entries(tasks).map(async ([k, p]) => [k, await p] as const));
  return Object.fromEntries(entries) as Partial<Record<string, number | null>>;
}

export async function recentActivity(limit = 8): Promise<AuditRow[]> {
  return (unwrap(
    await db()
      .from('activity_logs')
      .select('id, occurred_at, actor_id, action, entity_type, entity_id, changes')
      .order('occurred_at', { ascending: false })
      .limit(limit),
  ) ?? []) as AuditRow[];
}

/** Launch-readiness checks for administrators. Each item reflects real data. */
export async function launchReadiness() {
  const client = db();
  const [settings, content, roles, profiles, accounts, photos] = await Promise.all([
    getAllSettings(),
    client.from('site_content').select('key, published'),
    client.from('user_roles').select('user_id, role'),
    client.from('profiles').select('id, is_active'),
    client.from('financial_accounts').select('id', { count: 'exact', head: true }).eq('is_active', true),
    client.from('media_assets').select('id', { count: 'exact', head: true }).eq('status', 'published'),
  ]);
  unwrap(accounts);
  unwrap(photos);
  const published = new Map((unwrap(content) ?? []).map((r) => [r.key, r.published as Record<string, unknown> | null]));
  const active = new Set((unwrap(profiles) ?? []).filter((p) => p.is_active).map((p) => p.id));
  const financeHolders = new Set(
    (unwrap(roles) ?? []).filter((r) => (r.role === 'admin' || r.role === 'treasurer') && active.has(r.user_id)).map((r) => r.user_id),
  );
  const contact = settings.values.contact;
  const donation = settings.values.donation;
  const story = published.get('about')?.story;
  return {
    contact: Boolean(contact?.phone || contact?.email),
    donation: Boolean(donation?.accepting && (donation.upi_id || donation.bank?.account_number)),
    privacy: Boolean(published.get('privacy')),
    terms: Boolean(published.get('terms')),
    story: typeof story === 'string' && story.trim().length > 0,
    financeTeam: financeHolders.size >= 2,
    accounts: (accounts.count ?? 0) > 0,
    photos: (photos.count ?? 0) > 0,
  };
}
