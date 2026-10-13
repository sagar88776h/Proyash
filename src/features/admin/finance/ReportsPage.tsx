import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FilePlus2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { QueryState } from '@/components/QueryState';
import { Button } from '@/components/ui/Button';
import { Alert, EmptyState } from '@/components/ui/Feedback';
import { Field, Input, Select } from '@/components/ui/Field';
import { errorMessage } from '@/lib/errors';
import { financialYearLabel, financialYearRange, formatDate, formatMonth, monthRange, todayISO } from '@/lib/format';
import { REPORT_PERIOD_LABELS } from '@/lib/labels';
import type { Enums } from '@/types/database';
import { createReport, listReports, periodSummary, type Report } from '../api/finance';
import { DataTable, type Column } from '../components/DataTable';
import { Card, PageHeader } from '../components/PageHeader';
import { ReportStatusBadge } from '../components/StatusBadges';
import { useToast } from '../components/useToast';
import { SummaryView } from './SummaryView';

type Mode = 'month' | 'year' | 'custom';

function currentFyStart(): number {
  const now = new Date();
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}

export function ReportsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const now = new Date();
  const [mode, setMode] = useState<Mode>('month');
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [fy, setFy] = useState(currentFyStart());
  const [custom, setCustom] = useState({ start: `${now.getFullYear()}-01-01`, end: todayISO() });
  const [creating, setCreating] = useState(false);

  const period = useMemo(() => {
    if (mode === 'month') {
      const [y, m] = month.split('-').map(Number);
      const r = monthRange(y!, m! - 1);
      return { ...r, type: 'monthly' as Enums<'report_period'>, title: `Monthly report — ${formatMonth(r.start)}` };
    }
    if (mode === 'year') {
      const r = financialYearRange(fy);
      return { ...r, type: 'annual' as Enums<'report_period'>, title: `Annual report — financial year ${financialYearLabel(new Date(fy, 3, 1))}` };
    }
    return { ...custom, type: 'custom' as Enums<'report_period'>, title: `Report — ${formatDate(custom.start)} to ${formatDate(custom.end)}` };
  }, [mode, month, fy, custom]);

  const summary = useQuery({ queryKey: ['admin', 'finance', 'summary', period.start, period.end], queryFn: () => periodSummary(period.start, period.end) });
  const reports = useQuery({ queryKey: ['admin', 'finance', 'reports'], queryFn: listReports });
  const periodEnded = period.end < todayISO();

  const columns: Column<Report>[] = [
    { key: 'title', header: 'Report', cell: (r) => r.title },
    { key: 'period', header: 'Period', cell: (r) => `${formatDate(r.period_start)} – ${formatDate(r.period_end)}` },
    { key: 'type', header: 'Type', cell: (r) => REPORT_PERIOD_LABELS[r.period_type], hideOnMobile: true },
    { key: 'status', header: 'Status', cell: (r) => <ReportStatusBadge status={r.status} /> },
    { key: 'by', header: 'Prepared / approved', cell: (r) => `${r.preparer?.full_name ?? '—'} / ${r.approver?.full_name ?? '—'}`, hideOnMobile: true },
  ];

  const fyOptions = Array.from({ length: 6 }, (_, i) => currentFyStart() - i);

  return (
    <>
      <PageHeader title="Financial reports" description="Live summaries for any period, and the reports published on the Transparency page." />
      <Card title="Period summary" className="mb-6">
        <div className="mb-6 flex flex-wrap items-end gap-4">
          <Field id="rp-mode" label="Period">
            <Select value={mode} onChange={(e) => setMode(e.target.value as Mode)} className="w-44">
              <option value="month">Month</option>
              <option value="year">Financial year</option>
              <option value="custom">Custom range</option>
            </Select>
          </Field>
          {mode === 'month' && (
            <Field id="rp-month" label="Month"><Input type="month" value={month} max={todayISO().slice(0, 7)} onChange={(e) => setMonth(e.target.value)} /></Field>
          )}
          {mode === 'year' && (
            <Field id="rp-fy" label="Financial year (April–March)">
              <Select value={String(fy)} onChange={(e) => setFy(Number(e.target.value))}>
                {fyOptions.map((y) => <option key={y} value={y}>{financialYearLabel(new Date(y, 3, 1))}</option>)}
              </Select>
            </Field>
          )}
          {mode === 'custom' && (
            <>
              <Field id="rp-start" label="From"><Input type="date" value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} /></Field>
              <Field id="rp-end" label="To"><Input type="date" value={custom.end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} /></Field>
            </>
          )}
          <Button
            variant="secondary"
            iconLeft={<FilePlus2 aria-hidden="true" className="size-4" />}
            loading={creating}
            disabled={!periodEnded}
            onClick={async () => {
              setCreating(true);
              try {
                const id = await createReport(period.title, period.type, period.start, period.end);
                void queryClient.invalidateQueries({ queryKey: ['admin', 'finance', 'reports'] });
                toast.success('Draft report created.');
                navigate(`/admin/finance/reports/${id}`);
              } catch (err) {
                toast.error(errorMessage(err));
              } finally {
                setCreating(false);
              }
            }}
          >
            Create public report draft
          </Button>
        </div>
        {!periodEnded && <Alert tone="info" className="mb-4">Public reports can only be created for periods that have ended.</Alert>}
        <QueryState query={summary}>{(s) => <SummaryView s={s} />}</QueryState>
      </Card>
      <Card title="Public reports">
        <QueryState query={reports} isEmpty={(r) => r.length === 0} empty={<EmptyState title="No reports yet" description="Create a draft from a completed period above." />}>
          {(rows) => <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} rowHref={(r) => `/admin/finance/reports/${r.id}`} caption="Financial reports" />}
        </QueryState>
      </Card>
    </>
  );
}
