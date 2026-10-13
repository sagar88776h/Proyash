import { ArrowLeft } from 'lucide-react';
import { Container } from '@/components/layout/Container';
import { ButtonLink } from '@/components/ui/Button';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <section className="on-dark grain bg-forest-800 text-ivory-50">
      <Container className="flex min-h-[80svh] flex-col items-start justify-center gap-6 pt-32 pb-20">
        <p className="eyebrow">Error 404</p>
        <h1 className="text-display-xl font-semibold">We could not find that page</h1>
        <p className="text-lead max-w-xl text-ivory-100/85">The page may have moved, or the link may be incorrect.</p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink to="/" variant="gold" iconLeft={<ArrowLeft aria-hidden="true" className="size-4" />}>Back to home</ButtonLink>
          <ButtonLink to="/contact" variant="light">Contact us</ButtonLink>
        </div>
      </Container>
    </section>
  );
}
