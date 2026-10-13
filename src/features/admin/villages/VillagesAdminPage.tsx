import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { QueryState } from '@/components/QueryState';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Alert, EmptyState } from '@/components/ui/Feedback';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/Field';
import { useAuth } from '@/features/auth/useAuth';
import { errorMessage } from '@/lib/errors';
import { SLUG_PATTERN, slugify } from '@/lib/slug';
import { deleteVillage, listAllVillages, saveVillage, type VillageRecord } from '../api/programmes';
import { DataTable, type Column } from '../components/DataTable';
import { MarkdownField } from '../components/MarkdownField';
import { MediaSelect } from '../components/MediaSelect';
import { PageHeader } from '../components/PageHeader';
import { PublishedBadge } from '../components/StatusBadges';
import { useToast } from '../components/useToast';

type Draft = {
  name: string;
  slug: string;
  local_name: string;
  block: string;
  district: string;
  state: string;
  summary: string;
  description: string;
  cover_media_id: string | null;
  sort_order: number;
  is_published: boolean;
};

const empty: Draft = { name: '', slug: '', local_name: '', block: '', district: '', state: '', summary: '', description: '', cover_media_id: null, sort_order: 0, is_published: false };

function toDraft(v: VillageRecord): Draft {
  return {
    name: v.name,
    slug: v.slug,
    local_name: v.local_name ?? '',
    block: v.block ?? '',
    district: v.district ?? '',
    state: v.state ?? '',
    summary: v.summary ?? '',
    description: v.description,
    cover_media_id: v.cover_media_id,
    sort_order: v.sort_order,
    is_published: v.is_published,
  };
}

function VillageEditor({ village, open, onClose, onSaved }: { village: VillageRecord | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const auth = useAuth();
  const canPublish = auth.hasRole('admin', 'publisher');
  const [draft, setDraft] = useState<Draft>(village ? toDraft(village) : empty);
  const [slugTouched, setSlugTouched] = useState(Boolean(village));
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const nullable = (s: string) => (s.trim() ? s.trim() : null);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={village ? `Edit ${village.name}` : 'Add a village'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            loading={busy}
            onClick={async () => {
              setError(undefined);
              if (draft.name.trim().length < 2) return setError('Enter the village name.');
              if (!SLUG_PATTERN.test(draft.slug)) return setError('The web address may only contain lowercase letters, numbers and hyphens.');
              setBusy(true);
              try {
                await saveVillage(village?.id ?? null, {
                  name: draft.name.trim(),
                  slug: draft.slug,
                  local_name: nullable(draft.local_name),
                  block: nullable(draft.block),
                  district: nullable(draft.district),
                  state: nullable(draft.state),
                  summary: nullable(draft.summary),
                  description: draft.description,
                  cover_media_id: draft.cover_media_id,
                  sort_order: draft.sort_order,
                  ...(canPublish ? { is_published: draft.is_published } : {}),
                });
                onSaved();
                onClose();
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            Save village
          </Button>
        </>
      }
    >
      <div className="grid gap-5 sm:grid-cols-2">
        {error && <Alert tone="danger" live="assertive" className="sm:col-span-2">{error}</Alert>}
        <Field id="v-name" label="Village name" required>
          <Input value={draft.name} onChange={(e) => { set('name', e.target.value); if (!slugTouched) set('slug', slugify(e.target.value, 'village')); }} maxLength={120} />
        </Field>
        <Field id="v-local" label="Name in local language" optionalLabel>
          <Input value={draft.local_name} onChange={(e) => set('local_name', e.target.value)} maxLength={120} />
        </Field>
        <Field id="v-slug" label="Web address" hint={`/villages/${draft.slug || '…'}`} required>
          <Input value={draft.slug} onChange={(e) => { setSlugTouched(true); set('slug', e.target.value.toLowerCase()); }} maxLength={80} />
        </Field>
        <Field id="v-sort" label="Display order" hint="Lower numbers appear first.">
          <Input type="number" value={draft.sort_order} onChange={(e) => set('sort_order', Number(e.target.value) || 0)} />
        </Field>
        <Field id="v-block" label="Block / tehsil" optionalLabel>
          <Input value={draft.block} onChange={(e) => set('block', e.target.value)} maxLength={120} />
        </Field>
        <Field id="v-district" label="District" optionalLabel>
          <Input value={draft.district} onChange={(e) => set('district', e.target.value)} maxLength={120} />
        </Field>
        <Field id="v-state" label="State" optionalLabel>
          <Input value={draft.state} onChange={(e) => set('state', e.target.value)} maxLength={120} />
        </Field>
        <MediaSelect id="v-cover" label="Cover photo" value={draft.cover_media_id} onChange={(v) => set('cover_media_id', v)} />
        <Field id="v-summary" label="Short summary" optionalLabel className="sm:col-span-2">
          <Textarea rows={2} value={draft.summary} onChange={(e) => set('summary', e.target.value)} maxLength={300} />
        </Field>
        <div className="sm:col-span-2">
          <MarkdownField id="v-description" label="Description" value={draft.description} onChange={(v) => set('description', v)} max={10000} hint="Only include information PRAYASH has confirmed." />
        </div>
        <div className="sm:col-span-2">
          {canPublish ? (
            <Checkbox label="Published on the website" description="Visible to everyone in the Villages directory." checked={draft.is_published} onChange={(e) => set('is_published', e.target.checked)} />
          ) : (
            <p className="text-sm text-ink-600">A publisher will review and publish this village.</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}

export function VillagesAdminPage() {
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['admin', 'villages'], queryFn: listAllVillages });
  const [editing, setEditing] = useState<VillageRecord | null | 'new'>(null);
  const canEdit = auth.hasRole('admin', 'publisher');
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'villages'] });
    void queryClient.invalidateQueries({ queryKey: ['villages'] });
  };
  const columns: Column<VillageRecord>[] = [
    { key: 'name', header: 'Village', cell: (v) => v.name },
    { key: 'district', header: 'District', cell: (v) => v.district ?? '—' },
    { key: 'status', header: 'Website', cell: (v) => <PublishedBadge published={v.is_published} /> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (v) =>
        canEdit ? (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setEditing(v)}>Edit</Button>
            {auth.hasRole('admin') && !v.is_published && (
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  if (!window.confirm(`Delete ${v.name}? This cannot be undone.`)) return;
                  try {
                    await deleteVillage(v.id);
                    refresh();
                    toast.success('Village deleted.');
                  } catch (err) {
                    toast.error(errorMessage(err));
                  }
                }}
              >
                Delete
              </Button>
            )}
          </div>
        ) : null,
    },
  ];
  return (
    <>
      <PageHeader
        title="Villages"
        description="The village directory shown on the website. Unpublished villages are visible only to the team."
        actions={canEdit && <Button size="sm" iconLeft={<Plus aria-hidden="true" className="size-4" />} onClick={() => setEditing('new')}>Add village</Button>}
      />
      <QueryState query={query} isEmpty={(rows) => rows.length === 0} empty={<EmptyState title="No villages yet" description="Add the villages PRAYASH serves. Only add places PRAYASH has confirmed." />}>
        {(rows) => <DataTable rows={rows} columns={columns} rowKey={(v) => v.id} caption="Villages" />}
      </QueryState>
      {editing && (
        <VillageEditor key={editing === 'new' ? 'new' : editing.id} village={editing === 'new' ? null : editing} open onClose={() => setEditing(null)} onSaved={() => { refresh(); toast.success('Village saved.'); }} />
      )}
    </>
  );
}
