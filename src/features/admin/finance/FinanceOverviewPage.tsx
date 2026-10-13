import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Lock, NotebookPen, Scale } from 'lucide-react';
import { Link } from 'react-router';
import { QueryState } from '@/components/QueryState';
import { ButtonLink } from '@/components/ui/Button';
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback';
import { useAuth } from '@/features/auth/useAuth';
import { formatDate, formatINR } from '@/lib/format';
import { ACCOUNT_TYPE_LABELS } from '@/lib/labels';
import { accountBalances, entryLabel, financeControls, listPendingEntries } from '../api/finance';
import { Card, PageHeader } from '../components/PageHeader';
import { Amount, EntryType } from './shared';

export function FinanceOverviewPage() {
  const auth = useAuth();
  const balances = useQuery({ queryKey: ['admin', 'finance', 'balances'], queryFn: () => accountBalances() });
  const pending = useQuery({ queryKey: ['admin', 'finance', 'pending'], queryFn: listPendingEntries });
  const controls = useQuery({ queryKey: ['admin', 'finance', 'controls'], queryFn: financeControls });
  const total = (balances.data ?? []).reduce((sum, b) => sum + Number(b.balance), 0);

  return (
    <>
      <PageHeader
        title="Finance"
        description="Balances are calculated from verified ledger entries only. Pending entries do not count until a second person verifies them."
        actions={
          <>
            <ButtonLink to="/admin/finance/new" size="sm" iconLeft={<NotebookPen aria-hidden="true" className="size-4" />}>Record an entry</ButtonLink>
            <ButtonLink to="/admin/finance/reconciliation" size="sm" variant="secondary" iconLeft={<Scale aria-hidden="true" className="size-4" />}>Reconcile</ButtonLink>
          </>
        }
      />
      {controls.data && !controls.data.independentVerification && (
        <Alert tone="warning" className="mb-6" title="Independent verification is switched off">
          Entries can currently be verified by the person who recorded them. An administrator can change this in Settings.
        </Alert>
      )}
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card title="Account balances" actions={<span className="text-sm text-ink-600">Total {formatINR(total)}</span>}>
          <QueryState query={balances} isEmpty={(rows) => rows.length === 0} empty={<EmptyState title="No accounts yet" description="Create the organisation’s bank, cash or wallet accounts first." action={<ButtonLink to="/admin/finance/accounts" size="sm">Add an account</ButtonLink>} />}>
            {(rows) => (
              <ul className="flex flex-col divide-y divide-ink-100">
                {rows.map((b) => (
                  <li key={b.account_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-medium">{b.name} {!b.is_active && <Badge tone="neutral">Inactive</Badge>}</p>
                      <p className="text-xs text-ink-600">
                        {ACCOUNT_TYPE_LABELS[b.account_type]}
                        {b.last_reconciled_on ? ` · reconciled ${formatDate(b.last_reconciled_on)}${Number(b.last_difference) !== 0 ? ' (difference)' : ''}` : ' · never reconciled'}
                        {b.locked_through && <span className="ml-1 inline-flex items-center gap-0.5"><Lock aria-hidden="true" className="size-3" /> locked to {formatDate(b.locked_through)}</span>}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-lg font-semibold tabular-nums">{formatINR(b.balance)}</p>
                      {Number(b.pending_count) > 0 && (
                        <p className="text-xs text-warning-700">
                          {b.pending_count} pending (+{formatINR(b.pending_in)} / −{formatINR(b.pending_out)})
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </Card>
        <Card title="Awaiting verification" actions={<Link to="/admin/finance/ledger?status=pending" className="text-sm font-medium text-forest-700 hover:underline">View all</Link>}>
          <QueryState query={pending} isEmpty={(rows) => rows.length === 0} empty={<EmptyState title="Nothing to verify" description="All recorded entries have been verified or rejected." />}>
            {(rows) => (
              <ul className="flex flex-col divide-y divide-ink-100">
                {rows.slice(0, 12).map((e) => {
                  const mine = e.recorded_by === auth.userId || e.last_edited_by === auth.userId;
                  return (
                    <li key={e.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <Link to={`/admin/finance/entries/${e.id}`} className="font-mono text-sm font-medium text-forest-700 hover:underline">{entryLabel(e.entry_no)}</Link>
                        <p className="truncate text-sm text-ink-700"><EntryType type={e.entry_type} /> · {e.description}</p>
                        <p className="text-xs text-ink-600">
                          {formatDate(e.entry_date)} · {e.source === 'public_report' ? 'Reported by donor' : `Recorded by ${e.recorder?.full_name || 'team member'}`}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Amount value={Number(e.amount)} direction={e.direction} />
                        {controls.data?.independentVerification && mine ? (
                          <Badge tone="neutral">Needs another verifier</Badge>
                        ) : (
                          <Badge tone="warning">You can verify</Badge>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </QueryState>
          {(pending.data?.some((e) => e.source === 'public_report') ?? false) && (
            <p className="mt-4 flex items-start gap-2 text-sm text-ink-600">
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning-700" />
              Donor reports must be matched to the bank statement before verifying. A screenshot is not proof of payment.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
