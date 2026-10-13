import { LogOut, Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, ScrollRestoration, useNavigate } from 'react-router';
import { LogoMark } from '@/components/layout/Logo';
import { SkipLink } from '@/components/layout/PublicLayout';
import { useAuth } from '@/features/auth/useAuth';
import { cn } from '@/lib/cn';
import { ROLE_LABELS } from '@/lib/labels';
import { ADMIN_NAV } from './navigation';

const IDLE_LIMIT_MS = 30 * 60 * 1000;

/** Signs out after 30 minutes without interaction (shared or public computers). */
function useIdleSignOut() {
  const auth = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    let timer = window.setTimeout(expire, IDLE_LIMIT_MS);
    function expire() {
      void auth.signOut().then(() => navigate('/admin/login', { replace: true, state: { reason: 'idle' } }));
    }
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(expire, IDLE_LIMIT_MS);
    };
    const events = ['pointerdown', 'keydown', 'scroll', 'visibilitychange'] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [auth, navigate]);
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const auth = useAuth();
  return (
    <nav aria-label="Portal" className="flex flex-col gap-6">
      {ADMIN_NAV.map((group) => {
        const items = group.items.filter((i) => auth.hasRole(...i.roles));
        if (!items.length) return null;
        return (
          <div key={group.label || 'main'} className="flex flex-col gap-1">
            {group.label && <p className="px-3 pb-1 text-[0.6875rem] font-semibold tracking-[0.14em] text-ivory-100/55 uppercase">{group.label}</p>}
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive ? 'bg-white/12 text-ivory-50' : 'text-ivory-100/80 hover:bg-white/6 hover:text-ivory-50',
                  )
                }
              >
                <item.icon aria-hidden="true" className="size-4.5 shrink-0" strokeWidth={1.8} />
                {item.label}
              </NavLink>
            ))}
          </div>
        );
      })}
    </nav>
  );
}

function UserBox() {
  const auth = useAuth();
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-3 border-t border-white/10 pt-4">
      <div className="min-w-0 px-1">
        <p className="truncate text-sm font-medium text-ivory-50">{auth.fullName || auth.email}</p>
        <p className="truncate text-xs text-ivory-100/65">{auth.roles.map((r) => ROLE_LABELS[r]).join(' · ')}</p>
      </div>
      <button
        type="button"
        onClick={() => void auth.signOut().then(() => navigate('/admin/login', { replace: true }))}
        className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-ivory-100/80 hover:bg-white/6 hover:text-ivory-50"
      >
        <LogOut aria-hidden="true" className="size-4" /> Sign out
      </button>
    </div>
  );
}

export function AdminLayout() {
  useIdleSignOut();
  const [open, setOpen] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = drawer.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <div className="min-h-svh bg-ivory-100 lg:grid lg:grid-cols-[17rem_1fr]">
      <SkipLink />
      <aside className="on-dark sticky top-0 hidden h-svh flex-col gap-6 overflow-y-auto bg-forest-900 px-4 py-6 text-ivory-50 lg:flex">
        <NavLink to="/admin" end className="flex items-center gap-3 px-2">
          <LogoMark />
          <span className="flex flex-col leading-none">
            <span className="font-display font-semibold tracking-[0.2em]">PRAYASH</span>
            <span className="mt-1 text-[0.6875rem] text-ivory-100/65">Team portal</span>
          </span>
        </NavLink>
        <div className="flex-1">
          <SideNav />
        </div>
        <UserBox />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="on-dark sticky top-0 z-30 flex h-14 items-center justify-between bg-forest-900 px-4 text-ivory-50 lg:hidden">
          <NavLink to="/admin" end className="flex items-center gap-2">
            <LogoMark className="size-8" />
            <span className="font-display text-sm font-semibold tracking-[0.2em]">PRAYASH</span>
          </NavLink>
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-full hover:bg-white/10"
            aria-label="Open portal menu"
            aria-expanded={open}
            aria-controls="admin-drawer"
            onClick={() => setOpen(true)}
          >
            <Menu aria-hidden="true" className="size-5" />
          </button>
        </header>
        <dialog
          ref={drawer}
          id="admin-drawer"
          aria-label="Portal menu"
          onClose={() => setOpen(false)}
          className="on-dark m-0 h-dvh max-h-none w-[min(20rem,88vw)] max-w-none bg-forest-900 p-0 text-ivory-50 backdrop:bg-ink-950/50"
        >
          <div className="flex h-full flex-col gap-6 overflow-y-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <span className="font-display text-sm font-semibold tracking-[0.2em]">PRAYASH</span>
              <button type="button" onClick={() => setOpen(false)} className="inline-flex size-10 items-center justify-center rounded-full hover:bg-white/10" aria-label="Close portal menu">
                <X aria-hidden="true" className="size-5" />
              </button>
            </div>
            <div className="flex-1">
              <SideNav onNavigate={() => setOpen(false)} />
            </div>
            <UserBox />
          </div>
        </dialog>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 outline-none sm:px-6 lg:px-10 lg:py-10">
          <Outlet />
        </main>
      </div>
      <ScrollRestoration />
    </div>
  );
}
