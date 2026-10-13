import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import type { PublicReport } from '@/lib/api/public';
import { cn } from '@/lib/cn';
import { formatDate, formatINR } from '@/lib/format';
import { reportIncome, reportSpending } from '@/lib/reports';

/** Compact figures from an approved, published report. */
export function ReportSummary({ report, className, tone = 'dark' }: { report: PublicReport; className?: string; tone?: 'dark' | 'light' }) {
  const figures = [
    { label: 'Opening balance', value: Number(report.summary.opening_balance ?? 0) },
    { label: 'Received', value: reportIncome(report) },
    { label: 'Spent', value: reportSpending(report) },
    { label: 'Closing balance', value: Number(report.summary.closing_balance ?? 0) },
  ];
  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-display text-xl font-semibold">{report.title}</p>
        <p className={cn('text-sm', tone === 'dark' ? 'text-ivory-100/75' : 'text-ink-600')}>
          {formatDate(report.period_start)} – {formatDate(report.period_end)}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4">
        {figures.map((f) => (
          <div key={f.label} className={cn('border-t pt-4', tone === 'dark' ? 'border-white/15' : 'border-ink-200')}>
            <dt className={cn('text-sm', tone === 'dark' ? 'text-ivory-100/75' : 'text-ink-600')}>{f.label}</dt>
            <dd className="mt-1 font-display text-2xl font-semibold tabular-nums">{formatINR(f.value, { whole: true })}</dd>
          </div>
        ))}
      </dl>
      <Link
        to={`/transparency/${report.id}`}
        className={cn('inline-flex items-center gap-2 self-start font-medium underline-offset-4 hover:underline', tone === 'dark' ? 'text-gold-300' : 'text-forest-700')}
      >
        Read the full report <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </div>
  );
}
