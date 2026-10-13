import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { LogoMark } from '@/components/layout/Logo';
import { ConstellationSvg } from '@/components/visual/ConstellationSvg';

/** Split-screen frame for sign-in and password pages. */
export function AuthShell({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-svh bg-ivory-100 lg:grid-cols-[1fr_1.1fr]">
      <div className="on-dark grain relative hidden overflow-hidden bg-forest-800 text-ivory-50 lg:block">
        <ConstellationSvg className="absolute inset-0 h-full w-full opacity-60" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link to="/" className="inline-flex items-center gap-3">
            <LogoMark />
            <span className="font-display text-lg font-semibold tracking-[0.2em]">PRAYASH</span>
          </Link>
          <div className="max-w-md">
            <p className="eyebrow mb-4">Team portal</p>
            <p className="font-display text-display-md font-semibold">Together for Humanity. Together for a Better Tomorrow.</p>
          </div>
        </div>
      </div>
      <main id="main" className="flex items-center justify-center px-4 py-16 sm:px-8">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-10 inline-flex items-center gap-3 lg:hidden">
            <LogoMark />
            <span className="font-display text-lg font-semibold tracking-[0.2em]">PRAYASH</span>
          </Link>
          <h1 className="font-display text-display-md font-semibold">{title}</h1>
          {description && <div className="mt-3 text-ink-600">{description}</div>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
