import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Alert, Badge, EmptyState, ErrorState } from '@/components/ui/Feedback';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { LoadingBlock } from '@/components/ui/Spinner';
import { useAuth } from '@/features/auth/useAuth';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatINR, todayISO } from '@/lib/format';
import { ACTIVITY_CATEGORY_LABELS, ASSIGNMENT_STATUS_LABELS, PROJECT_STATUS_LABELS } from '@/lib/labels';
import { publicMediaUrl } from '@/lib/supabase';
import { SLUG_PATTERN, slugify } from '@/lib/slug';
import type { Enums, Tables } from '@/types/database';
import { assignVolunteer, removeAssignment, updateAssignment } from '../api/volunteers';
import {
  createProject,
  deleteOutcome,
  getBudget,
  getProject,
  getProjectPosition,
  listAllVillages,
  listAssignableVolunteers,
  listMedia,
  listOutcomes,
  listProjectVolunteers,
  privatePreviewUrls,
  saveBudget,
  saveOutcome,
  updateProject,
  uploadPhoto,
} from '../api/programmes';
import { MarkdownField } from '../components/MarkdownField';
import { MediaSelect } from '../components/MediaSelect';
import { Card, PageHeader } from '../components/PageHeader';
import { AssignmentStatusBadge, MediaStatusBadge, PublishedBadge } from '../components/StatusBadges';
import { Tabs } from '../components/Tabs';
import { useToast } from '../components/useToast';

type Details = {
  title: string;
  slug: string;
  summary: string;
  description: string;
  category: Enums<'activity_category'>;
  status: Enums<'project_status'>;
  village_id: string;
  locality: string;
  start_date: string;
  end_date: string;
  cover_media_id: string | null;
  is_published: boolean;
  is_featured: boolean;
};

function toDetails(p: Tables<'projects'> | null): Details {
  return {
    title: p?.title ?? '',
    slug: p?.slug ?? '',
    summary: p?.summary ?? '',
    description: p?.description ?? '',
    category: p?.category ?? 'education',
    status: p?.status ?? 'planned',
    village_id: p?.village_id ?? '',
    locality: p?.locality ?? '',
    start_date: p?.start_date ?? '',
    end_date: p?.end_date ?? '',
    cover_media_id: p?.cover_media_id ?? null,
    is_published: p?.is_published ?? false,
    is_featured: p?.is_featured ?? false,
  };
}

function DetailsForm({ project, onSaved }: { project: Tables<'projects'> | null; onSaved: (id: string) => void }) {
  const auth = useAuth();
  const canPublish = auth.hasRole('admin', 'publisher');
  const locked = Boolean(project?.is_published) && !canPublish;
  const [d, setD] = useState<Details>(toDetails(project));
  const [slugTouched, setSlugTouched] = useState(Boolean(project));
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const villages = useQuery({ queryKey: ['admin', 'villages'], queryFn: listAllVillages });
  const set = <K extends keyof Details>(k: K, v: Details[K]) => setD((x) => ({ ...x, [k]: v }));

  return (
    <form
      className="grid gap-5 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(undefined);
        if (d.title.trim().length < 3) return setError('Enter a title of at least 3 characters.');
        if (d.summary.trim().length < 10) return setError('Write a summary of at least 10 characters.');
        if (!SLUG_PATTERN.test(d.slug)) return setError('The web address may only contain lowercase letters, numbers and hyphens.');
        if (d.status === 'completed' && !d.end_date) return setError('Completed projects need a completion date.');
        if (d.start_date && d.end_date && d.end_date < d.start_date) return setError('The completion date cannot be before the start date.');
        setBusy(true);
        const values = {
          title: d.title.trim(),
          slug: d.slug,
          summary: d.summary.trim(),
          description: d.description,
          category: d.category,
          status: d.status,
          village_id: d.village_id || null,
          locality: d.locality.trim() || null,
          start_date: d.start_date || null,
          end_date: d.end_date || null,
          cover_media_id: d.cover_media_id,
          ...(canPublish ? { is_published: d.is_published, is_featured: d.is_published && d.is_featured } : {}),
        };
        try {
          if (project) {
            await updateProject(project.id, values);
            onSaved(project.id);
          } else {
            const created = await createProject(values);
            onSaved(created.id);
          }
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      {locked && (
        <Alert tone="info" className="sm:col-span-2">This project is published. Only publishers and administrators can edit it.</Alert>
      )}
      {error && <Alert tone="danger" live="assertive" className="sm:col-span-2">{error}</Alert>}
      <fieldset disabled={locked} className="contents">
        <Field id="pj-title" label="Title" required className="sm:col-span-2">
          <Input value={d.title} maxLength={160} onChange={(e) => { set('title', e.target.value); if (!slugTouched) set('slug', slugify(e.target.value, 'project')); }} />
        </Field>
        <Field id="pj-slug" label="Web address" hint={`/our-work/${d.slug || '…'}`} required>
          <Input value={d.slug} maxLength={100} onChange={(e) => { setSlugTouched(true); set('slug', e.target.value.toLowerCase()); }} />
        </Field>
        <Field id="pj-category" label="Activity" required>
          <Select value={d.category} onChange={(e) => set('category', e.target.value as Details['category'])}>
            {Object.entries(ACTIVITY_CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <Field id="pj-summary" label="Summary" required hint="One or two sentences shown on project cards." className="sm:col-span-2">
          <Textarea rows={2} maxLength={300} value={d.summary} onChange={(e) => set('summary', e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <MarkdownField id="pj-description" label="Description" value={d.description} onChange={(v) => set('description', v)} max={20000} hint="Do not include identifiable details about beneficiaries without their informed consent." />
        </div>
        <Field id="pj-status" label="Status">
          <Select value={d.status} onChange={(e) => set('status', e.target.value as Details['status'])}>
            {Object.entries(PROJECT_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <Field id="pj-village" label="Village">
          <Select value={d.village_id} onChange={(e) => set('village_id', e.target.value)}>
            <option value="">Not linked to a village</option>
            {(villages.data ?? []).map((v) => <option key={v.id} value={v.id}>{v.name}{v.is_published ? '' : ' (draft)'}</option>)}
          </Select>
        </Field>
        <Field id="pj-locality" label="Locality" optionalLabel hint="For activities across several villages or outside the directory.">
          <Input value={d.locality} maxLength={160} onChange={(e) => set('locality', e.target.value)} />
        </Field>
        <MediaSelect id="pj-cover" label="Cover photo" value={d.cover_media_id} onChange={(v) => set('cover_media_id', v)} />
        <Field id="pj-start" label="Start date" optionalLabel>
          <Input type="date" value={d.start_date} onChange={(e) => set('start_date', e.target.value)} />
        </Field>
        <Field id="pj-end" label="Completion date" optionalLabel>
          <Input type="date" value={d.end_date} onChange={(e) => set('end_date', e.target.value)} />
        </Field>
      </fieldset>
      <div className="flex flex-col gap-3 rounded-card bg-ivory-50 p-4 sm:col-span-2">
        {canPublish ? (
          <>
            <Checkbox label="Published on the website" description="Visible to everyone. Check the description and photos for consent first." checked={d.is_published} onChange={(e) => set('is_published', e.target.checked)} />
            <Checkbox label="Featured on the homepage" disabled={!d.is_published} checked={d.is_published && d.is_featured} onChange={(e) => set('is_featured', e.target.checked)} />
          </>
        ) : (
          <p className="text-sm text-ink-600">Only authorised publishers can publish projects. Save your draft and ask a publisher to review it.</p>
        )}
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" loading={busy} disabled={locked}>{project ? 'Save changes' : 'Create project'}</Button>
      </div>
    </form>
  );
}

function OutcomesPanel({ projectId }: { projectId: string }) {
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canVerify = auth.hasRole('admin', 'publisher');
  const query = useQuery({ queryKey: ['admin', 'outcomes', projectId], queryFn: () => listOutcomes(projectId) });
  const [form, setForm] = useState({ label: '', quantity: '', unit: '', description: '', outcome_date: '', verification_note: '' });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['admin', 'outcomes', projectId] });
  const act = async (fn: () => Promise<void>, msg: string) => {
    try {
      await fn();
      refresh();
      toast.success(msg);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <div className="flex flex-col gap-6">
      <Alert tone="info">Outcomes appear publicly only after a publisher verifies them. Record how each was verified in the internal note.</Alert>
      {(query.data ?? []).length > 0 ? (
        <ul className="flex flex-col divide-y divide-ink-100 rounded-card bg-white shadow-[inset_0_0_0_1px_rgb(34_41_35/0.08)]">
          {query.data!.map((o) => (
            <li key={o.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">
                  {o.quantity !== null && <span className="text-forest-700">{Number(o.quantity)} {o.unit} </span>}
                  {o.label}
                </p>
                <p className="text-sm text-ink-600">
                  {o.outcome_date ? formatDate(o.outcome_date) : 'No date'} · {o.verification_note || 'No verification note'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {o.is_verified ? <Badge tone="success"><CheckCircle2 aria-hidden="true" className="size-3" /> Verified</Badge> : <Badge tone="gold">Not verified</Badge>}
                {o.is_featured && <Badge tone="forest">Featured</Badge>}
                {canVerify && (
                  <>
                    <Button size="sm" variant="secondary" onClick={() => act(() => saveOutcome(o.id, { project_id: projectId, label: o.label, is_verified: !o.is_verified }), o.is_verified ? 'Verification removed.' : 'Outcome verified.')}>
                      {o.is_verified ? 'Unverify' : 'Verify'}
                    </Button>
                    {o.is_verified && (
                      <Button size="sm" variant="ghost" onClick={() => act(() => saveOutcome(o.id, { project_id: projectId, label: o.label, is_featured: !o.is_featured }), 'Updated.')}>
                        {o.is_featured ? 'Unfeature' : 'Feature'}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" aria-label={`Delete outcome ${o.label}`} onClick={() => act(() => deleteOutcome(o.id), 'Outcome deleted.')}>
                      <Trash2 aria-hidden="true" className="size-4" />
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No outcomes recorded" />
      )}
      <Card title="Record an outcome">
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (form.label.trim().length < 3) return toast.error('Describe the outcome (at least 3 characters).');
            void act(async () => {
              await saveOutcome(null, {
                project_id: projectId,
                label: form.label.trim(),
                quantity: form.quantity ? Number(form.quantity) : null,
                unit: form.unit.trim() || null,
                description: form.description.trim() || null,
                outcome_date: form.outcome_date || null,
                verification_note: form.verification_note.trim() || null,
              });
              setForm({ label: '', quantity: '', unit: '', description: '', outcome_date: '', verification_note: '' });
            }, 'Outcome recorded.');
          }}
        >
          <Field id="oc-label" label="What was achieved" required className="sm:col-span-2" hint="e.g. School kits distributed">
            <Input value={form.label} maxLength={200} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </Field>
          <Field id="oc-qty" label="Quantity" optionalLabel>
            <Input type="number" min={0} step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          </Field>
          <Field id="oc-unit" label="Unit" optionalLabel hint="e.g. kits, students, households">
            <Input value={form.unit} maxLength={40} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          </Field>
          <Field id="oc-date" label="Date" optionalLabel>
            <Input type="date" max={todayISO()} value={form.outcome_date} onChange={(e) => setForm({ ...form, outcome_date: e.target.value })} />
          </Field>
          <Field id="oc-desc" label="Public description" optionalLabel>
            <Input value={form.description} maxLength={1000} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field id="oc-note" label="How was this verified? (internal)" className="sm:col-span-2">
            <Textarea rows={2} maxLength={1000} value={form.verification_note} onChange={(e) => setForm({ ...form, verification_note: e.target.value })} />
          </Field>
          <div className="sm:col-span-2"><Button type="submit">Add outcome</Button></div>
        </form>
      </Card>
    </div>
  );
}

function PhotosPanel({ projectId }: { projectId: string }) {
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const query = useQuery({
    queryKey: ['admin', 'media', { projectId }],
    queryFn: async () => {
      const res = await listMedia({ projectId, page: 1, pageSize: 60 });
      const previews = await privatePreviewUrls(res.rows.filter((m) => m.status !== 'published').map((m) => m.private_path));
      return { ...res, previews };
    },
  });
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-600">Photos linked to this project. Review consent and publish them in the <Link to="/admin/media" className="text-forest-700 underline">photo library</Link>.</p>
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
              for (const file of files) {
                try {
                  await uploadPhoto(file, auth.userId, { projectId });
                  ok += 1;
                } catch (err) {
                  toast.error(errorMessage(err));
                }
              }
              setUploading(false);
              if (ok) toast.success(`${ok} photo${ok === 1 ? '' : 's'} uploaded for review.`);
              void queryClient.invalidateQueries({ queryKey: ['admin', 'media'] });
            }}
          />
        </label>
      </div>
      {(query.data?.rows ?? []).length ? (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {query.data!.rows.map((m) => {
            const src = m.status === 'published' ? publicMediaUrl(m.public_path) : query.data!.previews[m.private_path];
            return (
              <li key={m.id} className="flex flex-col gap-2">
                <div className="aspect-[4/3] overflow-hidden rounded-md bg-ivory-200">{src && <img src={src} alt={m.alt_text} className="h-full w-full object-cover" />}</div>
                <MediaStatusBadge status={m.status} />
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title="No photos yet" />
      )}
    </div>
  );
}

function VolunteersPanel({ projectId }: { projectId: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const assigned = useQuery({ queryKey: ['admin', 'project-volunteers', projectId], queryFn: () => listProjectVolunteers(projectId) });
  const candidates = useQuery({ queryKey: ['admin', 'assignable-volunteers'], queryFn: listAssignableVolunteers });
  const [volunteerId, setVolunteerId] = useState('');
  const [role, setRole] = useState('');
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['admin', 'project-volunteers', projectId] });
  const act = async (fn: () => Promise<void>, msg: string) => {
    try {
      await fn();
      refresh();
      toast.success(msg);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const taken = new Set((assigned.data ?? []).map((a) => a.volunteer_id));
  return (
    <div className="flex flex-col gap-6">
      {(assigned.data ?? []).length ? (
        <ul className="flex flex-col divide-y divide-ink-100 rounded-card bg-white shadow-[inset_0_0_0_1px_rgb(34_41_35/0.08)]">
          {assigned.data!.map((a) => (
            <li key={a.volunteer_id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Link to={`/admin/volunteers/${a.volunteer_id}`} className="font-medium text-forest-700 hover:underline">{a.volunteer?.full_name}</Link>
                <p className="text-sm text-ink-600">{a.role_description || 'No role description'}</p>
              </div>
              <div className="flex items-center gap-2">
                <AssignmentStatusBadge status={a.status} />
                <Select aria-label="Assignment status" className="h-9 w-40 text-sm" value={a.status} onChange={(e) => act(() => updateAssignment(projectId, a.volunteer_id, { status: e.target.value as Enums<'assignment_status'> }), 'Assignment updated.')}>
                  {Object.entries(ASSIGNMENT_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
                <Button size="sm" variant="ghost" aria-label={`Remove ${a.volunteer?.full_name}`} onClick={() => act(() => removeAssignment(projectId, a.volunteer_id), 'Removed.')}>
                  <Trash2 aria-hidden="true" className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No volunteers assigned" />
      )}
      <Card title="Assign a volunteer">
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (!volunteerId) return;
            void act(async () => {
              await assignVolunteer(projectId, volunteerId, role);
              setVolunteerId('');
              setRole('');
            }, 'Volunteer assigned.');
          }}
        >
          <Field id="pv-volunteer" label="Approved volunteer">
            <Select value={volunteerId} onChange={(e) => setVolunteerId(e.target.value)}>
              <option value="">Choose…</option>
              {(candidates.data ?? []).filter((v) => !taken.has(v.id)).map((v) => <option key={v.id} value={v.id}>{v.full_name}</option>)}
            </Select>
          </Field>
          <Field id="pv-role" label="Role" optionalLabel>
            <Input value={role} maxLength={200} onChange={(e) => setRole(e.target.value)} />
          </Field>
          <Button type="submit" disabled={!volunteerId}>Assign</Button>
        </form>
      </Card>
    </div>
  );
}

function BudgetPanel({ projectId }: { projectId: string }) {
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canEdit = auth.hasRole('admin', 'treasurer');
  const budget = useQuery({ queryKey: ['admin', 'budget', projectId], queryFn: () => getBudget(projectId) });
  const position = useQuery({ queryKey: ['admin', 'project-position', projectId], queryFn: () => getProjectPosition(projectId), enabled: canEdit });
  const [form, setForm] = useState<{ amount: string; approved_on: string; reference: string; show: boolean } | null>(null);
  if (budget.isLoading) return <LoadingBlock />;
  const b = budget.data;
  const values = form ?? { amount: b ? String(b.approved_budget) : '', approved_on: b?.approved_on ?? todayISO(), reference: b?.approval_reference ?? '', show: b?.show_publicly ?? false };
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Approved budget">
        {canEdit ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const amount = Number(values.amount);
              if (!Number.isFinite(amount) || amount < 0) return toast.error('Enter a valid amount.');
              try {
                await saveBudget(projectId, Boolean(b), {
                  approved_budget: amount,
                  approved_on: values.approved_on,
                  approval_reference: values.reference.trim() || null,
                  show_publicly: values.show,
                });
                setForm(null);
                void queryClient.invalidateQueries({ queryKey: ['admin', 'budget', projectId] });
                toast.success('Budget saved.');
              } catch (err) {
                toast.error(errorMessage(err));
              }
            }}
          >
            <Field id="b-amount" label="Approved budget (₹)" required>
              <Input inputMode="decimal" value={values.amount} onChange={(e) => setForm({ ...values, amount: e.target.value })} />
            </Field>
            <Field id="b-date" label="Approved on" required>
              <Input type="date" value={values.approved_on} onChange={(e) => setForm({ ...values, approved_on: e.target.value })} />
            </Field>
            <Field id="b-ref" label="Approval reference" optionalLabel hint="e.g. Committee meeting, 12 Sept 2026">
              <Input value={values.reference} maxLength={200} onChange={(e) => setForm({ ...values, reference: e.target.value })} />
            </Field>
            <Checkbox label="Show budget and verified spending on the public project page" checked={values.show} onChange={(e) => setForm({ ...values, show: e.target.checked })} />
            <div><Button type="submit">Save budget</Button></div>
          </form>
        ) : b ? (
          <p>{formatINR(b.approved_budget)} approved on {formatDate(b.approved_on)}{b.show_publicly ? ' · shown publicly' : ''}</p>
        ) : (
          <p className="text-sm text-ink-600">No budget recorded. The treasurer records approved budgets.</p>
        )}
      </Card>
      {canEdit && (
        <Card title="Position from the ledger">
          {position.data ? (
            <dl className="grid grid-cols-2 gap-4">
              <div><dt className="text-sm text-ink-600">Allocated</dt><dd className="font-display text-xl font-semibold">{formatINR(position.data.allocated)}</dd></div>
              <div><dt className="text-sm text-ink-600">Restricted income</dt><dd className="font-display text-xl font-semibold">{formatINR(position.data.restricted_income)}</dd></div>
              <div><dt className="text-sm text-ink-600">Verified spending</dt><dd className="font-display text-xl font-semibold">{formatINR(position.data.expenditure)}</dd></div>
              <div><dt className="text-sm text-ink-600">Pending entries</dt><dd className="font-display text-xl font-semibold">{position.data.pending_count}</dd></div>
            </dl>
          ) : (
            <LoadingBlock />
          )}
        </Card>
      )}
    </div>
  );
}

export function ProjectEditorPage() {
  const { id } = useParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('details');
  const query = useQuery({ queryKey: ['admin', 'project', id], queryFn: () => getProject(id!), enabled: Boolean(id) });

  if (id && query.isLoading) return <LoadingBlock label="Loading project" />;
  if (id && query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  if (id && !query.data) return <EmptyState title="Project not found" />;
  const project = query.data ?? null;

  return (
    <>
      <PageHeader
        title={project ? project.title : 'New project'}
        back={{ to: '/admin/projects', label: 'All projects' }}
        meta={project && (
          <>
            <PublishedBadge published={project.is_published} />
            <span>Updated {formatDate(project.updated_at)}</span>
          </>
        )}
        actions={project?.is_published && (
          <a href={`/our-work/${project.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-forest-700 hover:underline">
            View on website <ExternalLink aria-hidden="true" className="size-4" />
          </a>
        )}
      />
      {project ? (
        <Tabs
          label="Project sections"
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'details', label: 'Details' },
            { id: 'outcomes', label: 'Verified outcomes' },
            { id: 'photos', label: 'Photos' },
            { id: 'volunteers', label: 'Volunteers', hidden: !auth.hasRole('admin', 'volunteer_coordinator') },
            { id: 'budget', label: 'Budget', hidden: !auth.hasRole('admin', 'treasurer', 'publisher') },
          ]}
        >
          {tab === 'details' && (
            <Card>
              <DetailsForm
                key={project.updated_at}
                project={project}
                onSaved={() => {
                  void queryClient.invalidateQueries({ queryKey: ['admin', 'project', id] });
                  void queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
                  toast.success('Project saved.');
                }}
              />
            </Card>
          )}
          {tab === 'outcomes' && <OutcomesPanel projectId={project.id} />}
          {tab === 'photos' && <PhotosPanel projectId={project.id} />}
          {tab === 'volunteers' && <VolunteersPanel projectId={project.id} />}
          {tab === 'budget' && <BudgetPanel projectId={project.id} />}
        </Tabs>
      ) : (
        <Card>
          <DetailsForm
            project={null}
            onSaved={(newId) => {
              void queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
              toast.success('Project created.');
              navigate(`/admin/projects/${newId}`, { replace: true });
            }}
          />
        </Card>
      )}
    </>
  );
}
