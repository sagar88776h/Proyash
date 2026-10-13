import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { MessageSquareDot, Plus } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { QueryState } from '@/components/QueryState';
import { ButtonLink } from '@/components/ui/Button';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { Field, Input, Select } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { useAuth } from '@/features/auth/useAuth';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatDate } from '@/lib/format';
import { ASSISTANCE_CATEGORY_LABELS, ASSISTANCE_STATUS_LABELS } from '@/lib/labels';
import type { Enums } from '@/types/database';
import { listRequests, type RequestRow } from '../api/requests';
import { DataTable, type Column } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { AssistanceStatusBadge } from '../components/StatusBadges';

const PAGE_SIZE = 25;

export function RequestsListPage() {
  const auth = useAuth();
  const [params, setParams] = useSearchParams();
  const statusParam = params.get('status') ?? 'open';
  const status = (statusParam === 'all' ? '' : statusParam) as Enums<'assistance_status'> | '' | 'open';
  const category = (params.get('category') ?? '') as Enums<'assistance_category'> | '';
  const urgency = (params.get('urgency') ?? '') as Enums<'assistance_urgency'> | '';
  const mine = params.get('mine') === '1';
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
    queryKey: ['admin', 'requests', { status, category, urgency, mine, page, debounced }],
    queryFn: () =>
      listRequests({ status, category, urgency, assignedTo: mine ? (auth.userId ?? undefined) : undefined, search: debounced, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const columns: Column<RequestRow>[] = [
    {
      key: 'ref',
      header: 'Reference',
      cell: (r) => (
        <span className="inline-flex items-center gap-1.5 font-mono text-[0.8125rem]">
          {r.reference_code}
          {r.has_unread_followup && <MessageSquareDot aria-label="New information from applicant" className="size-4 text-gold-700" />}
        </span>
      ),
    },
    { key: 'received', header: 'Received', cell: (r) => formatDate(r.created_at) },
    { key: 'category', header: 'Type', cell: (r) => ASSISTANCE_CATEGORY_LABELS[r.category] },
    { key: 'urgency', header: 'Urgency', cell: (r) => (r.urgency === 'urgent' ? <Badge tone="danger">Urgent</Badge> : 'Standard') },
    { key: 'name', header: 'Applicant', cell: (r) => (r.redacted_at ? <span className="text-ink-500 italic">Redacted</span> : r.applicant_name) },
    { key: 'place', header: 'Village / locality', cell: (r) => r.village?.name ?? r.locality ?? '—', hideOnMobile: true },
    { key: 'status', header: 'Status', cell: (r) => <AssistanceStatusBadge status={r.status} /> },
    { key: 'reviewer', header: 'Reviewer', cell: (r) => r.reviewer?.full_name || '—', hideOnMobile: true },
  ];

  return (
    <>
      <PageHeader
        title="Requests for help"
        description="Private requests submitted online or recorded by the team. Only reviewers and administrators can see them."
        actions={
          <ButtonLink to="/admin/requests/new" variant="primary" size="sm" iconLeft={<Plus aria-hidden="true" className="size-4" />}>
            Record a request
          </ButtonLink>
        }
      />
      <form role="search" aria-label="Filter requests" onSubmit={(e) => e.preventDefault()} className="mb-6 grid gap-4 rounded-card bg-white p-4 shadow-[inset_0_0_0_1px_rgb(34_41_35/0.08)] sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Search" id="req-search" hint="Reference, name or phone">
          <Input type="search" value={search} onChange={(e) => { setSearch(e.target.value); set('page', ''); }} />
        </Field>
        <Field label="Status" id="req-status">
          <Select value={statusParam} onChange={(e) => set('status', e.target.value)}>
            <option value="open">Open (not closed)</option>
            <option value="all">All statuses</option>
            {Object.entries(ASSISTANCE_STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>
        <Field label="Type" id="req-category">
          <Select value={category} onChange={(e) => set('category', e.target.value)}>
            <option value="">All types</option>
            {Object.entries(ASSISTANCE_CATEGORY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>
        <Field label="Urgency" id="req-urgency">
          <Select value={urgency} onChange={(e) => set('urgency', e.target.value)}>
            <option value="">Any urgency</option>
            <option value="urgent">Urgent</option>
            <option value="standard">Standard</option>
          </Select>
        </Field>
        <Field label="Assigned" id="req-mine">
          <Select value={mine ? '1' : ''} onChange={(e) => set('mine', e.target.value)}>
            <option value="">Anyone</option>
            <option value="1">Assigned to me</option>
          </Select>
        </Field>
      </form>
      <QueryState
        query={query}
        isEmpty={(d) => d.rows.length === 0}
        empty={<EmptyState title="No requests match" description="Try changing the filters." />}
      >
        {(d) => (
          <div className="flex flex-col gap-4">
            <DataTable rows={d.rows} columns={columns} rowKey={(r) => r.id} rowHref={(r) => `/admin/requests/${r.id}`} caption="Requests for help" />
            <Pagination page={page} pageSize={PAGE_SIZE} total={d.count} onPageChange={(p) => set('page', String(p))} />
          </div>
        )}
      </QueryState>
    </>
  );
}
