import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

type PaginationProps = {
  page: number; // 1-based
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
  label?: string;
};

export function Pagination({ page, pageSize, total, onPageChange, className, label = 'Pagination' }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) {
    return total > 0 ? (
      <p className={cn('text-sm text-ink-600', className)}>
        Showing {total} {total === 1 ? 'item' : 'items'}
      </p>
    ) : null;
  }
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const btn =
    'inline-flex h-9 items-center gap-1 rounded-full px-3.5 text-sm font-medium text-ink-800 ' +
    'shadow-[inset_0_0_0_1px_var(--color-ink-200)] hover:bg-white disabled:cursor-not-allowed disabled:opacity-45';

  return (
    <nav aria-label={label} className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <p className="text-sm text-ink-600" aria-live="polite">
        Showing <span className="font-medium text-ink-900">{from}</span>–
        <span className="font-medium text-ink-900">{to}</span> of{' '}
        <span className="font-medium text-ink-900">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          <ChevronLeft aria-hidden="true" className="size-4" />
          Previous
        </button>
        <span className="text-sm text-ink-700">
          Page {page} of {pageCount}
        </span>
        <button type="button" className={btn} onClick={() => onPageChange(page + 1)} disabled={page >= pageCount}>
          Next
          <ChevronRight aria-hidden="true" className="size-4" />
        </button>
      </div>
    </nav>
  );
}
