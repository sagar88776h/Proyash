import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Lock } from 'lucide-react';
import { useState } from 'react';
import { QueryState } from '@/components/QueryState';
import { Button } from '@/components/ui/Button';
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatDateTime, formatINR, todayISO } from '@/lib/format';
import type { Tables } from '@/types/database';
import { accountBalances, listReconciliations, reconcile } from '../api/finance';
import { Card, PageHeader } from '../components/PageHeader';
import { useToast } from '../components/useToast';

export function ReconciliationPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const balances = useQuery({ queryKey: ['admin', 'finance', 'balances'], queryFn: () => accountBalances() });
  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [statement, setStatement] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Tables<'reconciliations'> | null>(null);
  const [error, setError] = useState<string>();
  const history = useQuery({ queryKey: ['admin', 'finance', 'reconciliations', accountId], queryFn: () => listReconciliations(accountId || undefined) });
  const selected = balances.data?.find((b) => b.account_id === accountId);

  return (
    <>
      <PageHeader
        title="Reconciliation"
        description="Compare the ledger with a bank statement or cash count. A reconciliation with no difference locks that period for the account."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <Card title="Reconcile an account">
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const amount = Number(statement.replace(/,/g, ''));
              if (!accountId || !Number.isFinite(amount)) return;
              setBusy(true);
              setError(undefined);
              try {
                const r = await reconcile(accountId, date, amount, notes);
                setResult(r);
                setNotes('');
                void queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] });
                toast.success(Number(r.difference) === 0 ? 'Balanced. The period is now locked.' : 'Recorded with a difference to investigate.');
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {error && <Alert tone="danger" live="assertive">{error}</Alert>}
            <Field id="rc-account" label="Account" required>
              <Select value={accountId} onChange={(e) => { setAccountId(e.target.value); setResult(null); }}>
                <option value="">Choose…</option>
                {(balances.data ?? []).map((b) => <option key={b.account_id} value={b.account_id}>{b.name}</option>)}
              </Select>
            </Field>
            {selected?.locked_through && (
              <p className="flex items-center gap-1.5 text-sm text-ink-600"><Lock aria-hidden="true" className="size-4" /> Locked through {formatDate(selected.locked_through)}</p>
            )}
            <Field id="rc-date" label="Statement date" required>
              <Input type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field id="rc-balance" label="Closing balance on the statement (₹)" required hint="For cash, the amount counted.">
              <Input inputMode="decimal" value={statement} onChange={(e) => setStatement(e.target.value)} />
            </Field>
            <Field id="rc-notes" label="Notes" optionalLabel>
              <Textarea rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <div><Button type="submit" loading={busy} disabled={!accountId || !statement}>Reconcile</Button></div>
          </form>
          {result && (
            <div className="mt-6 rounded-md bg-ivory-50 p-4" role="status">
              {Number(result.difference) === 0 ? (
                <p className="flex items-center gap-2 font-semibold text-success-700"><CheckCircle2 aria-hidden="true" className="size-5" /> Balanced</p>
              ) : (
                <p className="font-semibold text-danger-700">Difference of {formatINR(result.difference)}</p>
              )}
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-ink-600">Ledger (verified)</dt><dd className="font-medium">{formatINR(result.computed_balance)}</dd></div>
                <div><dt className="text-ink-600">Statement</dt><dd className="font-medium">{formatINR(result.statement_balance)}</dd></div>
              </dl>
              {result.pending_entries_count > 0 && (
                <p className="mt-3 text-sm text-warning-700">{result.pending_entries_count} pending entr{result.pending_entries_count === 1 ? 'y is' : 'ies are'} dated on or before this date and not counted. Verify or reject them.</p>
              )}
            </div>
          )}
        </Card>
        <Card title="History">
          <QueryState query={history} isEmpty={(r) => r.length === 0} empty={<EmptyState title="No reconciliations yet" />}>
            {(rows) => (
              <ul className="flex flex-col divide-y divide-ink-100">
                {rows.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <div>
                      <p className="font-medium">{r.account?.name} · {formatDate(r.statement_date)}</p>
                      <p className="text-xs text-ink-600">{r.performer?.full_name || 'Team member'} · {formatDateTime(r.created_at)}{r.notes ? ` · ${r.notes}` : ''}</p>
                    </div>
                    <div className="text-right">
                      {Number(r.difference) === 0 ? <Badge tone="success">Balanced</Badge> : <Badge tone="danger">Diff {formatINR(r.difference)}</Badge>}
                      <p className="mt-1 text-xs text-ink-600 tabular-nums">{formatINR(r.statement_balance)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </Card>
      </div>
    </>
  );
}
