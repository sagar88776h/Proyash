import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, FileText } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Container, Section } from '@/components/layout/Container';
import { Markdown } from '@/components/Markdown';
import { Button } from '@/components/ui/Button';
import { Alert, ErrorState } from '@/components/ui/Feedback';
import { LoadingBlock } from '@/components/ui/Spinner';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { fetchPublishedReport, reportDocumentUrl, type ReportDocument } from '@/lib/api/public';
import { isBackendConfigured } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatINR } from '@/lib/format';
import { EXPENSE_CATEGORY_LABELS, REPORT_PERIOD_LABELS } from '@/lib/labels';
import { reportIncome, reportSpending } from '@/lib/reports';
import type { Enums } from '@/types/database';
import { NotFoundPage } from '../NotFoundPage';

function Row({
  label,
  value,
  strong,
  indent,
}: {
  label: string;
  value: number;
  strong?: boolean;
  indent?: boolean;
}) {
  return (
    <tr className="border-b border-ink-100 last:border-0">
      <th
        scope="row"
        className={`py-3 pr-4 text-left ${strong ? 'font-semibold' : 'font-normal text-ink-700'} ${indent ? 'pl-5' : ''}`}
      >
        {label}
      </th>
      <td className={`py-3 text-right tabular-nums ${strong ? 'font-semibold' : ''}`}>
        {formatINR(value)}
      </td>
    </tr>
  );
}

function DocumentButton({ doc }: { doc: ReportDocument }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <li className="flex flex-col gap-1">
      <Button
        variant="secondary"
        size="sm"
        loading={busy}
        iconLeft={<Download aria-hidden="true" className="size-4" />}
        onClick={async () => {
          setBusy(true);
          setError(undefined);
          try {
            window.location.assign(await reportDocumentUrl(doc.storage_path));
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        {doc.title}{' '}
        <span className="text-xs opacity-75">
          (PDF, {Math.max(1, Math.round(doc.byte_size / 1024))} KB)
        </span>
      </Button>
      {error && <p className="text-sm text-danger-700">{error}</p>}
    </li>
  );
}

export function ReportPage() {
  const { id = '' } = useParams();
  const query = useQuery({
    queryKey: ['report', id],
    queryFn: () => fetchPublishedReport(id),
    enabled: isBackendConfigured && /^[0-9a-f-]{36}$/.test(id),
  });
  useDocumentTitle(query.data?.report.title ?? 'Financial report');
  if (!isBackendConfigured || !/^[0-9a-f-]{36}$/.test(id)) return <NotFoundPage />;
  if (query.isLoading)
    return (
      <div className="pt-40">
        <LoadingBlock label="Loading report" />
      </div>
    );
  if (query.isError) {
    return (
      <Container className="pt-40 pb-24">
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      </Container>
    );
  }
  if (!query.data) return <NotFoundPage />;
  const { report, documents } = query.data;
  const s = report.summary;
  const categories = Object.entries(s.expenditure_by_category ?? {}).filter(
    ([, v]) => Number(v) !== 0,
  ) as Array<[Enums<'expense_category'>, number]>;

  return (
    <>
      <section className="px-2 pt-24 sm:px-4 sm:pt-28">
        <div className="bg-mesh relative overflow-hidden rounded-bento">
          <Container className="flex flex-col gap-5 py-12 sm:py-16">
            <Link
              to="/transparency"
              className="inline-flex items-center gap-2 self-start text-sm text-ink-600 hover:text-forest-700"
            >
              <ArrowLeft aria-hidden="true" className="size-4" /> All reports
            </Link>
            <p className="eyebrow">{REPORT_PERIOD_LABELS[report.period_type]} report</p>
            <h1 className="text-display-lg font-semibold text-ink-900">{report.title}</h1>
            <p className="text-ink-700">
              {formatDate(report.period_start)} – {formatDate(report.period_end)} · Approved and
              published {formatDate(report.published_at)}
            </p>
          </Container>
        </div>
      </section>
      <Section tone="ivory">
        <Container className="grid gap-12 lg:grid-cols-[1.4fr_1fr]">
          <div className="flex flex-col gap-10">
            <div className="overflow-x-auto rounded-3xl bg-mint-50 p-6 shadow-soft sm:p-8">
              <table className="w-full min-w-[22rem] text-[0.9375rem]">
                <caption className="mb-4 text-left font-display text-xl font-semibold">
                  Summary of accounts
                </caption>
                <tbody>
                  <Row label="Opening balance" value={Number(s.opening_balance)} strong />
                  {Number(s.opening_balances_recorded) !== 0 && (
                    <Row
                      label="Balances brought into the ledger"
                      value={Number(s.opening_balances_recorded)}
                      indent
                    />
                  )}
                  <Row
                    label="Member contributions"
                    value={Number(s.income?.member_contributions ?? 0)}
                    indent
                  />
                  <Row
                    label="Public donations"
                    value={Number(s.income?.public_donations ?? 0)}
                    indent
                  />
                  <Row label="Other income" value={Number(s.income?.other_income ?? 0)} indent />
                  <Row label="Total received" value={reportIncome(report)} strong />
                  {categories.map(([cat, value]) => (
                    <Row
                      key={cat}
                      label={EXPENSE_CATEGORY_LABELS[cat] ?? cat}
                      value={Number(value)}
                      indent
                    />
                  ))}
                  {Number(s.refunds) !== 0 && (
                    <Row label="Refunds" value={Number(s.refunds)} indent />
                  )}
                  <Row label="Total spent" value={reportSpending(report)} strong />
                  <Row label="Closing balance" value={Number(s.closing_balance)} strong />
                </tbody>
              </table>
              <p className="mt-4 text-xs text-ink-600">
                {s.contribution_count} contributions and {s.expense_count} expenses were verified in
                this period. Figures were frozen when the report was approved.
              </p>
            </div>
            {(s.projects?.length ?? 0) > 0 && (
              <div className="overflow-x-auto rounded-3xl bg-mint-50 p-6 shadow-soft sm:p-8">
                <table className="w-full text-[0.9375rem]">
                  <caption className="mb-4 text-left font-display text-xl font-semibold">
                    Spending by project
                  </caption>
                  <tbody>
                    {s.projects.map((p) => (
                      <tr key={p.project_id} className="border-b border-ink-100 last:border-0">
                        <th scope="row" className="py-3 pr-4 text-left font-normal">
                          <Link
                            to={`/our-work/${p.slug}`}
                            className="text-forest-700 hover:underline"
                          >
                            {p.title}
                          </Link>
                        </th>
                        <td className="py-3 text-right tabular-nums">
                          {formatINR(Number(p.expenditure))}
                        </td>
                      </tr>
                    ))}
                    {Number(s.other_project_expenditure) !== 0 && (
                      <Row
                        label="Other (unpublished) projects"
                        value={Number(s.other_project_expenditure)}
                      />
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {report.narrative && <Markdown>{report.narrative}</Markdown>}
          </div>
          <aside className="flex flex-col gap-6">
            <div className="rounded-3xl bg-mint-50 p-6 shadow-soft">
              <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold">
                <FileText aria-hidden="true" className="size-5 text-forest-700" /> Supporting
                documents
              </h2>
              {documents.length ? (
                <ul className="flex flex-col gap-3">
                  {documents.map((d) => (
                    <DocumentButton key={d.id} doc={d} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-600">No documents were attached to this report.</p>
              )}
            </div>
            <Alert tone="info" title="About these figures">
              Totals come from transactions verified against bank statements, bills or receipts.
              Personal details of donors and of the people we help are never included.
            </Alert>
          </aside>
        </Container>
      </Section>
    </>
  );
}
