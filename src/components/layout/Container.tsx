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
  const band = tone === 'forest' || tone === 'charcoal';
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn(
        // Light sections sit on the white page; dark sections become rounded bands.
        (tone === 'ivory' || tone === 'white') && 'bg-white text-ink-900',
        tone === 'sand' && 'bg-mint-50 text-ink-900',
        band && 'on-dark mx-2 overflow-hidden rounded-bento text-ivory-50 sm:mx-4',
        tone === 'forest' && 'bg-forest-800',
        tone === 'charcoal' && 'bg-ink-900',
        padding === 'normal' && 'py-20 sm:py-24',
        padding === 'tight' && 'py-12 sm:py-16',
        padding === 'loose' && 'py-20 sm:py-28',
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
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <Tag id={id} className="text-display-lg font-semibold">
        {title}
      </Tag>
      {children && <div className="text-lead text-ink-600 dark-section:text-ivory-100/80">{children}</div>}
    </div>
  );
}

/** Small label shown above headings (styled as a pill on the public site). */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('eyebrow', className)}>{children}</p>;
}
