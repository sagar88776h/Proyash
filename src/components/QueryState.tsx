import type { ReactNode } from 'react';
import { DatabaseZap } from 'lucide-react';
import { toAppError } from '@/lib/errors';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { LoadingBlock } from '@/components/ui/Spinner';

type QueryLike<T> = {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
  fetchStatus?: string;
};

type QueryStateProps<T> = {
  query: QueryLike<T>;
  enabled?: boolean;
  isEmpty?: (data: T) => boolean;
  loading?: ReactNode;
  empty?: ReactNode;
  errorTitle?: ReactNode;
  children: (data: T) => ReactNode;
};

/** Consistent loading / error / empty / not-connected handling for data sections. */
export function QueryState<T>({ query, enabled = true, isEmpty, loading, empty, errorTitle, children }: QueryStateProps<T>) {
  if (!enabled) {
    return (
      <EmptyState
        icon={<DatabaseZap aria-hidden="true" className="size-8" />}
        title="Not connected yet"
        description="This section shows live records once the website is connected to its database."
      />
    );
  }
  if (query.isLoading) return <>{loading ?? <LoadingBlock />}</>;
  if (query.isError) {
    const err = toAppError(query.error);
    return <ErrorState title={errorTitle} message={err.message} onRetry={() => void query.refetch()} />;
  }
  if (query.data === undefined) return <>{loading ?? <LoadingBlock />}</>;
  if (isEmpty?.(query.data)) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;
  return <>{children(query.data)}</>;
}
