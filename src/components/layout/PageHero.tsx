import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { HillsStrip } from '@/components/visual/VillageDawn';
import { Container, Eyebrow } from './Container';

type PageHeroProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  intro?: ReactNode;
  children?: ReactNode;
  className?: string;
  size?: 'default' | 'compact';
};

/** Light, rounded banner at the top of inner pages (the floating header sits above it). */
export function PageHero({ eyebrow, title, intro, children, className, size = 'default' }: PageHeroProps) {
  return (
    <section className={cn('px-2 pt-24 sm:px-4 sm:pt-28', className)}>
      <div className="bg-mesh relative overflow-hidden rounded-bento">
        <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full border-[28px] border-white/60 sm:size-96" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 left-1/3 size-48 rounded-full bg-gold-100/70 blur-2xl" />
        <HillsStrip />
        <Container className={cn('relative', size === 'default' ? 'pt-16 pb-24 sm:pt-24 sm:pb-32' : 'pt-12 pb-20 sm:pt-16 sm:pb-24')}>
          <div className="flex max-w-3xl flex-col gap-5">
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            <h1 className="text-display-xl font-semibold text-ink-900">{title}</h1>
            {intro && <div className="text-lead max-w-2xl text-ink-700">{intro}</div>}
            {children && <div className="mt-3 flex flex-wrap gap-3">{children}</div>}
          </div>
        </Container>
      </div>
    </section>
  );
}
