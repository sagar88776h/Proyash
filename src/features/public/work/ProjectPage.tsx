import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, CheckCircle2, MapPin } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Container, Section } from '@/components/layout/Container';
import { Markdown } from '@/components/Markdown';
import { Photo } from '@/components/media/Photo';
import { Reveal } from '@/components/motion/Reveal';
import { ButtonLink } from '@/components/ui/Button';
import { Badge, EmptyState, ErrorState } from '@/components/ui/Feedback';
import { LoadingBlock } from '@/components/ui/Spinner';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { fetchProjectBySlug } from '@/lib/api/public';
import { isBackendConfigured } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatINR, formatNumber } from '@/lib/format';
import { ACTIVITY_CATEGORY_LABELS, PROJECT_STATUS_LABELS } from '@/lib/labels';
import { NotFoundPage } from '../NotFoundPage';

export function ProjectPage() {
  const { slug = '' } = useParams();
  const query = useQuery({ queryKey: ['project', slug], queryFn: () => fetchProjectBySlug(slug), enabled: isBackendConfigured });
  useDocumentTitle(query.data?.project.title ?? 'Project');

  if (!isBackendConfigured) return <NotFoundPage />;
  if (query.isLoading) return <div className="pt-40"><LoadingBlock label="Loading project" /></div>;
  if (query.isError) {
    return (
      <Container className="pt-40 pb-24">
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      </Container>
    );
  }
  if (!query.data) return <NotFoundPage />;
  const { project, outcomes, media, finance } = query.data;
  const place = project.village?.name ?? project.locality;
  const spentShare = finance && finance.approved_budget > 0 ? Math.min(100, (finance.verified_expenditure / finance.approved_budget) * 100) : 0;

  return (
    <>
      <section className="on-dark grain relative overflow-hidden bg-forest-800 text-ivory-50">
        <Container className="relative grid gap-10 pt-36 pb-16 lg:grid-cols-[1.2fr_1fr] lg:items-end lg:pt-40 lg:pb-20">
          <div className="flex flex-col gap-5">
            <Link to="/our-work" className="inline-flex items-center gap-2 self-start text-sm text-ivory-100/80 hover:text-gold-300">
              <ArrowLeft aria-hidden="true" className="size-4" /> All projects
            </Link>
            <div className="flex flex-wrap gap-2">
              <Badge tone="gold">{ACTIVITY_CATEGORY_LABELS[project.category]}</Badge>
              <Badge tone="neutral">{PROJECT_STATUS_LABELS[project.status]}</Badge>
            </div>
            <h1 className="text-display-xl font-semibold">{project.title}</h1>
            <p className="text-lead text-ivory-100/85">{project.summary}</p>
            <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm text-ivory-100/80">
              {place && (
                <div className="flex items-center gap-2">
                  <dt className="sr-only">Place</dt>
                  <MapPin aria-hidden="true" className="size-4 text-gold-300" />
                  <dd>{project.village ? <Link to={`/villages/${project.village.slug}`} className="hover:text-gold-300 hover:underline">{place}</Link> : place}</dd>
                </div>
              )}
              {(project.start_date || project.end_date) && (
                <div className="flex items-center gap-2">
                  <dt className="sr-only">Dates</dt>
                  <CalendarDays aria-hidden="true" className="size-4 text-gold-300" />
                  <dd>
                    {project.start_date ? formatDate(project.start_date) : 'Start date to be confirmed'}
                    {project.end_date ? ` – ${formatDate(project.end_date)}` : ''}
                  </dd>
                </div>
              )}
            </dl>
          </div>
          <Photo media={project.cover} priority className="aspect-[4/3] rounded-panel shadow-lift" tone="dark" placeholderLabel="Project photograph to be added" sizes="(min-width: 1024px) 40vw, 100vw" />
        </Container>
      </section>

      <Section tone="ivory">
        <Container>
          <div className="grid gap-14 lg:grid-cols-[1.6fr_1fr] lg:gap-16">
            <div className="flex flex-col gap-12">
              {project.description ? <Markdown>{project.description}</Markdown> : <p className="text-lead text-ink-700">{project.summary}</p>}
              {media.length > 0 && (
                <section aria-labelledby="gallery-heading" className="flex flex-col gap-5">
                  <h2 id="gallery-heading" className="font-display text-2xl font-semibold">Photographs</h2>
                  <ul className="grid gap-4 sm:grid-cols-2">
                    {media.map((m) => (
                      <li key={m.id}>
                        <figure className="flex flex-col gap-2">
                          <Photo media={m} className="aspect-[4/3] rounded-card" sizes="(min-width: 1024px) 30vw, 50vw" />
                          {(m.caption || m.credit) && (
                            <figcaption className="text-sm text-ink-600">
                              {m.caption}
                              {m.credit && <span className="block text-xs">Photo: {m.credit}</span>}
                            </figcaption>
                          )}
                        </figure>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
            <aside className="flex flex-col gap-6 lg:sticky lg:top-28 lg:self-start">
              <Reveal className="rounded-card bg-ivory-50 p-7 shadow-soft">
                <h2 className="mb-4 font-display text-xl font-semibold">Verified outcomes</h2>
                {outcomes.length ? (
                  <ul className="flex flex-col gap-4">
                    {outcomes.map((o) => (
                      <li key={o.id} className="flex gap-3">
                        <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success-700" />
                        <div>
                          <p className="font-medium">
                            {o.quantity !== null && <span className="font-display text-lg font-semibold text-forest-700 tabular-nums">{formatNumber(Number(o.quantity))} {o.unit} </span>}
                            {o.label}
                          </p>
                          {o.description && <p className="text-sm text-ink-600">{o.description}</p>}
                          {o.outcome_date && <p className="text-xs text-ink-600">{formatDate(o.outcome_date)}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState className="py-8" title="No verified outcomes yet" description="Outcomes are shown once a publisher has verified them." />
                )}
              </Reveal>
              {finance && (
                <Reveal className="rounded-card bg-forest-50 p-7">
                  <h2 className="mb-4 font-display text-xl font-semibold">Budget and spending</h2>
                  <dl className="grid grid-cols-2 gap-4">
                    <div>
                      <dt className="text-sm text-ink-600">Approved budget</dt>
                      <dd className="font-display text-xl font-semibold tabular-nums">{formatINR(finance.approved_budget, { whole: true })}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-ink-600">Verified spending</dt>
                      <dd className="font-display text-xl font-semibold tabular-nums">{formatINR(finance.verified_expenditure, { whole: true })}</dd>
                    </div>
                  </dl>
                  <div className="mt-5 h-2 overflow-hidden rounded-full bg-forest-100" role="img" aria-label={`${Math.round(spentShare)}% of the approved budget spent`}>
                    <div className="h-full rounded-full bg-forest-700" style={{ width: `${spentShare}%` }} />
                  </div>
                  <p className="mt-3 text-xs text-ink-600">From verified ledger entries, as of {formatDate(finance.as_of)}.</p>
                </Reveal>
              )}
              <div className="flex flex-wrap gap-3">
                <ButtonLink to="/support-us" variant="gold">Support this work</ButtonLink>
                <ButtonLink to="/volunteer" variant="secondary">Volunteer</ButtonLink>
              </div>
            </aside>
          </div>
        </Container>
      </Section>
    </>
  );
}
