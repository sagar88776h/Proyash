import { useQuery } from '@tanstack/react-query';
import { ArrowRight, FileText } from 'lucide-react';
import { Link } from 'react-router';
import { ReportSummary } from '@/components/cards/ReportSummary';
import { Container, Section, SectionHeading } from '@/components/layout/Container';
import { PageHero } from '@/components/layout/PageHero';
import { Markdown } from '@/components/Markdown';
import { Reveal } from '@/components/motion/Reveal';
import { QueryState } from '@/components/QueryState';
import { EmptyState, Skeleton } from '@/components/ui/Feedback';
import { textOf } from '@/content/registry';
import { useContent } from '@/content/useContent';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { fetchPublishedReports } from '@/lib/api/public';
import { isBackendConfigured } from '@/lib/env';
import { formatDate, formatINR } from '@/lib/format';
import { REPORT_PERIOD_LABELS } from '@/lib/labels';
import { reportIncome, reportSpending } from '@/lib/reports';

export function TransparencyPage() {
  useDocumentTitle('Transparency & Financial Reports');
  const { content } = useContent('transparency');
  const reports = useQuery({ queryKey: ['reports', 'public'], queryFn: fetchPublishedReports, enabled: isBackendConfigured });
  return (
    <>
      <PageHero eyebrow="Accountability" title={textOf(content, 'heading')} intro={textOf(content, 'intro')} />
      <Section tone="white">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[1fr_1.5fr] lg:gap-20">
            <SectionHeading eyebrow="Our approach" title="How we keep accounts" />
            <Reveal>
              <Markdown>{textOf(content, 'approach')}</Markdown>
            </Reveal>
          </div>
        </Container>
      </Section>
      <Section tone="ivory" labelledBy="reports-heading">
        <Container className="flex flex-col gap-10">
          <SectionHeading eyebrow="Published reports" title="Financial reports" id="reports-heading">
            Each report shows totals calculated from verified transactions and approved by a second person.
          </SectionHeading>
          <QueryState
            query={reports}
            enabled={isBackendConfigured}
            isEmpty={(rows) => rows.length === 0}
            loading={<Skeleton className="h-64 rounded-panel" />}
            empty={
              <EmptyState
                icon={<FileText aria-hidden="true" className="size-8" />}
                title="No financial reports published yet"
                description="Reports are published here after the treasurer prepares them and another treasurer or administrator approves them."
              />
            }
          >
            {(rows) => (
              <div className="flex flex-col gap-8">
                <div className="on-dark grain rounded-panel bg-forest-800 p-7 text-ivory-50 sm:p-10">
                  <p className="mb-4 text-sm font-medium tracking-wide text-gold-300 uppercase">Latest report</p>
                  <ReportSummary report={rows[0]!} />
                </div>
                {rows.length > 1 && (
                  <div className="overflow-x-auto rounded-card bg-ivory-50 shadow-soft">
                    <table className="w-full min-w-[40rem] text-left text-[0.9375rem]">
                      <caption className="sr-only">Earlier financial reports</caption>
                      <thead className="border-b border-ink-100 text-sm text-ink-600">
                        <tr>
                          <th scope="col" className="px-5 py-3 font-medium">Report</th>
                          <th scope="col" className="px-5 py-3 font-medium">Period</th>
                          <th scope="col" className="px-5 py-3 text-right font-medium">Received</th>
                          <th scope="col" className="px-5 py-3 text-right font-medium">Spent</th>
                          <th scope="col" className="px-5 py-3"><span className="sr-only">Open</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(1).map((r) => (
                          <tr key={r.id} className="border-b border-ink-100 last:border-0">
                            <th scope="row" className="px-5 py-4 font-medium">
                              {r.title}
                              <span className="block text-xs font-normal text-ink-600">{REPORT_PERIOD_LABELS[r.period_type]}</span>
                            </th>
                            <td className="px-5 py-4 text-ink-700">{formatDate(r.period_start)} – {formatDate(r.period_end)}</td>
                            <td className="px-5 py-4 text-right tabular-nums">{formatINR(reportIncome(r), { whole: true })}</td>
                            <td className="px-5 py-4 text-right tabular-nums">{formatINR(reportSpending(r), { whole: true })}</td>
                            <td className="px-5 py-4 text-right">
                              <Link to={`/transparency/${r.id}`} className="inline-flex items-center gap-1 font-medium text-forest-700 hover:underline">
                                View <ArrowRight aria-hidden="true" className="size-4" />
                                <span className="sr-only"> {r.title}</span>
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </QueryState>
        </Container>
      </Section>
    </>
  );
}
