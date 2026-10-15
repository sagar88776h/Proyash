import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { NavLink, useLocation } from 'react-router';
import { ButtonLink } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { Logo } from './Logo';
import { PRIMARY_NAV } from './navigation';

/**
 * Full-screen navigation for small screens, built on a modal <dialog>:
 * focus is contained, Escape closes it, and focus returns to the menu button.
 */
export function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const location = useLocation();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      document.documentElement.style.overflow = 'hidden';
    }
    if (!open && dialog.open) dialog.close();
    if (!open) document.documentElement.style.overflow = '';
    return () => {
      document.documentElement.style.overflow = '';
    };
  }, [open]);

  // Close after navigating.
  useEffect(() => {
    onCloseRef.current();
  }, [location.pathname]);

  // Close if the viewport grows to desktop size while open.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    const onChange = () => mq.matches && onCloseRef.current();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return (
    <dialog
      ref={ref}
      id="mobile-menu"
      aria-label="Site menu"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="pointer-events-auto m-0 h-dvh max-h-none w-full max-w-none bg-white p-0 text-ink-900 backdrop:bg-transparent"
    >
      <div className="flex h-full flex-col overflow-y-auto px-4 pt-3 pb-8 sm:px-6">
        <div className="flex h-[4.5rem] shrink-0 items-center justify-between">
          <Logo />
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-11 items-center justify-center rounded-full bg-mint-50 text-forest-800 hover:bg-mint-100"
            aria-label="Close menu"
          >
            <X aria-hidden="true" className="size-6" />
          </button>
        </div>
        <nav aria-label="Main" className="mt-6 flex-1">
          <ul className="flex flex-col gap-1">
            {[{ to: '/', label: 'Home' }, ...PRIMARY_NAV].map((item, i) => (
              <li key={item.to} style={{ animationDelay: `${i * 40}ms` }}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center justify-between rounded-2xl px-4 py-3.5 font-display text-2xl font-medium transition-colors',
                      isActive ? 'bg-mint-100 text-forest-800' : 'text-ink-900 hover:bg-mint-50',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <ButtonLink to="/request-help" variant="secondary" size="lg">
            Request help
          </ButtonLink>
          <ButtonLink to="/support-us" variant="primary" size="lg">
            Support us
          </ButtonLink>
        </div>
      </div>
    </dialog>
  );
}
