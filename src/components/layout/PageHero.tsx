import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { ConstellationSvg } from '@/components/visual/ConstellationSvg';
import { Container } from './Container';

type PageHeroProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  intro?: ReactNode;
  children?: ReactNode;
  className?: string;
  size?: 'default' | 'compact';
};

/** Dark editorial banner at the top of inner pages (the header sits on top of it). */
export function PageHero({ eyebrow, title, intro, children, className, size = 'default' }: PageHeroProps) {
  return (
    <section className={cn('on-dark grain relative overflow-hidden bg-forest-800 text-ivory-50', className)}>
      <ConstellationSvg className="pointer-events-none absolute inset-y-0 right-[-20%] h-full w-[85%] opacity-35 sm:right-[-8%] sm:w-[70%]" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_120%_at_0%_100%,rgb(7_26_18/0.7),transparent_60%)]" />
      <Container className={cn('relative', size === 'default' ? 'pt-40 pb-20 sm:pt-44 sm:pb-24' : 'pt-36 pb-14 sm:pt-40 sm:pb-16')}>
        <div className="flex max-w-3xl flex-col gap-5">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="text-display-xl font-semibold">{title}</h1>
          {intro && <div className="text-lead max-w-2xl text-ivory-100/85">{intro}</div>}
          {children && <div className="mt-3 flex flex-wrap gap-3">{children}</div>}
        </div>
      </Container>
    </section>
  );
}
