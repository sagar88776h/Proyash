import { QueryClient } from '@tanstack/react-query';
import { toAppError } from './errors';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        const kind = toAppError(error).kind;
        if (kind === 'forbidden' || kind === 'not_found' || kind === 'not_configured' || kind === 'validation') return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});
