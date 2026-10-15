import { useEffect, useRef, useState } from 'react';
import { Menu } from 'lucide-react';
import { NavLink } from 'react-router';
import { ButtonLink } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { Container } from './Container';
import { Logo } from './Logo';
import { MobileMenu } from './MobileMenu';
import { PRIMARY_NAV } from './navigation';

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40 px-2 pt-3 sm:px-4">
      <Container
        size="wide"
        className={cn(
          'pointer-events-auto flex h-16 items-center justify-between gap-4 rounded-full bg-white/90 pr-2 pl-4 text-ink-900 ring-1 ring-ink-900/[0.06] backdrop-blur-md transition-shadow duration-300 sm:pl-5',
          scrolled ? 'shadow-float' : 'shadow-card',
        )}
      >
        <Logo />
        <nav aria-label="Main" className="hidden xl:block">
          <ul className="flex items-center gap-1">
            {PRIMARY_NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'rounded-full px-4 py-2 text-[0.9375rem] font-medium transition-colors',
                      isActive ? 'bg-mint-100 text-forest-800' : 'text-ink-700 hover:bg-mint-50 hover:text-forest-700',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          {/* Wrapped so the display utility is not overridden by the button's own inline-flex. */}
          <div className="hidden items-center gap-2 sm:flex">
            <ButtonLink to="/request-help" size="sm" variant="ghost">
              Request help
            </ButtonLink>
            <ButtonLink to="/support-us" size="sm" variant="primary">
              Support us
            </ButtonLink>
          </div>
          <button
            ref={menuButtonRef}
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-full bg-mint-50 text-forest-800 transition-colors hover:bg-mint-100 xl:hidden"
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen(true)}
          >
            <Menu aria-hidden="true" className="size-5" />
          </button>
        </div>
      </Container>
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </header>
  );
}
