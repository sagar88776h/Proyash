import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ProjectCard } from '@/components/cards/ProjectCard';
import { Container, Section } from '@/components/layout/Container';
import { PageHero } from '@/components/layout/PageHero';
import { QueryState } from '@/components/QueryState';
import { EmptyState, Skeleton } from '@/components/ui/Feedback';
import { Field, Input, Select } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { textOf } from '@/content/registry';
import { useContent } from '@/content/useContent';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { fetchPublishedProjects, fetchPublishedVillages } from '@/lib/api/public';
import { isBackendConfigured } from '@/lib/env';
import { ACTIVITY_CATEGORY_LABELS, PROJECT_STATUS_LABELS } from '@/lib/labels';
import type { Enums } from '@/types/database';

const PAGE_SIZE = 9;

export function OurWorkPage() {
  useDocumentTitle('Our Work');
  const { content } = useContent('our_work');
  const [params, setParams] = useSearchParams();
  const category = (params.get('category') ?? '') as Enums<'activity_category'> | '';
  const status = (params.get('status') ?? '') as Enums<'project_status'> | '';
  const villageId = params.get('village') ?? '';
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const debouncedSearch = useDebouncedValue(search);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if ((params.get('q') ?? '') !== debouncedSearch) update('q', debouncedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync debounced search into the URL only
  }, [debouncedSearch]);

  const villages = useQuery({ queryKey: ['villages', 'public'], queryFn: fetchPublishedVillages, enabled: isBackendConfigured });
  const projects = useQuery({
    queryKey: ['projects', 'public', { category, status, villageId, q: debouncedSearch, page }],
    queryFn: () => fetchPublishedProjects({ category, status, villageId, search: debouncedSearch, page, pageSize: PAGE_SIZE }),
    enabled: isBackendConfigured,
    placeholderData: keepPreviousData,
  });
  const filtered = Boolean(category || status || villageId || debouncedSearch);

  return (
    <>
      <PageHero eyebrow="Projects" title={textOf(content, 'heading')} intro={textOf(content, 'intro')} />
      <Section tone="ivory">
        <Container>
          <form role="search" aria-label="Filter projects" onSubmit={(e) => e.preventDefault()} className="mb-10 grid gap-4 rounded-3xl bg-mint-50 p-5 shadow-soft sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Search" id="project-search">
              <div className="relative">
                <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-500" />
                <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search projects" className="pl-10" />
              </div>
            </Field>
            <Field label="Activity" id="project-category">
              <Select value={category} onChange={(e) => update('category', e.target.value)}>
                <option value="">All activities</option>
                {Object.entries(ACTIVITY_CATEGORY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </Field>
            <Field label="Status" id="project-status">
              <Select value={status} onChange={(e) => update('status', e.target.value)}>
                <option value="">Any status</option>
                {Object.entries(PROJECT_STATUS_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </Field>
            <Field label="Village" id="project-village">
              <Select value={villageId} onChange={(e) => update('village', e.target.value)}>
                <option value="">All villages</option>
                {(villages.data ?? []).map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </Select>
            </Field>
          </form>

          <QueryState
            query={projects}
            enabled={isBackendConfigured}
            isEmpty={(d) => d.rows.length === 0}
            loading={
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-96 rounded-3xl" />
                ))}
              </div>
            }
            empty={
              <EmptyState
                title={filtered ? 'No projects match these filters' : 'No projects published yet'}
                description={filtered ? 'Try removing a filter or searching for something else.' : 'Projects appear here after they have been reviewed and published by our team.'}
              />
            }
          >
            {(d) => (
              <div className="flex flex-col gap-10">
                <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-busy={projects.isFetching}>
                  {d.rows.map((p) => (
                    <li key={p.id}>
                      <ProjectCard project={p} className="h-full" headingLevel="h2" />
                    </li>
                  ))}
                </ul>
                <Pagination page={page} pageSize={PAGE_SIZE} total={d.count} onPageChange={(p) => update('page', String(p))} label="Projects pages" />
              </div>
            )}
          </QueryState>
        </Container>
      </Section>
    </>
  );
}
