import { ImageIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

type PhotoPlaceholderProps = {
  className?: string;
  label?: string;
  tone?: 'light' | 'dark';
};

/** Labelled frame shown wherever an approved PRAYASH photograph is still missing. */
export function PhotoPlaceholder({ className, label = 'Photograph to be added', tone = 'light' }: PhotoPlaceholderProps) {
  return (
    <div
      role="img"
      aria-label={`${label} (placeholder)`}
      className={cn(
        'relative flex h-full w-full items-center justify-center overflow-hidden',
        tone === 'light'
          ? 'bg-[radial-gradient(120%_90%_at_20%_10%,var(--color-forest-100),var(--color-ivory-200)_60%)] text-forest-700'
          : 'bg-[radial-gradient(120%_90%_at_20%_10%,rgb(213_174_105/0.18),transparent_60%)] text-gold-300',
        className,
      )}
    >
      <svg aria-hidden="true" className="absolute inset-0 h-full w-full opacity-[0.18]" preserveAspectRatio="none">
        <defs>
          <pattern id="ph-grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M28 0H0V28" fill="none" stroke="currentColor" strokeWidth="0.6" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ph-grid)" />
      </svg>
      <div className="relative flex flex-col items-center gap-2 px-4 text-center">
        <ImageIcon aria-hidden="true" className="size-7" strokeWidth={1.4} />
        <span className="text-xs font-semibold tracking-[0.14em] uppercase">Placeholder</span>
        <span className={cn('max-w-[16rem] text-sm', tone === 'light' ? 'text-ink-700' : 'text-ivory-100/85')}>{label}</span>
      </div>
    </div>
  );
}
