import type { ReactNode } from 'react';
import { PencilLine } from 'lucide-react';
import { cn } from '@/lib/cn';

type PlaceholderProps = {
  /** What PRAYASH needs to provide, e.g. "Official phone number". */
  label: ReactNode;
  hint?: ReactNode;
  className?: string;
  tone?: 'light' | 'dark';
  compact?: boolean;
};

/**
 * Clearly labelled placeholder for information PRAYASH has not yet provided.
 * Never replaced with invented content; edit it in the admin portal.
 */
export function Placeholder({ label, hint, className, tone = 'light', compact = false }: PlaceholderProps) {
  return (
    <div
      role="note"
      className={cn(
        'placeholder-stripes flex items-start gap-3 rounded-md border border-dashed',
        tone === 'light' ? 'border-gold-600/50 bg-ivory-50/80 text-ink-800' : 'border-gold-400/50 bg-white/5 text-ivory-100',
        compact ? 'px-3 py-2 text-sm' : 'px-4 py-3.5',
        className,
      )}
    >
      <PencilLine aria-hidden="true" className={cn('mt-0.5 shrink-0', compact ? 'size-4' : 'size-5', tone === 'light' ? 'text-gold-700' : 'text-gold-300')} />
      <div className="flex flex-col gap-0.5">
        <span className={cn('text-[0.6875rem] font-semibold tracking-[0.14em] uppercase', tone === 'light' ? 'text-gold-700' : 'text-gold-300')}>
          To be provided by PRAYASH
        </span>
        <span className="font-medium">{label}</span>
        {hint && <span className={cn('text-sm', tone === 'light' ? 'text-ink-600' : 'text-ivory-100/80')}>{hint}</span>}
      </div>
    </div>
  );
}
