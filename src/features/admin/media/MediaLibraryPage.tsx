import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Upload } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { QueryState } from '@/components/QueryState';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Alert, EmptyState } from '@/components/ui/Feedback';
import { ChoiceGroup, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { useAuth } from '@/features/auth/useAuth';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { CONSENT_STATUS_LABELS, MEDIA_STATUS_LABELS } from '@/lib/labels';
import { publicMediaUrl } from '@/lib/supabase';
import type { Enums } from '@/types/database';
import {
  deleteMedia,
  listAllVillages,
  listMedia,
  listProjects,
  privatePreviewUrls,
  publishMedia,
  unpublishMedia,
  updateMedia,
  uploadPhoto,
  type MediaRecord,
} from '../api/programmes';
import { PageHeader } from '../components/PageHeader';
import { MediaStatusBadge } from '../components/StatusBadges';
import { useToast } from '../components/useToast';

const PAGE_SIZE = 24;

function MediaEditor({ media, preview, onClose, onChanged }: { media: MediaRecord; preview?: string; onClose: () => void; onChanged: () => void }) {
  const auth = useAuth();
  const toast = useToast();
  const canPublish = auth.hasRole('admin', 'publisher');
  const projects = useQuery({ queryKey: ['admin', 'projects', 'options'], queryFn: () => listProjects({ page: 1, pageSize: 200 }) });
  const villages = useQuery({ queryKey: ['admin', 'villages'], queryFn: listAllVillages });
  const [form, setForm] = useState({
    alt_text: media.alt_text,
    caption: media.caption ?? '',
    credit: media.credit ?? '',
    project_id: media.project_id ?? '',
    village_id: media.village_id ?? '',
    people: media.shows_identifiable_people === null ? '' : media.shows_identifiable_people ? 'yes' : 'no',
    consent_status: media.consent_status,
    consent_notes: media.consent_notes ?? '',
  });
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const published = media.status === 'published';

  const save = async () => {
    await updateMedia(media.id, {
      alt_text: form.alt_text.trim(),
      caption: form.caption.trim() || null,
      credit: form.credit.trim() || null,
      project_id: form.project_id || null,
      village_id: form.village_id || null,
      shows_identifiable_people: form.people === '' ? null : form.people === 'yes',
      consent_status: form.consent_status,
      consent_notes: form.consent_notes.trim() || null,
    });
  };
  const act = async (label: string, fn: () => Promise<void>, success: string, close = false) => {
    setBusy(label);
    setError(undefined);
    try {
      await fn();
      onChanged();
      toast.success(success);
      if (close) onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(undefined);
    }
  };
  const src = published ? publicMediaUrl(media.public_path) : preview;
  const consentOk =
    form.alt_text.trim().length >= 3 &&
    ((form.people === 'yes' && form.consent_status === 'obtained') || (form.people === 'no' && ['not_required', 'obtained'].includes(form.consent_status)));

  return (
    <Dialog open onClose={onClose} size="lg" title="Photo details" description={`Uploaded ${formatDate(media.created_at)} · ${MEDIA_STATUS_LABELS[media.status]}`}>
      <div className="grid gap-5 md:grid-cols-[1fr_1.2fr]">
        <div className="flex flex-col gap-3">
          <div className="overflow-hidden rounded-md bg-ivory-200">{src && <img src={src} alt={media.alt_text || 'Photo awaiting description'} className="w-full" />}</div>
          <p className="text-xs text-ink-600">{media.width}×{media.height}px · {Math.round((media.byte_size ?? 0) / 1024)} KB · location data removed on upload</p>
        </div>
        <div className="flex flex-col gap-4">
          {error && <Alert tone="danger" live="assertive">{error}</Alert>}
          {published && canPublish && <Alert tone="info">This photo is public. Unpublish it before changing consent details.</Alert>}
          <fieldset disabled={!canPublish} className="flex flex-col gap-4">
            <Field id="m-alt" label="Description for screen readers (alt text)" required hint="Describe what the photo shows, e.g. “Volunteers packing food kits in a village hall”.">
              <Textarea rows={2} maxLength={300} value={form.alt_text} onChange={(e) => setForm({ ...form, alt_text: e.target.value })} />
            </Field>
            <Field id="m-caption" label="Caption" optionalLabel>
              <Input maxLength={300} value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} />
            </Field>
            <Field id="m-credit" label="Photo credit" optionalLabel>
              <Input maxLength={120} value={form.credit} onChange={(e) => setForm({ ...form, credit: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="m-project" label="Project">
                <Select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
                  <option value="">None</option>
                  {(projects.data?.rows ?? []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </Select>
              </Field>
              <Field id="m-village" label="Village">
                <Select value={form.village_id} onChange={(e) => setForm({ ...form, village_id: e.target.value })}>
                  <option value="">None</option>
                  {(villages.data ?? []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </Select>
              </Field>
            </div>
            <ChoiceGroup
              legend="Can individual people be identified in this photo?"
              type="radio"
              name="m-people"
              columns={2}
              required
              options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
              value={form.people || undefined}
              onChange={(v) => setForm({ ...form, people: v as string })}
            />
            <Field id="m-consent" label="Consent">
              <Select value={form.consent_status} onChange={(e) => setForm({ ...form, consent_status: e.target.value as Enums<'consent_status'> })}>
                {Object.entries(CONSENT_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Field id="m-consent-notes" label="Where is the consent record kept? (internal)" hint="Never shown publicly.">
              <Input maxLength={1000} value={form.consent_notes} onChange={(e) => setForm({ ...form, consent_notes: e.target.value })} />
            </Field>
          </fieldset>
          {canPublish && (
            <div className="flex flex-wrap gap-2 border-t border-ink-100 pt-4">
              {!published && <Button variant="secondary" loading={busy === 'save'} onClick={() => act('save', save, 'Details saved.')}>Save details</Button>}
              {!published && (
                <Button
                  loading={busy === 'publish'}
                  disabled={!consentOk}
                  iconLeft={<ShieldCheck aria-hidden="true" className="size-4" />}
                  onClick={() => act('publish', async () => { await save(); await publishMedia(media.id); }, 'Photo published.', true)}
                >
                  Save and publish
                </Button>
              )}
              {published && <Button variant="secondary" loading={busy === 'unpublish'} onClick={() => act('unpublish', () => unpublishMedia(media, 'archived'), 'Photo unpublished.', true)}>Unpublish</Button>}
              {media.status === 'pending_review' && <Button variant="ghost" loading={busy === 'reject'} onClick={() => act('reject', () => unpublishMedia(media, 'rejected'), 'Photo rejected.', true)}>Reject</Button>}
              {!published && <Button variant="ghost" loading={busy === 'delete'} onClick={() => { if (window.confirm('Delete this photo permanently?')) void act('delete', () => deleteMedia(media), 'Photo deleted.', true); }}>Delete</Button>}
            </div>
          )}
          {canPublish && !published && !consentOk && (
            <p className="text-sm text-ink-600">To publish: add alt text, say whether people can be identified, and record informed consent where they can.</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}

export function MediaLibraryPage() {
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'pending_review';
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const [selected, setSelected] = useState<MediaRecord | null>(null);
  const [uploading, setUploading] = useState(false);
  const query = useQuery({
    queryKey: ['admin', 'media', { status, page }],
    queryFn: async () => {
      const res = await listMedia({ status: status === 'all' ? '' : status, page, pageSize: PAGE_SIZE });
      const previews = await privatePreviewUrls(res.rows.filter((m) => m.status !== 'published').map((m) => m.private_path));
      return { ...res, previews };
    },
    placeholderData: keepPreviousData,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'media'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'media-options'] });
  };
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Photo library"
        description="Photos stay private until a publisher confirms alt text and consent. Location data is removed from every upload."
        actions={
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-forest-700 px-4 py-2 text-sm font-medium text-ivory-50 hover:bg-forest-800 focus-within:outline focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-forest-700">
            <Upload aria-hidden="true" className="size-4" /> {uploading ? 'Uploading…' : 'Upload photos'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              disabled={uploading}
              onChange={async (e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = '';
                if (!files.length || !auth.userId) return;
                setUploading(true);
                let ok = 0;
                for (const f of files) {
                  try {
                    await uploadPhoto(f, auth.userId);
                    ok += 1;
                  } catch (err) {
                    toast.error(errorMessage(err));
                  }
                }
                setUploading(false);
                if (ok) toast.success(`${ok} photo${ok === 1 ? '' : 's'} uploaded for review.`);
                refresh();
              }}
            />
          </label>
        }
      />
      <div role="group" aria-label="Filter by status" className="mb-6 flex flex-wrap gap-2">
        {['pending_review', 'published', 'archived', 'rejected', 'all'].map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            onClick={() => set('status', s)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${status === s ? 'bg-forest-700 text-ivory-50' : 'bg-white text-ink-700 shadow-[inset_0_0_0_1px_var(--color-ink-200)] hover:bg-ivory-50'}`}
          >
            {s === 'all' ? 'All' : MEDIA_STATUS_LABELS[s as Enums<'media_status'>]}
          </button>
        ))}
      </div>
      <QueryState query={query} isEmpty={(d) => d.rows.length === 0} empty={<EmptyState title="No photos here" description="Upload photos taken at PRAYASH activities. They stay private until reviewed." />}>
        {(d) => (
          <div className="flex flex-col gap-6">
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {d.rows.map((m) => {
                const src = m.status === 'published' ? publicMediaUrl(m.public_path) : d.previews[m.private_path];
                return (
                  <li key={m.id}>
                    <button type="button" onClick={() => setSelected(m)} className="group flex w-full flex-col gap-2 text-left">
                      <span className="block aspect-[4/3] overflow-hidden rounded-md bg-ivory-200">
                        {src && <img src={src} alt={m.alt_text || 'Photo awaiting description'} className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" loading="lazy" />}
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <MediaStatusBadge status={m.status} />
                        <span className="truncate text-xs text-ink-600">{formatDate(m.created_at)}</span>
                      </span>
                      <span className="line-clamp-2 text-sm text-ink-700">{m.alt_text || <em className="text-ink-500">No description yet</em>}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <Pagination page={page} pageSize={PAGE_SIZE} total={d.count} onPageChange={(p) => set('page', String(p))} />
          </div>
        )}
      </QueryState>
      {selected && (
        <MediaEditor
          key={selected.id}
          media={selected}
          preview={query.data?.previews[selected.private_path]}
          onClose={() => setSelected(null)}
          onChanged={refresh}
        />
      )}
    </>
  );
}
