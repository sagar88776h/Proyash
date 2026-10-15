import { ArrowLeft } from 'lucide-react';
import { Container } from '@/components/layout/Container';
import { ButtonLink } from '@/components/ui/Button';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <section className="px-2 pt-24 sm:px-4 sm:pt-28">
      <div className="bg-mesh overflow-hidden rounded-bento">
        <Container className="flex min-h-[60svh] flex-col items-start justify-center gap-6 py-16">
          <p className="eyebrow">Error 404</p>
          <h1 className="text-display-xl font-semibold text-ink-900">
            We could not find that page
          </h1>
          <p className="text-lead max-w-xl text-ink-700">
            The page may have moved, or the link may be incorrect.
          </p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink to="/" iconLeft={<ArrowLeft aria-hidden="true" className="size-4" />}>
              Back to home
            </ButtonLink>
            <ButtonLink to="/contact" variant="secondary">
              Contact us
            </ButtonLink>
          </div>
        </Container>
      </div>
    </section>
  );
}
