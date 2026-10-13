import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { QueryState } from '@/components/QueryState';
import { Button } from '@/components/ui/Button';
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { useAuth } from '@/features/auth/useAuth';
import {
  CONTENT_KEYS,
  mergeContent,
  PAGE_DEFINITIONS,
  type ContentItem,
  type ContentKey,
  type FieldDef,
  type PageContent,
} from '@/content/registry';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { contentState, getContent, publishContent, saveContentDraft, unpublishContent, type ContentRow, type ContentVersion } from '../api/admin';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MarkdownField } from '../components/MarkdownField';
import { MediaSelect } from '../components/MediaSelect';
import { Card, PageHeader } from '../components/PageHeader';
import { useToast } from '../components/useToast';

function ItemsEditor({ field, value, onChange }: { field: Extract<FieldDef, { type: 'items' }>; value: ContentItem[]; onChange: (v: ContentItem[]) => void }) {
  const update = (i: number, patch: Partial<ContentItem>) => onChange(value.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...value];
    const [item] = next.splice(i, 1);
    next.splice(i + dir, 0, item!);
    onChange(next);
  };
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-2 font-medium text-ink-900">{field.label}</legend>
      {field.hint && <p className="-mt-1 text-sm text-ink-600">{field.hint}</p>}
      {value.length === 0 && <p className="text-sm text-ink-600">No entries. This section will be hidden on the website.</p>}
      <ol className="flex flex-col gap-4">
        {value.map((item, i) => (
          <li key={i} className="rounded-md border border-ink-100 bg-ivory-50 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-ink-700">
                {field.itemLabel.charAt(0).toUpperCase() + field.itemLabel.slice(1)} {i + 1}
              </span>
              <span className="flex gap-1">
                <Button type="button" size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${field.itemLabel} ${i + 1} up`}>
                  <ArrowUp aria-hidden="true" className="size-4" />
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={i === value.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${field.itemLabel} ${i + 1} down`}>
                  <ArrowDown aria-hidden="true" className="size-4" />
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => onChange(value.filter((_, idx) => idx !== i))} aria-label={`Remove ${field.itemLabel} ${i + 1}`}>
                  <Trash2 aria-hidden="true" className="size-4" />
                </Button>
              </span>
            </div>
            <div className="grid gap-3">
              <Field id={`${field.name}-${i}-title`} label="Title">
                <Input value={item.title} maxLength={120} onChange={(e) => update(i, { title: e.target.value })} />
              </Field>
              <Field id={`${field.name}-${i}-body`} label="Text">
                <Textarea rows={2} value={item.body} maxLength={600} onChange={(e) => update(i, { body: e.target.value })} />
              </Field>
            </div>
          </li>
        ))}
      </ol>
      {value.length < field.maxItems && (
        <Button type="button" size="sm" variant="secondary" className="self-start" iconLeft={<Plus aria-hidden="true" className="size-4" />} onClick={() => onChange([...value, { title: '', body: '' }])}>
          Add {field.itemLabel}
        </Button>
      )}
    </fieldset>
  );
}

function FieldEditor({ field, value, onChange }: { field: FieldDef; value: PageContent[string] | undefined; onChange: (v: PageContent[string]) => void }) {
  const id = `content-${field.name}`;
  if (field.type === 'items') return <ItemsEditor field={field} value={Array.isArray(value) ? value : []} onChange={onChange} />;
  const text = typeof value === 'string' ? value : '';
  if (field.name.endsWith('_media_id')) {
    return <MediaSelect id={id} label={field.label.replace(/ \(media ID\)$/, '')} value={text || null} onChange={(v) => onChange(v ?? '')} hint="Only published photos can be chosen." />;
  }
  if (field.type === 'markdown') return <MarkdownField id={id} label={field.label} value={text} onChange={onChange} max={field.max} hint={field.hint} rows={field.max > 6000 ? 18 : 8} />;
  const counter = `${text.length} / ${field.max}`;
  return (
    <Field id={id} label={field.label} hint={field.hint ? `${field.hint} · ${counter}` : counter}>
      {field.type === 'textarea' ? (
        <Textarea rows={field.max > 400 ? 5 : 3} value={text} maxLength={field.max} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input value={text} maxLength={field.max} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  );
}

/** Removes empty item rows so half-filled entries are never published. */
function cleaned(content: PageContent): PageContent {
  const out: PageContent = {};
  for (const [k, v] of Object.entries(content)) {
    out[k] = Array.isArray(v) ? v.map((i) => ({ title: i.title.trim(), body: i.body.trim() })).filter((i) => i.title || i.body) : v;
  }
  return out;
}

function Editor({ pageKey, row, versions }: { pageKey: ContentKey; row: ContentRow; versions: ContentVersion[] }) {
  const def = PAGE_DEFINITIONS[pageKey];
  const toast = useToast();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const initial = useMemo(() => mergeContent(pageKey, row.draft ?? row.published), [pageKey, row.draft, row.published]);
  const [content, setContent] = useState<PageContent>(initial);
  const [busy, setBusy] = useState<'save' | 'publish' | null>(null);
  const [confirm, setConfirm] = useState<'unpublish' | 'discard' | null>(null);
  const [error, setError] = useState<string>();
  const dirty = JSON.stringify(cleaned(content)) !== JSON.stringify(cleaned(initial));
  const state = contentState(row);
  const isLegal = pageKey === 'privacy' || pageKey === 'terms';

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'content'] });
    await queryClient.invalidateQueries({ queryKey: ['content', pageKey] });
  };

  const validate = () => {
    for (const field of def.fields) {
      const v = content[field.name];
      if (field.type === 'items' && Array.isArray(v)) {
        const bad = cleaned({ [field.name]: v })[field.name] as ContentItem[];
        if (bad.some((i) => !i.title)) return `Every ${field.itemLabel} in “${field.label}” needs a title.`;
      }
    }
    if (isLegal && !String(content.last_updated ?? '').trim()) return 'Enter the “Last updated” date before saving the policy.';
    return undefined;
  };

  const save = async (andPublish: boolean) => {
    setError(undefined);
    const problem = validate();
    if (problem) return setError(problem);
    setBusy(andPublish ? 'publish' : 'save');
    try {
      await saveContentDraft(pageKey, cleaned(content));
      if (andPublish) {
        const version = await publishContent(pageKey);
        toast.success(`Published version ${version}. The website now shows these changes.`);
      } else {
        toast.success('Draft saved. It is not visible on the website until you publish it.');
      }
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        title={def.label}
        documentTitle={`Edit ${def.label}`}
        back={{ to: '/admin/content', label: 'All pages' }}
        description={def.description}
        meta={
          <>
            {state.hasPublished ? <Badge tone="success">Published version {row.version}</Badge> : <Badge>Website shows default text</Badge>}
            {state.hasChanges && <Badge tone="warning">Draft has unpublished changes</Badge>}
            {dirty && <Badge tone="warning">Unsaved edits</Badge>}
          </>
        }
        actions={
          <a href={def.path} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-forest-700 underline underline-offset-2">
            View live page <ExternalLink aria-hidden="true" className="size-4" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        }
      />

      {isLegal && !state.hasPublished && (
        <Alert tone="warning" title="Draft legal text" className="mb-6">
          The default text is a starting draft written for this website. Have it reviewed by someone qualified, adjust it to how PRAYASH actually handles information, then publish it.
        </Alert>
      )}
      {pageKey === 'about' && (
        <Alert tone="info" className="mb-6">Only include history, people and achievements that PRAYASH has confirmed. Leave “Our story” empty rather than guessing.</Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <form
          className="flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            void save(false);
          }}
        >
          <Card>
            <div className="flex flex-col gap-6">
              {def.fields.map((field) => (
                <FieldEditor key={field.name} field={field} value={content[field.name]} onChange={(v) => setContent((c) => ({ ...c, [field.name]: v }))} />
              ))}
            </div>
          </Card>
          {error && <Alert tone="danger" live="assertive">{error}</Alert>}
          <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap gap-3 border-t border-ink-100 bg-ivory-100/95 px-4 py-3 backdrop-blur-sm sm:mx-0 sm:rounded-md sm:border">
            <Button type="submit" variant="secondary" loading={busy === 'save'} disabled={busy !== null}>Save draft</Button>
            <Button type="button" loading={busy === 'publish'} disabled={busy !== null || (!dirty && !state.hasChanges && state.hasPublished)} onClick={() => void save(true)}>
              Save and publish
            </Button>
            {dirty && (
              <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => setContent(initial)}>Undo edits</Button>
            )}
          </div>
        </form>

        <aside className="flex flex-col gap-6" aria-label="Publishing">
          <Card title="Publishing">
            <dl className="flex flex-col gap-3 text-sm">
              <div>
                <dt className="text-ink-600">Last published</dt>
                <dd className="font-medium">{row.published_at && state.hasPublished ? formatDateTime(row.published_at) : 'Never — defaults are shown'}</dd>
              </div>
              <div>
                <dt className="text-ink-600">Draft last saved</dt>
                <dd className="font-medium">{row.draft_updated_at ? formatDateTime(row.draft_updated_at) : '—'}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-col gap-2">
              <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => setContent(PAGE_DEFINITIONS[pageKey].defaults)}>Load default text into editor</Button>
              {state.hasChanges && (
                <Button size="sm" variant="ghost" onClick={() => setConfirm('discard')}>Discard draft changes</Button>
              )}
              {state.hasPublished && auth.hasRole('admin', 'publisher') && (
                <Button size="sm" variant="ghost" onClick={() => setConfirm('unpublish')}>Revert website to default text</Button>
              )}
            </div>
          </Card>
          <Card title="Published versions">
            {versions.length === 0 ? (
              <p className="text-sm text-ink-600">No versions published yet.</p>
            ) : (
              <ol className="flex flex-col divide-y divide-ink-100 text-sm">
                {versions.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2 py-2">
                    <span>
                      Version {v.version}
                      <span className="block text-ink-600">{formatDateTime(v.published_at)}</span>
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => setContent(mergeContent(pageKey, v.content))} aria-label={`Load version ${v.version} into the editor`}>
                      Load
                    </Button>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </aside>
      </div>

      <ConfirmDialog
        open={confirm === 'discard'}
        onClose={() => setConfirm(null)}
        title="Discard draft changes?"
        description="The draft will be replaced with the currently published version (or the default text). The website does not change."
        confirmLabel="Discard draft"
        tone="danger"
        onConfirm={async () => {
          await saveContentDraft(pageKey, (row.published as Record<string, unknown> | null) ?? null);
          await refresh();
          toast.success('Draft discarded.');
        }}
      />
      <ConfirmDialog
        open={confirm === 'unpublish'}
        onClose={() => setConfirm(null)}
        title="Revert the website to default text?"
        description="The published version is removed and the page shows its default text until you publish again. Earlier versions stay in the history."
        confirmLabel="Revert to defaults"
        tone="danger"
        onConfirm={async () => {
          await unpublishContent(pageKey);
          await refresh();
          toast.success('The page now shows its default text.');
        }}
      />
    </>
  );
}

export function ContentEditorPage() {
  const { key = '' } = useParams();
  const valid = (CONTENT_KEYS as readonly string[]).includes(key);
  const query = useQuery({ queryKey: ['admin', 'content', key], queryFn: () => getContent(key), enabled: valid });
  if (!valid) return <EmptyState title="Page not found" description="There is no editable page with this name." />;
  return (
    <QueryState query={query}>
      {({ row, versions }) =>
        row ? (
          <Editor key={`${row.version}-${row.draft_updated_at ?? ''}`} pageKey={key as ContentKey} row={row} versions={versions} />
        ) : (
          <EmptyState title="Page not found" description="This page has not been set up in the database." />
        )
      }
    </QueryState>
  );
}
