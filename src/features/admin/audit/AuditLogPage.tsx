import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { QueryState } from '@/components/QueryState';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { Field, Input, Select } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { useAuth } from '@/features/auth/useAuth';
import { formatDateTime } from '@/lib/format';
import { AUDIT_ENTITIES, listAudit, teamNames, type AuditRow } from '../api/admin';
import { DataTable, type Column } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';

const PAGE_SIZE = 50;

/** Entity types a treasurer may read (mirrors the activity_logs RLS policy). */
const FINANCE_ENTITIES = [
  'ledger_entries',
  'donations',
  'expenses',
  'ledger_evidence',
  'financial_accounts',
  'reconciliations',
  'financial_reports',
  'financial_report_documents',
  'project_budgets',
];

const ACTION_LABELS: Record<string, string> = { insert: 'Created', update: 'Changed', delete: 'Deleted' };

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v.length > 120 ? `${v.slice(0, 120)}…` : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = JSON.stringify(v);
  return s.length > 120 ? `${s.slice(0, 120)}…` : s;
}

function Changes({ row }: { row: AuditRow }) {
  const c = (row.changes ?? {}) as Record<string, unknown>;
  const fields = Array.isArray(c.fields) ? (c.fields as string[]) : null;
  const oldV = (c.old ?? {}) as Record<string, unknown>;
  const newV = (c.new ?? {}) as Record<string, unknown>;
  if (fields) {
    return (
      <ul className="flex flex-col gap-1 text-xs">
        {fields.map((f) => (
          <li key={f}>
            <span className="font-medium">{f}</span>
            {f in oldV || f in newV ? (
              <span className="text-ink-600">: {formatValue(oldV[f])} → {formatValue(newV[f])}</span>
            ) : (
              <span className="text-ink-600"> (value not logged)</span>
            )}
          </li>
        ))}
      </ul>
    );
  }
  const keys = Object.keys(c);
  if (keys.length === 0) return <span className="text-ink-600">—</span>;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-forest-700">Details</summary>
      <pre className="mt-2 max-w-md overflow-x-auto rounded-sm bg-ivory-50 p-2 whitespace-pre-wrap">{JSON.stringify(c, null, 2)}</pre>
    </details>
  );
}

export function AuditLogPage() {
  const auth = useAuth();
  const [params, setParams] = useSearchParams();
  const entity = params.get('entity') ?? '';
  const entityId = params.get('id') ?? '';
  const actor = params.get('actor') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const isAdmin = auth.hasRole('admin');
  const entities = isAdmin ? Object.keys(AUDIT_ENTITIES) : FINANCE_ENTITIES;
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    if (key === 'entity') next.delete('id');
    setParams(next, { replace: true });
  };
  const showRecord = (type: string, id: string) => {
    const next = new URLSearchParams(params);
    next.set('entity', type);
    next.set('id', id);
    next.delete('page');
    setParams(next, { replace: true });
  };
  const query = useQuery({
    queryKey: ['admin', 'audit', { entity, entityId, actor, from, to, page }],
    queryFn: () => listAudit({ entity, entityId, actor, from, to, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const names = useQuery({ queryKey: ['admin', 'team-names'], queryFn: teamNames, staleTime: 5 * 60_000 });
  const who = (id: string | null) => (id ? (names.data?.get(id) ?? 'Former team member') : 'Website / system');

  const columns: Column<AuditRow>[] = [
    { key: 'when', header: 'When', cell: (r) => <time dateTime={r.occurred_at}>{formatDateTime(r.occurred_at)}</time> },
    { key: 'who', header: 'Who', cell: (r) => who(r.actor_id) },
    {
      key: 'what',
      header: 'What',
      cell: (r) => (
        <span className="flex flex-col gap-1">
          <span>
            <Badge tone={r.action === 'delete' ? 'danger' : r.action === 'insert' ? 'success' : 'neutral'}>{ACTION_LABELS[r.action] ?? r.action.replace(/_/g, ' ')}</Badge>{' '}
            {AUDIT_ENTITIES[r.entity_type] ?? r.entity_type}
          </span>
          {r.entity_id && (
            <button type="button" className="self-start font-mono text-xs text-ink-600 underline-offset-2 hover:underline" onClick={() => showRecord(r.entity_type, r.entity_id!)}>
              {r.entity_id.length > 24 ? `${r.entity_id.slice(0, 8)}…` : r.entity_id}
              <span className="sr-only"> — show history of this record</span>
            </button>
          )}
        </span>
      ),
    },
    { key: 'changes', header: 'Changes', cell: (r) => <Changes row={r} /> },
  ];

  return (
    <>
      <PageHeader
        title="Audit history"
        description={
          isAdmin
            ? 'Every change to records in the portal, in order. This history cannot be edited or deleted. Personal details are not copied into it.'
            : 'Changes to financial records. This history cannot be edited or deleted.'
        }
      />
      <form role="search" aria-label="Filter audit history" onSubmit={(e) => e.preventDefault()} className="mb-6 grid gap-4 rounded-card bg-white p-4 shadow-[inset_0_0_0_1px_rgb(34_41_35/0.08)] sm:grid-cols-2 lg:grid-cols-5">
        <Field id="audit-entity" label="Record type">
          <Select value={entity} onChange={(e) => set('entity', e.target.value)}>
            <option value="">All types</option>
            {entities.map((k) => <option key={k} value={k}>{AUDIT_ENTITIES[k] ?? k}</option>)}
          </Select>
        </Field>
        <Field id="audit-id" label="Record ID" hint="Exact ID">
          <Input value={entityId} onChange={(e) => set('id', e.target.value)} spellCheck={false} />
        </Field>
        <Field id="audit-actor" label="Person">
          <Select value={actor} onChange={(e) => set('actor', e.target.value)}>
            <option value="">Anyone</option>
            {[...(names.data?.entries() ?? [])].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </Select>
        </Field>
        <Field id="audit-from" label="From">
          <Input type="date" value={from} onChange={(e) => set('from', e.target.value)} />
        </Field>
        <Field id="audit-to" label="To">
          <Input type="date" value={to} onChange={(e) => set('to', e.target.value)} />
        </Field>
      </form>
      <QueryState query={query} isEmpty={(d) => d.rows.length === 0} empty={<EmptyState title="No matching history" description="Try removing a filter." />}>
        {({ rows, count }) => (
          <>
            <p className="mb-3 text-sm text-ink-600" aria-live="polite">{count === 1 ? '1 change' : `${count.toLocaleString('en-IN')} changes`}</p>
            <DataTable rows={rows} columns={columns} rowKey={(r) => String(r.id)} caption="Audit history" />
            <Pagination page={page} pageSize={PAGE_SIZE} total={count} onPageChange={(p) => set('page', String(p))} className="mt-6" />
          </>
        )}
      </QueryState>
    </>
  );
}
