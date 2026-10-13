import { useQuery } from '@tanstack/react-query';
import { EMPTY_SETTINGS, fetchPublicSettings, type PublicSettings } from '@/lib/api/public';
import { isBackendConfigured } from '@/lib/env';

export function usePublicSettings(): { settings: PublicSettings; isLoading: boolean; isError: boolean } {
  const query = useQuery({
    queryKey: ['public-settings'],
    queryFn: fetchPublicSettings,
    enabled: isBackendConfigured,
    staleTime: 5 * 60_000,
  });
  return { settings: query.data ?? EMPTY_SETTINGS, isLoading: query.isLoading && isBackendConfigured, isError: query.isError };
}
