import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { QueryState } from '@/components/QueryState';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { Field, Input, Select } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatDate } from '@/lib/format';
import { AVAILABILITY_LABELS, SKILL_LABELS, VOLUNTEER_STATUS_LABELS } from '@/lib/labels';
import type { Enums } from '@/types/database';
import { listVolunteers, type VolunteerRow } from '../api/volunteers';
import { DataTable, type Column } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { VolunteerStatusBadge } from '../components/StatusBadges';

const PAGE_SIZE = 25;

export function VolunteersListPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? '') as Enums<'volunteer_status'> | '';
  const skill = params.get('skill') ?? '';
  const availability = params.get('availability') ?? '';
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
    queryKey: ['admin', 'volunteers', { status, skill, availability, page, debounced }],
    queryFn: () => listVolunteers({ status, skill, availability, search: debounced, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const columns: Column<VolunteerRow>[] = [
    { key: 'name', header: 'Name', cell: (v) => v.full_name },
    { key: 'registered', header: 'Registered', cell: (v) => formatDate(v.created_at) },
    { key: 'place', header: 'Village / locality', cell: (v) => v.village?.name ?? v.locality ?? '—' },
    { key: 'skills', header: 'Skills', cell: (v) => v.skills.map((s) => SKILL_LABELS[s] ?? s).slice(0, 3).join(', ') || '—', hideOnMobile: true },
    { key: 'age', header: 'Age', cell: (v) => (v.is_adult ? '18+' : <Badge tone="warning">Under 18</Badge>), hideOnMobile: true },
    { key: 'status', header: 'Status', cell: (v) => <VolunteerStatusBadge status={v.status} /> },
  ];
  return (
    <>
      <PageHeader title="Volunteers" description="Registrations and volunteer records. Contact details are visible only to coordinators and administrators." />
      <form role="search" aria-label="Filter volunteers" onSubmit={(e) => e.preventDefault()} className="mb-6 grid gap-4 rounded-card bg-white p-4 shadow-[inset_0_0_0_1px_rgb(34_41_35/0.08)] sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Search" id="vol-search" hint="Name or phone">
          <Input type="search" value={search} onChange={(e) => { setSearch(e.target.value); set('page', ''); }} />
        </Field>
        <Field label="Status" id="vol-status">
          <Select value={status} onChange={(e) => set('status', e.target.value)}>
            <option value="">All statuses</option>
            {Object.entries(VOLUNTEER_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Skill" id="vol-skill">
          <Select value={skill} onChange={(e) => set('skill', e.target.value)}>
            <option value="">Any skill</option>
            {Object.entries(SKILL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Availability" id="vol-availability">
          <Select value={availability} onChange={(e) => set('availability', e.target.value)}>
            <option value="">Any time</option>
            {Object.entries(AVAILABILITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
      </form>
      <QueryState query={query} isEmpty={(d) => d.rows.length === 0} empty={<EmptyState title="No volunteers match" />}>
        {(d) => (
          <div className="flex flex-col gap-4">
            <DataTable rows={d.rows} columns={columns} rowKey={(v) => v.id} rowHref={(v) => `/admin/volunteers/${v.id}`} caption="Volunteers" />
            <Pagination page={page} pageSize={PAGE_SIZE} total={d.count} onPageChange={(p) => set('page', String(p))} />
          </div>
        )}
      </QueryState>
    </>
  );
}
