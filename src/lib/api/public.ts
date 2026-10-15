/**
 * Public (anonymous) data access. Only published, approved records are
 * visible here — the database enforces this with RLS and column grants, so
 * every query lists its columns explicitly.
 */
import type { ContentKey } from '@/content/registry';
import { AppError, unwrap } from '@/lib/errors';
import { getSupabase } from '@/lib/supabase';
import type { Enums, Json } from '@/types/database';

export type MediaRef = { public_path: string | null; alt_text: string; width: number | null; height: number | null } | null;

export type PublicVillage = {
  id: string;
  slug: string;
  name: string;
  local_name: string | null;
  block: string | null;
  district: string | null;
  state: string | null;
  summary: string | null;
  description: string;
  cover: MediaRef;
  /** Published projects in this village (ids only; visitors cannot run aggregate counts). */
  projects: { id: string }[];
};

export type PublicProject = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  category: Enums<'activity_category'>;
  status: Enums<'project_status'>;
  start_date: string | null;
  end_date: string | null;
  locality: string | null;
  is_featured: boolean;
  published_at: string | null;
  village_id: string | null;
  cover: MediaRef;
  village: { name: string; slug: string } | null;
};

export type PublicOutcome = {
  id: string;
  label: string;
  quantity: number | null;
  unit: string | null;
  description: string | null;
  outcome_date: string | null;
};

export type PublicMedia = {
  id: string;
  public_path: string | null;
  alt_text: string;
  caption: string | null;
  credit: string | null;
  width: number | null;
  height: number | null;
};

export type ImpactSummary = {
  projects_completed: number;
  projects_ongoing: number;
  villages_reached: number;
  active_volunteers: number;
  featured_outcomes: Array<{
    id: string;
    label: string;
    quantity: number | null;
    unit: string | null;
    outcome_date: string | null;
    project_title: string;
    project_slug: string;
  }>;
};

export type ReportSnapshot = {
  period: { start: string; end: string };
  opening_balance: number;
  closing_balance: number;
  income: { member_contributions: number; public_donations: number; other_income: number };
  opening_balances_recorded: number;
  expenditure_by_category: Partial<Record<Enums<'expense_category'>, number>>;
  expenditure_total: number;
  refunds: number;
  allocations?: number;
  contribution_count: number;
  expense_count: number;
  projects: Array<{ project_id: string; slug: string; title: string; expenditure: number }>;
  other_project_expenditure: number;
  generated_at?: string;
};

export type PublicReport = {
  id: string;
  title: string;
  period_type: Enums<'report_period'>;
  period_start: string;
  period_end: string;
  summary: ReportSnapshot;
  narrative: string;
  published_at: string | null;
};

export type ReportDocument = { id: string; title: string; storage_path: string; byte_size: number };

const MEDIA_COLUMNS = 'public_path, alt_text, width, height';
const PROJECT_COLUMNS = `id, slug, title, summary, description, category, status, start_date, end_date, locality, is_featured, published_at, village_id,
  cover:media_assets!projects_cover_media_fk(${MEDIA_COLUMNS}),
  village:villages!projects_village_id_fkey(name, slug)`;

/** Removes characters that have meaning in PostgREST filter syntax. */
export function sanitizeSearch(input: string): string {
  return input.replace(/[%_,.()*\\:"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

export async function fetchPageContent(key: ContentKey) {
  const rows = unwrap(
    await (await getSupabase()).from('site_content').select('key, published, published_at, version').eq('key', key).limit(1),
  );
  return (rows?.[0] as { published: Json; published_at: string | null; version: number } | undefined) ?? null;
}

export type ContactSettings = {
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  hours: string | null;
  map_url: string | null;
};
export type SocialSettings = Partial<Record<'facebook' | 'instagram' | 'youtube' | 'x' | 'linkedin', string | null>>;
export type DonationSettings = {
  accepting: boolean;
  upi_id: string | null;
  payee_name: string | null;
  bank: { account_name?: string | null; bank_name?: string | null; account_number?: string | null; ifsc?: string | null; branch?: string | null } | null;
  instructions: string | null;
};
export type OrganisationSettings = {
  legal_name: string | null;
  registration_details: string | null;
  established_year: number | null;
};
export type PublicSettings = {
  contact: ContactSettings;
  social: SocialSettings;
  donation: DonationSettings;
  organisation: OrganisationSettings;
};

export const EMPTY_SETTINGS: PublicSettings = {
  contact: { phone: null, whatsapp: null, email: null, address: null, hours: null, map_url: null },
  social: {},
  donation: { accepting: false, upi_id: null, payee_name: null, bank: null, instructions: null },
  organisation: { legal_name: null, registration_details: null, established_year: null },
};

export async function fetchPublicSettings(): Promise<PublicSettings> {
  const rows = unwrap(await (await getSupabase()).from('site_settings').select('key, value').eq('is_public', true));
  const out: PublicSettings = structuredClone(EMPTY_SETTINGS);
  for (const row of rows ?? []) {
    const value = (row.value ?? {}) as Record<string, unknown>;
    if (row.key === 'contact') out.contact = { ...out.contact, ...(value as Partial<ContactSettings>) };
    if (row.key === 'social') out.social = value as SocialSettings;
    if (row.key === 'donation') out.donation = { ...out.donation, ...(value as Partial<DonationSettings>) };
    if (row.key === 'organisation') out.organisation = { ...out.organisation, ...(value as Partial<OrganisationSettings>) };
  }
  return out;
}

export async function fetchPublishedVillages(): Promise<PublicVillage[]> {
  const rows = unwrap(
    await (await getSupabase())
      .from('villages')
      .select(
        `id, slug, name, local_name, block, district, state, summary, description,
         cover:media_assets!villages_cover_media_fk(${MEDIA_COLUMNS}), projects(id)`,
      )
      .eq('is_published', true)
      .order('sort_order')
      .order('name'),
  );
  return (rows ?? []) as unknown as PublicVillage[];
}

export async function fetchVillageBySlug(slug: string): Promise<PublicVillage | null> {
  const rows = unwrap(
    await (await getSupabase())
      .from('villages')
      .select(
        `id, slug, name, local_name, block, district, state, summary, description,
         cover:media_assets!villages_cover_media_fk(${MEDIA_COLUMNS}), projects(id)`,
      )
      .eq('is_published', true)
      .eq('slug', slug)
      .limit(1),
  );
  return ((rows ?? [])[0] as unknown as PublicVillage) ?? null;
}

export type ProjectFilters = {
  category?: Enums<'activity_category'> | '';
  status?: Enums<'project_status'> | '';
  villageId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
};

export async function fetchPublishedProjects(filters: ProjectFilters = {}): Promise<{ rows: PublicProject[]; count: number }> {
  const pageSize = filters.pageSize ?? 12;
  const page = Math.max(1, filters.page ?? 1);
  let query = (await getSupabase())
    .from('projects')
    .select(PROJECT_COLUMNS, { count: 'exact' })
    .eq('is_published', true)
    .order('is_featured', { ascending: false })
    .order('start_date', { ascending: false, nullsFirst: false })
    .order('published_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (filters.category) query = query.eq('category', filters.category);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.villageId) query = query.eq('village_id', filters.villageId);
  const search = filters.search ? sanitizeSearch(filters.search) : '';
  if (search) query = query.or(`title.ilike.%${search}%,summary.ilike.%${search}%`);
  const result = await query;
  const rows = unwrap(result);
  return { rows: (rows ?? []) as unknown as PublicProject[], count: result.count ?? 0 };
}

export async function fetchFeaturedProjects(limit = 3): Promise<PublicProject[]> {
  const rows = unwrap(
    await (await getSupabase())
      .from('projects')
      .select(PROJECT_COLUMNS)
      .eq('is_published', true)
      .order('is_featured', { ascending: false })
      .order('published_at', { ascending: false })
      .limit(limit),
  );
  return (rows ?? []) as unknown as PublicProject[];
}

export async function fetchProjectBySlug(slug: string) {
  const supabase = await getSupabase();
  const rows = unwrap(await supabase.from('projects').select(PROJECT_COLUMNS).eq('is_published', true).eq('slug', slug).limit(1));
  const project = ((rows ?? [])[0] as unknown as PublicProject) ?? null;
  if (!project) return null;
  const [outcomes, media, finance] = await Promise.all([
    supabase
      .from('project_outcomes')
      .select('id, label, quantity, unit, description, outcome_date')
      .eq('project_id', project.id)
      .eq('is_verified', true)
      .order('sort_order')
      .order('outcome_date', { ascending: false }),
    supabase
      .from('media_assets')
      .select('id, public_path, alt_text, caption, credit, width, height')
      .eq('project_id', project.id)
      .eq('status', 'published')
      .order('sort_order'),
    supabase.rpc('get_project_finance', { p_project_id: project.id }),
  ]);
  return {
    project,
    outcomes: (unwrap(outcomes) ?? []) as PublicOutcome[],
    media: (unwrap(media) ?? []) as PublicMedia[],
    finance: (unwrap(finance) ?? null) as null | {
      approved_budget: number;
      approved_on: string;
      verified_expenditure: number;
      as_of: string;
    },
  };
}

export async function fetchVillageMedia(villageId: string): Promise<PublicMedia[]> {
  const rows = unwrap(
    await (await getSupabase())
      .from('media_assets')
      .select('id, public_path, alt_text, caption, credit, width, height')
      .eq('village_id', villageId)
      .eq('status', 'published')
      .order('sort_order')
      .limit(12),
  );
  return (rows ?? []) as PublicMedia[];
}

export async function fetchPublicMedia(id: string): Promise<PublicMedia | null> {
  const rows = unwrap(
    await (await getSupabase())
      .from('media_assets')
      .select('id, public_path, alt_text, caption, credit, width, height')
      .eq('id', id)
      .eq('status', 'published')
      .limit(1),
  );
  return ((rows ?? [])[0] as PublicMedia) ?? null;
}

export async function fetchLatestPublicMedia(limit = 3): Promise<PublicMedia[]> {
  const rows = unwrap(
    await (await getSupabase())
      .from('media_assets')
      .select('id, public_path, alt_text, caption, credit, width, height')
      .eq('status', 'published')
      .order('sort_order')
      .limit(limit),
  );
  return (rows ?? []) as PublicMedia[];
}

export async function fetchImpactSummary(): Promise<ImpactSummary> {
  return unwrap(await (await getSupabase()).rpc('get_public_impact_summary')) as unknown as ImpactSummary;
}

const REPORT_COLUMNS = 'id, title, period_type, period_start, period_end, summary, narrative, published_at';

export async function fetchPublishedReports(): Promise<PublicReport[]> {
  const rows = unwrap(
    await (await getSupabase())
      .from('financial_reports')
      .select(REPORT_COLUMNS)
      .eq('status', 'published')
      .order('period_end', { ascending: false }),
  );
  return (rows ?? []) as unknown as PublicReport[];
}

export async function fetchPublishedReport(id: string) {
  const supabase = await getSupabase();
  const rows = unwrap(await supabase.from('financial_reports').select(REPORT_COLUMNS).eq('status', 'published').eq('id', id).limit(1));
  const report = ((rows ?? [])[0] as unknown as PublicReport) ?? null;
  if (!report) return null;
  const docs = unwrap(
    await supabase
      .from('financial_report_documents')
      .select('id, title, storage_path, byte_size')
      .eq('report_id', id)
      .order('created_at'),
  );
  return { report, documents: (docs ?? []) as ReportDocument[] };
}

export async function reportDocumentUrl(path: string): Promise<string> {
  const { data, error } = await (await getSupabase()).storage.from('report-documents').createSignedUrl(path, 300, { download: true });
  if (error || !data) throw new AppError('server', 'This document could not be opened. Please try again.');
  return data.signedUrl;
}
