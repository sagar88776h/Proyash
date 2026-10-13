import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, Star } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { QueryState } from '@/components/QueryState';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { Field, Input, Select } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatDate } from '@/lib/format';
import { ACTIVITY_CATEGORY_LABELS, PROJECT_STATUS_LABELS } from '@/lib/labels';
import { listProjects, type ProjectListRow } from '../api/programmes';
import { DataTable, type Column } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { ProjectStatusBadge, PublishedBadge } from '../components/StatusBadges';

const PAGE_SIZE = 25;

export function ProjectsListPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const published = params.get('published') ?? '';
  const category = params.get('category') ?? '';
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search);
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };
  const query = useQuery({
    queryKey: ['admin', 'projects', { status, published, category, page, debounced }],
    queryFn: () => listProjects({ status, published, category, search: debounced, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const columns: Column<ProjectListRow>[] = [
    { key: 'title', header: 'Project', cell: (p) => <span className="inline-flex items-center gap-1.5">{p.title}{p.is_featured && <Star aria-label="Featured" className="size-3.5 fill-gold-400 text-gold-500" />}</span> },
    { key: 'category', header: 'Activity', cell: (p) => ACTIVITY_CATEGORY_LABELS[p.category] },
    { key: 'village', header: 'Village', cell: (p) => p.village?.name ?? '—', hideOnMobile: true },
    { key: 'status', header: 'Status', cell: (p) => <ProjectStatusBadge status={p.status} /> },
    { key: 'published', header: 'Website', cell: (p) => <PublishedBadge published={p.is_published} /> },
    { key: 'updated', header: 'Updated', cell: (p) => formatDate(p.updated_at), hideOnMobile: true },
  ];
  return (
    <>
      <PageHeader
        title="Projects"
        description="Draft projects are visible only to the team. Publishers review and publish them."
        actions={<ButtonLink to="/admin/projects/new" size="sm" iconLeft={<Plus aria-hidden="true" className="size-4" />}>New project</ButtonLink>}
      />
      <form role="search" aria-label="Filter projects" onSubmit={(e) => e.preventDefault()} className="mb-6 grid gap-4 rounded-card bg-white p-4 shadow-[inset_0_0_0_1px_rgb(34_41_35/0.08)] sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Search" id="p-search"><Input type="search" value={search} onChange={(e) => { setSearch(e.target.value); set('page', ''); }} /></Field>
        <Field label="Status" id="p-status">
          <Select value={status} onChange={(e) => set('status', e.target.value)}>
            <option value="">Any status</option>
            {Object.entries(PROJECT_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Activity" id="p-category">
          <Select value={category} onChange={(e) => set('category', e.target.value)}>
            <option value="">All activities</option>
            {Object.entries(ACTIVITY_CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Website" id="p-published">
          <Select value={published} onChange={(e) => set('published', e.target.value)}>
            <option value="">Published and drafts</option>
            <option value="yes">Published</option>
            <option value="no">Drafts</option>
          </Select>
        </Field>
      </form>
      <QueryState query={query} isEmpty={(d) => d.rows.length === 0} empty={<EmptyState title="No projects match" />}>
        {(d) => (
          <div className="flex flex-col gap-4">
            <DataTable rows={d.rows} columns={columns} rowKey={(p) => p.id} rowHref={(p) => `/admin/projects/${p.id}`} caption="Projects" />
            <Pagination page={page} pageSize={PAGE_SIZE} total={d.count} onPageChange={(p) => set('page', String(p))} />
          </div>
        )}
      </QueryState>
    </>
  );
}
