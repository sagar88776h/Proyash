import { callFunction } from '@/lib/api/functions';
import { sanitizeSearch } from '@/lib/api/public';
import { unwrap } from '@/lib/errors';
import { prepareImage } from '@/lib/images';
import type { Enums, Tables, TablesInsert, TablesUpdate } from '@/types/database';
import { db } from '../components/db';

// ---------------------------------------------------------------- villages
export type VillageRecord = Tables<'villages'>;

export async function listAllVillages() {
  return (unwrap(await db().from('villages').select('*').order('sort_order').order('name')) ?? []) as VillageRecord[];
}

export async function saveVillage(id: string | null, values: TablesInsert<'villages'>) {
  if (id) unwrap(await db().from('villages').update(values).eq('id', id));
  else unwrap(await db().from('villages').insert(values));
}

export async function deleteVillage(id: string) {
  unwrap(await db().from('villages').delete().eq('id', id));
}

// ---------------------------------------------------------------- projects
export type ProjectListRow = Pick<
  Tables<'projects'>,
  'id' | 'title' | 'slug' | 'status' | 'category' | 'is_published' | 'is_featured' | 'start_date' | 'updated_at'
> & { village: { name: string } | null };

export async function listProjects(f: { status?: string; published?: string; category?: string; search?: string; page: number; pageSize: number }) {
  let q = db()
    .from('projects')
    .select('id, title, slug, status, category, is_published, is_featured, start_date, updated_at, village:villages!projects_village_id_fkey(name)', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range((f.page - 1) * f.pageSize, f.page * f.pageSize - 1);
  if (f.status) q = q.eq('status', f.status as Enums<'project_status'>);
  if (f.category) q = q.eq('category', f.category as Enums<'activity_category'>);
  if (f.published === 'yes') q = q.eq('is_published', true);
  if (f.published === 'no') q = q.eq('is_published', false);
  const s = f.search ? sanitizeSearch(f.search) : '';
  if (s) q = q.ilike('title', `%${s}%`);
  const res = await q;
  return { rows: (unwrap(res) ?? []) as unknown as ProjectListRow[], count: res.count ?? 0 };
}

export async function getProject(id: string) {
  return unwrap(await db().from('projects').select('*').eq('id', id).maybeSingle()) as Tables<'projects'> | null;
}

export async function createProject(values: TablesInsert<'projects'>) {
  return unwrap(await db().from('projects').insert(values).select('id').single()) as { id: string };
}

export async function updateProject(id: string, values: TablesUpdate<'projects'>) {
  unwrap(await db().from('projects').update(values).eq('id', id));
}

export async function deleteProject(id: string) {
  unwrap(await db().from('projects').delete().eq('id', id));
}

export async function listOutcomes(projectId: string) {
  return (unwrap(await db().from('project_outcomes').select('*').eq('project_id', projectId).order('sort_order').order('created_at')) ??
    []) as Tables<'project_outcomes'>[];
}

export async function saveOutcome(id: string | null, values: TablesInsert<'project_outcomes'>) {
  if (id) unwrap(await db().from('project_outcomes').update(values).eq('id', id));
  else unwrap(await db().from('project_outcomes').insert(values));
}

export async function deleteOutcome(id: string) {
  unwrap(await db().from('project_outcomes').delete().eq('id', id));
}

export async function listProjectVolunteers(projectId: string) {
  return (unwrap(
    await db().from('project_volunteers').select('*, volunteer:volunteers(id, full_name, status)').eq('project_id', projectId).order('assigned_at'),
  ) ?? []) as unknown as Array<Tables<'project_volunteers'> & { volunteer: { id: string; full_name: string; status: Enums<'volunteer_status'> } | null }>;
}

export async function listAssignableVolunteers() {
  return (unwrap(await db().from('volunteers').select('id, full_name').in('status', ['approved', 'active']).order('full_name')) ?? []) as Array<{
    id: string;
    full_name: string;
  }>;
}

export async function getBudget(projectId: string) {
  return unwrap(await db().from('project_budgets').select('*').eq('project_id', projectId).maybeSingle()) as Tables<'project_budgets'> | null;
}

export async function saveBudget(projectId: string, exists: boolean, values: Omit<TablesInsert<'project_budgets'>, 'project_id'>) {
  if (exists) unwrap(await db().from('project_budgets').update(values).eq('project_id', projectId));
  else unwrap(await db().from('project_budgets').insert({ ...values, project_id: projectId }));
}

export async function getProjectPosition(projectId: string) {
  return unwrap(await db().rpc('finance_project_position', { p_project_id: projectId })) as {
    allocated: number;
    restricted_income: number;
    expenditure: number;
    pending_count: number;
  };
}

// ---------------------------------------------------------------- media
export type MediaRecord = Tables<'media_assets'>;

export async function listMedia(f: { status?: string; projectId?: string; villageId?: string; page: number; pageSize: number }) {
  let q = db()
    .from('media_assets')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((f.page - 1) * f.pageSize, f.page * f.pageSize - 1);
  if (f.status) q = q.eq('status', f.status as Enums<'media_status'>);
  if (f.projectId) q = q.eq('project_id', f.projectId);
  if (f.villageId) q = q.eq('village_id', f.villageId);
  const res = await q;
  return { rows: (unwrap(res) ?? []) as MediaRecord[], count: res.count ?? 0 };
}

export async function listPublishedMediaOptions() {
  return (unwrap(await db().from('media_assets').select('id, alt_text, public_path').eq('status', 'published').order('created_at', { ascending: false }).limit(200)) ??
    []) as Array<{ id: string; alt_text: string; public_path: string | null }>;
}

/** Short-lived links for previewing private (unpublished) photos. */
export async function privatePreviewUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await db().storage.from('media-private').createSignedUrls(paths, 600);
  const out: Record<string, string> = {};
  for (const item of data ?? []) if (item.path && item.signedUrl) out[item.path] = item.signedUrl;
  return out;
}

export async function uploadPhoto(file: File, uploadedBy: string, links: { projectId?: string | null; villageId?: string | null } = {}) {
  const prepared = await prepareImage(file);
  const id = crypto.randomUUID();
  const ext = prepared.mime === 'image/webp' ? 'webp' : 'jpg';
  const path = `uploads/${id}.${ext}`;
  const client = db();
  const { error: uploadError } = await client.storage.from('media-private').upload(path, prepared.blob, { contentType: prepared.mime, upsert: false });
  if (uploadError) throw new Error(`${file.name}: upload failed (${uploadError.message}).`);
  const { error } = await client.from('media_assets').insert({
    id,
    private_path: path,
    mime_type: prepared.mime,
    width: prepared.width,
    height: prepared.height,
    byte_size: prepared.blob.size,
    uploaded_by: uploadedBy,
    project_id: links.projectId ?? null,
    village_id: links.villageId ?? null,
  });
  if (error) {
    await client.storage.from('media-private').remove([path]);
    throw new Error(`${file.name}: could not be saved (${error.message}).`);
  }
  return id;
}

export async function updateMedia(id: string, values: TablesUpdate<'media_assets'>) {
  unwrap(await db().from('media_assets').update(values).eq('id', id));
}

export async function publishMedia(id: string) {
  await callFunction('staff-api', '/media/publish', { body: { media_id: id }, auth: true });
}

export async function unpublishMedia(media: MediaRecord, status: 'archived' | 'rejected' | 'pending_review') {
  if (media.status === 'published') {
    await callFunction('staff-api', '/media/unpublish', { body: { media_id: media.id, status }, auth: true });
  } else {
    unwrap(await db().rpc('media_set_unpublished', { p_media_id: media.id, p_status: status }));
  }
}

export async function deleteMedia(media: MediaRecord) {
  unwrap(await db().from('media_assets').delete().eq('id', media.id));
  await db().storage.from('media-private').remove([media.private_path]);
}
