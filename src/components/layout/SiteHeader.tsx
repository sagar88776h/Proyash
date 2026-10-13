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
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-40 transition-[background-color,box-shadow,color] duration-500 ease-out-expo',
        scrolled
          ? 'bg-ivory-100/95 text-ink-900 shadow-[0_1px_0_rgb(34_41_35/0.08),0_8px_24px_-16px_rgb(34_41_35/0.25)] backdrop-blur-md supports-[backdrop-filter]:bg-ivory-100/85'
          : 'on-dark bg-transparent text-ivory-50',
      )}
    >
      <Container size="wide" className="flex h-[4.5rem] items-center justify-between gap-6">
        <Logo />
        <nav aria-label="Main" className="hidden xl:block">
          <ul className="flex items-center gap-1">
            {PRIMARY_NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'relative rounded-full px-3.5 py-2 text-[0.9375rem] font-medium transition-colors',
                      'after:absolute after:inset-x-3.5 after:-bottom-0.5 after:h-px after:origin-left after:scale-x-0 after:bg-current after:transition-transform after:duration-300',
                      'hover:after:scale-x-100',
                      isActive && 'after:scale-x-100',
                      scrolled ? 'text-ink-800 hover:text-forest-700' : 'text-ivory-50/90 hover:text-ivory-50',
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
          <ButtonLink to="/request-help" size="sm" variant={scrolled ? 'secondary' : 'light'} className="hidden sm:inline-flex">
            Request help
          </ButtonLink>
          <ButtonLink to="/support-us" size="sm" variant="gold" className="hidden sm:inline-flex">
            Support us
          </ButtonLink>
          <button
            ref={menuButtonRef}
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-full transition-colors hover:bg-current/10 xl:hidden"
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen(true)}
          >
            <Menu aria-hidden="true" className="size-6" />
          </button>
        </div>
      </Container>
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </header>
  );
}
