import { useQuery } from '@tanstack/react-query';
import { VillageCard } from '@/components/cards/VillageCard';
import { Container, Section } from '@/components/layout/Container';
import { PageHero } from '@/components/layout/PageHero';
import { Reveal } from '@/components/motion/Reveal';
import { QueryState } from '@/components/QueryState';
import { EmptyState, Skeleton } from '@/components/ui/Feedback';
import { textOf } from '@/content/registry';
import { useContent } from '@/content/useContent';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { fetchPublishedVillages } from '@/lib/api/public';
import { isBackendConfigured } from '@/lib/env';

export function VillagesPage() {
  useDocumentTitle('Villages We Serve');
  const { content } = useContent('villages');
  const query = useQuery({ queryKey: ['villages', 'public'], queryFn: fetchPublishedVillages, enabled: isBackendConfigured });
  return (
    <>
      <PageHero eyebrow="Where we work" title={textOf(content, 'heading')} intro={textOf(content, 'intro')} />
      <Section tone="ivory">
        <Container>
          <QueryState
            query={query}
            enabled={isBackendConfigured}
            isEmpty={(rows) => rows.length === 0}
            loading={
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-80 rounded-card" />
                ))}
              </div>
            }
            empty={<EmptyState title="No villages published yet" description="Village pages are added and published by the PRAYASH team." />}
          >
            {(rows) => (
              <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {rows.map((v, i) => (
                  <Reveal as="li" key={v.id} delay={(i % 3) * 0.06}>
                    <VillageCard village={v} className="h-full" />
                  </Reveal>
                ))}
              </ul>
            )}
          </QueryState>
        </Container>
      </Section>
    </>
  );
}
