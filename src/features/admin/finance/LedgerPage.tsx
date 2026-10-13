import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { QueryState } from '@/components/QueryState';
import { EmptyState } from '@/components/ui/Feedback';
import { Field, Input, Select } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatDate } from '@/lib/format';
import { ENTRY_TYPE_LABELS, LEDGER_STATUS_LABELS } from '@/lib/labels';
import type { Enums } from '@/types/database';
import { entryLabel, listAccounts, listEntries, type EntryListRow } from '../api/finance';
import { DataTable, type Column } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { LedgerStatusBadge } from '../components/StatusBadges';
import { Amount, EntryType } from './shared';

const PAGE_SIZE = 30;

function counterparty(e: EntryListRow) {
  if (e.donation) return e.donation.is_anonymous ? 'Anonymous' : e.donation.donor_name;
  if (e.expense) return e.expense.payee_name;
  return e.project?.title ?? '';
}

export function LedgerPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? '') as Enums<'ledger_status'> | '';
  const type = (params.get('type') ?? '') as Enums<'ledger_entry_type'> | '';
  const accountId = params.get('account') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
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
  const accounts = useQuery({ queryKey: ['admin', 'finance', 'accounts'], queryFn: listAccounts });
  const query = useQuery({
    queryKey: ['admin', 'finance', 'ledger', { status, type, accountId, from, to, page, debounced }],
    queryFn: () => listEntries({ status, type, accountId, from, to, search: debounced, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const columns: Column<EntryListRow>[] = [
    { key: 'no', header: 'Entry', cell: (e) => <span className="font-mono text-[0.8125rem]">{entryLabel(e.entry_no)}</span> },
    { key: 'date', header: 'Date', cell: (e) => formatDate(e.entry_date) },
    { key: 'type', header: 'Type', cell: (e) => <EntryType type={e.entry_type} /> },
    { key: 'desc', header: 'Description', cell: (e) => <span className="line-clamp-2">{e.description}{counterparty(e) ? <span className="block text-xs text-ink-600">{counterparty(e)}</span> : null}</span>, hideOnMobile: true },
    { key: 'account', header: 'Account', cell: (e) => e.account?.name ?? (e.direction === 'internal' ? 'Allocation' : 'Not assigned'), hideOnMobile: true },
    { key: 'amount', header: 'Amount', align: 'right', cell: (e) => <Amount value={Number(e.amount)} direction={e.direction} /> },
    { key: 'status', header: 'Status', cell: (e) => <LedgerStatusBadge status={e.status} /> },
  ];
  return (
    <>
      <PageHeader title="Ledger" description="Every financial transaction, in date order. Entries are never edited after verification; corrections are linked reversals." />
      <form role="search" aria-label="Filter ledger" onSubmit={(e) => e.preventDefault()} className="mb-6 grid gap-4 rounded-card bg-white p-4 shadow-[inset_0_0_0_1px_rgb(34_41_35/0.08)] sm:grid-cols-2 lg:grid-cols-6">
        <Field label="Search" id="l-search" hint="TXN number, reference or description" className="lg:col-span-2">
          <Input type="search" value={search} onChange={(e) => { setSearch(e.target.value); set('page', ''); }} />
        </Field>
        <Field label="Status" id="l-status">
          <Select value={status} onChange={(e) => set('status', e.target.value)}>
            <option value="">All</option>
            {Object.entries(LEDGER_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Type" id="l-type">
          <Select value={type} onChange={(e) => set('type', e.target.value)}>
            <option value="">All types</option>
            {Object.entries(ENTRY_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Account" id="l-account">
          <Select value={accountId} onChange={(e) => set('account', e.target.value)}>
            <option value="">All accounts</option>
            {(accounts.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="From" id="l-from"><Input type="date" value={from} onChange={(e) => set('from', e.target.value)} /></Field>
          <Field label="To" id="l-to"><Input type="date" value={to} onChange={(e) => set('to', e.target.value)} /></Field>
        </div>
      </form>
      <QueryState query={query} isEmpty={(d) => d.rows.length === 0} empty={<EmptyState title="No entries match" />}>
        {(d) => (
          <div className="flex flex-col gap-4">
            <DataTable
              rows={d.rows}
              columns={columns}
              rowKey={(e) => e.id}
              rowHref={(e) => `/admin/finance/entries/${e.id}`}
              caption="Ledger entries"
              rowClassName={(e) => (e.status === 'rejected' ? 'bg-ink-50' : undefined)}
            />
            <Pagination page={page} pageSize={PAGE_SIZE} total={d.count} onPageChange={(p) => set('page', String(p))} />
          </div>
        )}
      </QueryState>
    </>
  );
}
