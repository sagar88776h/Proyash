import { useQuery } from '@tanstack/react-query';
import { fetchPageContent } from '@/lib/api/public';
import { isBackendConfigured } from '@/lib/env';
import { mergeContent, PAGE_DEFINITIONS, type ContentKey, type PageContent } from './registry';

export type ContentState = {
  content: PageContent;
  /** True when no reviewed version has been published from the admin portal. */
  isDefault: boolean;
  publishedAt: string | null;
  isLoading: boolean;
};

/** Page content: published version from the admin portal, falling back to documented defaults. */
export function useContent(key: ContentKey): ContentState {
  const query = useQuery({
    queryKey: ['content', key],
    queryFn: () => fetchPageContent(key),
    enabled: isBackendConfigured,
    staleTime: 5 * 60_000,
  });
  const published = query.data?.published ?? null;
  return {
    content: published ? mergeContent(key, published) : PAGE_DEFINITIONS[key].defaults,
    isDefault: !published,
    publishedAt: query.data?.published_at ?? null,
    isLoading: query.isLoading && isBackendConfigured,
  };
}
