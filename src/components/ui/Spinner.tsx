import { cn } from '@/lib/cn';

type SpinnerProps = {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
};

const sizes = { sm: 'size-4 border-2', md: 'size-6 border-2', lg: 'size-10 border-[3px]' };

/** Accessible loading indicator. The label is announced to screen readers. */
export function Spinner({ size = 'md', label = 'Loading', className }: SpinnerProps) {
  return (
    <span role="status" className={cn('inline-flex items-center', className)}>
      <span
        aria-hidden="true"
        className={cn(
          'inline-block animate-spin rounded-full border-current border-r-transparent motion-reduce:animate-[spin_2.5s_linear_infinite]',
          sizes[size],
        )}
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Centered loading block for page sections. */
export function LoadingBlock({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex min-h-40 items-center justify-center text-forest-700', className)}>
      <Spinner size="lg" label={label} />
    </div>
  );
}
