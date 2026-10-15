import { Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Placeholder } from '@/components/Placeholder';
import { usePublicSettings } from '@/hooks/useSettings';
import { telLink, whatsappLink } from '@/lib/contact';
import { Container } from './Container';
import { Logo } from './Logo';
import { FOOTER_NAV } from './navigation';

function ContactLine({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-ivory-100/85">
      <span className="mt-0.5 text-gold-400">{icon}</span>
      <span>{children}</span>
    </li>
  );
}

export function SiteFooter() {
  const { settings } = usePublicSettings();
  const { contact, social } = settings;
  const hasContact = Boolean(contact.phone || contact.email || contact.address || contact.whatsapp);
  const socials = [
    { key: 'facebook', label: 'Facebook' },
    { key: 'instagram', label: 'Instagram' },
    { key: 'youtube', label: 'YouTube' },
    { key: 'linkedin', label: 'LinkedIn' },
    { key: 'x', label: 'X' },
  ] as const;
  const wa = contact.whatsapp ? whatsappLink(contact.whatsapp) : null;

  return (
    <footer className="px-2 pt-8 pb-2 sm:px-4 sm:pb-4">
      <div className="on-dark overflow-hidden rounded-bento bg-forest-900 text-ivory-50">
        <Container size="wide" className="pt-16 pb-10 sm:pt-20">
          <div className="grid gap-14 lg:grid-cols-[1.2fr_2fr]">
            <div className="flex flex-col gap-6">
              <Logo />
              <p className="max-w-sm text-ivory-100/80">
                A Group of Friends &amp; Well-Wishers uniting compassionate people across nearby
                villages to support people in need and strengthen the community.
              </p>
              <p className="font-display text-lg text-gold-300">
                Together for Humanity. Together for a Better Tomorrow.
              </p>
              <div>
                <h2 className="mb-3 text-sm font-semibold tracking-[0.14em] text-ivory-100 uppercase">
                  Official contact
                </h2>
                {hasContact ? (
                  <ul className="flex flex-col gap-3 text-[0.9375rem]">
                    {contact.phone && (
                      <ContactLine icon={<Phone className="size-4" aria-hidden="true" />}>
                        <a
                          href={telLink(contact.phone) ?? undefined}
                          className="hover:text-gold-300"
                        >
                          {contact.phone}
                        </a>
                      </ContactLine>
                    )}
                    {wa && (
                      <ContactLine icon={<MessageCircle className="size-4" aria-hidden="true" />}>
                        <a
                          href={wa}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-gold-300"
                        >
                          WhatsApp {contact.whatsapp}
                        </a>
                      </ContactLine>
                    )}
                    {contact.email && (
                      <ContactLine icon={<Mail className="size-4" aria-hidden="true" />}>
                        <a href={`mailto:${contact.email}`} className="break-all hover:text-gold-300">
                          {contact.email}
                        </a>
                      </ContactLine>
                    )}
                    {contact.address && (
                      <ContactLine icon={<MapPin className="size-4" aria-hidden="true" />}>
                        <span className="whitespace-pre-line">{contact.address}</span>
                      </ContactLine>
                    )}
                  </ul>
                ) : (
                  <Placeholder
                    tone="dark"
                    compact
                    label="Official phone, email and address"
                    hint="Add them in the admin portal under Settings."
                  />
                )}
              </div>
            </div>
            <div className="grid gap-10 sm:grid-cols-3">
              {FOOTER_NAV.map((group) => (
                <nav key={group.title} aria-label={group.title}>
                  <h2 className="mb-4 text-sm font-semibold tracking-[0.14em] text-ivory-100 uppercase">
                    {group.title}
                  </h2>
                  <ul className="flex flex-col gap-2.5">
                    {group.links.map((link) => (
                      <li key={link.to}>
                        <Link
                          to={link.to}
                          className="text-ivory-100/80 transition-colors hover:text-gold-300"
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              ))}
            </div>
          </div>
          <div className="mt-16 flex flex-col gap-6 border-t border-white/10 pt-8 text-sm text-ivory-100/70 sm:flex-row sm:items-center sm:justify-between">
            <p>
              © {new Date().getFullYear()} {settings.organisation.legal_name ?? 'PRAYASH'}.
              {settings.organisation.registration_details
                ? ` ${settings.organisation.registration_details}`
                : ''}
            </p>
            <div className="flex items-center gap-5">
              {socials.map((s) => {
                const url = social[s.key];
                return url ? (
                  <a
                    key={s.key}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-gold-300"
                  >
                    {s.label}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                ) : null;
              })}
              <Link to="/admin/login" className="hover:text-gold-300">
                Team sign-in
              </Link>
            </div>
          </div>
        </Container>
      </div>
    </footer>
  );
}
