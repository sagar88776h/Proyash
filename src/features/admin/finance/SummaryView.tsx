import type { ReactNode } from 'react';
import { formatINR } from '@/lib/format';
import { EXPENSE_CATEGORY_LABELS } from '@/lib/labels';
import type { Enums } from '@/types/database';
import type { PeriodSummary } from '../api/finance';

function Line({ label, value, strong, indent }: { label: ReactNode; value: number; strong?: boolean; indent?: boolean }) {
  return (
    <tr className="border-b border-ink-100 last:border-0">
      <th scope="row" className={`py-2 pr-4 text-left ${strong ? 'font-semibold' : 'font-normal text-ink-700'} ${indent ? 'pl-4' : ''}`}>{label}</th>
      <td className={`py-2 text-right tabular-nums ${strong ? 'font-semibold' : ''}`}>{formatINR(value)}</td>
    </tr>
  );
}

/** Staff view of a period: totals, accounts and projects (live from verified entries). */
export function SummaryView({ s }: { s: PeriodSummary }) {
  const income = Number(s.income.member_contributions) + Number(s.income.public_donations) + Number(s.income.other_income);
  const cats = Object.entries(s.expenditure_by_category ?? {}) as Array<[Enums<'expense_category'>, number]>;
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <table className="w-full text-sm">
        <caption className="mb-2 text-left font-display text-base font-semibold">Summary</caption>
        <tbody>
          <Line label="Opening balance" value={Number(s.opening_balance)} strong />
          {Number(s.opening_balances_recorded) !== 0 && <Line label="Opening balances recorded" value={Number(s.opening_balances_recorded)} indent />}
          <Line label="Member contributions" value={Number(s.income.member_contributions)} indent />
          <Line label="Public donations" value={Number(s.income.public_donations)} indent />
          <Line label="Other income" value={Number(s.income.other_income)} indent />
          <Line label="Total received" value={income} strong />
          {cats.map(([c, v]) => <Line key={c} label={EXPENSE_CATEGORY_LABELS[c]} value={Number(v)} indent />)}
          <Line label="Refunds" value={Number(s.refunds)} indent />
          <Line label="Total spent" value={Number(s.expenditure_total) + Number(s.refunds)} strong />
          <Line label="Closing balance" value={Number(s.closing_balance)} strong />
        </tbody>
      </table>
      <div className="flex flex-col gap-6">
        <table className="w-full text-sm">
          <caption className="mb-2 text-left font-display text-base font-semibold">By account</caption>
          <thead className="text-xs text-ink-600"><tr><th scope="col" className="py-1 text-left font-medium">Account</th><th scope="col" className="text-right font-medium">Opening</th><th scope="col" className="text-right font-medium">In</th><th scope="col" className="text-right font-medium">Out</th><th scope="col" className="text-right font-medium">Closing</th></tr></thead>
          <tbody>
            {s.accounts.map((a) => (
              <tr key={a.account_id} className="border-t border-ink-100">
                <th scope="row" className="py-2 text-left font-normal">{a.name}</th>
                <td className="text-right tabular-nums">{formatINR(a.opening)}</td>
                <td className="text-right tabular-nums">{formatINR(a.inflow)}</td>
                <td className="text-right tabular-nums">{formatINR(a.outflow)}</td>
                <td className="text-right font-medium tabular-nums">{formatINR(a.closing)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {s.projects.length > 0 && (
          <table className="w-full text-sm">
            <caption className="mb-2 text-left font-display text-base font-semibold">Projects</caption>
            <thead className="text-xs text-ink-600"><tr><th scope="col" className="py-1 text-left font-medium">Project</th><th scope="col" className="text-right font-medium">Allocated</th><th scope="col" className="text-right font-medium">Spent (period)</th><th scope="col" className="text-right font-medium">Spent (to date)</th></tr></thead>
            <tbody>
              {s.projects.map((p) => (
                <tr key={p.project_id} className="border-t border-ink-100">
                  <th scope="row" className="py-2 text-left font-normal">{p.title}{!p.is_published && <span className="text-xs text-ink-600"> (unpublished)</span>}</th>
                  <td className="text-right tabular-nums">{formatINR(p.allocated)}</td>
                  <td className="text-right tabular-nums">{formatINR(p.expenditure_in_period)}</td>
                  <td className="text-right tabular-nums">{formatINR(p.expenditure_to_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {s.pending.count > 0 && (
          <p className="rounded-md bg-warning-50 p-3 text-sm text-warning-700">
            {s.pending.count} pending entries (in {formatINR(s.pending.amount_in)}, out {formatINR(s.pending.amount_out)}) are not included until verified.
          </p>
        )}
      </div>
    </div>
  );
}
