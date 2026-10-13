import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Container({ children, className, size = 'page' }: { children: ReactNode; className?: string; size?: 'page' | 'narrow' | 'wide' }) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-4 sm:px-6 lg:px-8',
        size === 'page' && 'max-w-page',
        size === 'narrow' && 'max-w-3xl',
        size === 'wide' && 'max-w-[88rem]',
        className,
      )}
    >
      {children}
    </div>
  );
}

type SectionProps = {
  children: ReactNode;
  className?: string;
  id?: string;
  tone?: 'ivory' | 'white' | 'forest' | 'charcoal' | 'sand';
  labelledBy?: string;
  padding?: 'normal' | 'tight' | 'loose';
};

export function Section({ children, className, id, tone = 'ivory', labelledBy, padding = 'normal' }: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn(
        tone === 'ivory' && 'bg-ivory-100 text-ink-900',
        tone === 'white' && 'bg-ivory-50 text-ink-900',
        tone === 'sand' && 'bg-ivory-200 text-ink-900',
        tone === 'forest' && 'on-dark grain bg-forest-800 text-ivory-50',
        tone === 'charcoal' && 'on-dark bg-ink-900 text-ivory-50',
        padding === 'normal' && 'py-20 sm:py-24 lg:py-28',
        padding === 'tight' && 'py-12 sm:py-16',
        padding === 'loose' && 'py-24 sm:py-32 lg:py-36',
        className,
      )}
    >
      {children}
    </section>
  );
}

type SectionHeadingProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  id?: string;
  children?: ReactNode;
  align?: 'left' | 'center';
  className?: string;
  as?: 'h2' | 'h1';
};

export function SectionHeading({ eyebrow, title, id, children, align = 'left', className, as: Tag = 'h2' }: SectionHeadingProps) {
  return (
    <div className={cn('flex max-w-2xl flex-col gap-4', align === 'center' && 'mx-auto items-center text-center', className)}>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <Tag id={id} className="text-display-lg font-semibold">
        {title}
      </Tag>
      {children && <div className="text-lead text-ink-600 dark-section:text-ivory-100/80">{children}</div>}
    </div>
  );
}
