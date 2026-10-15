import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { ProjectCard } from '@/components/cards/ProjectCard';
import { Container, Section } from '@/components/layout/Container';
import { Markdown } from '@/components/Markdown';
import { Photo } from '@/components/media/Photo';
import { QueryState } from '@/components/QueryState';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { LoadingBlock } from '@/components/ui/Spinner';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { fetchPublishedProjects, fetchVillageBySlug, fetchVillageMedia } from '@/lib/api/public';
import { isBackendConfigured } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { villageLocation } from '@/lib/places';
import { NotFoundPage } from '../NotFoundPage';

export function VillagePage() {
  const { slug = '' } = useParams();
  const village = useQuery({
    queryKey: ['village', slug],
    queryFn: () => fetchVillageBySlug(slug),
    enabled: isBackendConfigured,
  });
  const id = village.data?.id;
  const projects = useQuery({
    queryKey: ['projects', 'public', { villageId: id }],
    queryFn: () => fetchPublishedProjects({ villageId: id, pageSize: 24 }),
    enabled: Boolean(id),
  });
  const media = useQuery({
    queryKey: ['village-media', id],
    queryFn: () => fetchVillageMedia(id!),
    enabled: Boolean(id),
  });
  useDocumentTitle(village.data?.name ?? 'Village');

  if (!isBackendConfigured) return <NotFoundPage />;
  if (village.isLoading)
    return (
      <div className="pt-40">
        <LoadingBlock label="Loading village" />
      </div>
    );
  if (village.isError) {
    return (
      <Container className="pt-40 pb-24">
        <ErrorState message={errorMessage(village.error)} onRetry={() => void village.refetch()} />
      </Container>
    );
  }
  if (!village.data) return <NotFoundPage />;
  const v = village.data;

  return (
    <>
      <section className="px-2 pt-24 sm:px-4 sm:pt-28">
        <div className="bg-mesh relative overflow-hidden rounded-bento">
          <Container className="grid gap-10 py-12 sm:py-16 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <div className="flex flex-col gap-5">
              <Link
                to="/villages"
                className="inline-flex items-center gap-2 self-start text-sm text-ink-600 hover:text-forest-700"
              >
                <ArrowLeft aria-hidden="true" className="size-4" /> All villages
              </Link>
              <p className="eyebrow">{villageLocation(v) || 'Village'}</p>
              <h1 className="text-display-xl font-semibold text-ink-900">
                {v.name}
                {v.local_name && (
                  <span className="mt-2 block text-display-md font-normal text-ink-600">
                    {v.local_name}
                  </span>
                )}
              </h1>
              {v.summary && <p className="text-lead text-ink-700">{v.summary}</p>}
            </div>
            <Photo
              media={v.cover}
              priority
              className="aspect-[16/11] rounded-bento shadow-float"
              tone="light"
              placeholderLabel="Village photograph to be added"
            />
          </Container>
        </div>
      </section>
      <Section tone="ivory">
        <Container className="flex flex-col gap-16">
          {v.description && <Markdown>{v.description}</Markdown>}
          <section aria-labelledby="village-projects" className="flex flex-col gap-6">
            <h2 id="village-projects" className="text-display-md font-semibold">
              Projects in {v.name}
            </h2>
            <QueryState
              query={projects}
              isEmpty={(d) => d.rows.length === 0}
              empty={<EmptyState title="No published projects here yet" />}
            >
              {(d) => (
                <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {d.rows.map((p) => (
                    <li key={p.id}>
                      <ProjectCard project={p} className="h-full" />
                    </li>
                  ))}
                </ul>
              )}
            </QueryState>
          </section>
          {(media.data?.length ?? 0) > 0 && (
            <section aria-labelledby="village-photos" className="flex flex-col gap-6">
              <h2 id="village-photos" className="text-display-md font-semibold">
                Photographs
              </h2>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {media.data!.map((m) => (
                  <li key={m.id}>
                    <figure className="flex flex-col gap-2">
                      <Photo media={m} className="aspect-[4/3] rounded-3xl" />
                      {m.caption && (
                        <figcaption className="text-sm text-ink-600">{m.caption}</figcaption>
                      )}
                    </figure>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </Container>
      </Section>
    </>
  );
}
