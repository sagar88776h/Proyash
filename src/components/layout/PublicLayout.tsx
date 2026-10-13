import { Outlet, ScrollRestoration } from 'react-router';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';

export function SkipLink() {
  return (
    <a
      href="#main"
      className="fixed top-3 left-3 z-[60] -translate-y-24 rounded-full bg-gold-400 px-5 py-2.5 font-medium text-ink-900 shadow-lift transition-transform focus:translate-y-0"
    >
      Skip to main content
    </a>
  );
}

export function PublicLayout() {
  return (
    <>
      <SkipLink />
      <SiteHeader />
      <main id="main" tabIndex={-1} className="outline-none">
        <Outlet />
      </main>
      <SiteFooter />
      <ScrollRestoration />
    </>
  );
}
