import { isRouteErrorResponse, useRouteError } from 'react-router';
import { Container } from '@/components/layout/Container';
import { Button, ButtonLink } from '@/components/ui/Button';

/** Shown when a route fails to load or render (e.g. after a new deployment). */
export function RouteError() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const chunkError = error instanceof Error && /dynamically imported module|Loading chunk|Importing a module script failed/i.test(error.message);
  return (
    <main id="main" className="on-dark grain min-h-svh bg-forest-800 text-ivory-50">
      <Container className="flex min-h-svh flex-col items-start justify-center gap-6 py-20">
        <p className="eyebrow">{notFound ? 'Error 404' : 'Something went wrong'}</p>
        <h1 className="text-display-lg font-semibold">
          {notFound ? 'We could not find that page' : chunkError ? 'This page has been updated' : 'This page could not be displayed'}
        </h1>
        <p className="max-w-xl text-ivory-100/85">
          {chunkError
            ? 'A newer version of the website is available. Reload the page to continue.'
            : 'Please try again. If the problem continues, contact PRAYASH.'}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="gold" onClick={() => window.location.reload()}>Reload page</Button>
          <ButtonLink to="/" variant="light" reloadDocument>Go to home</ButtonLink>
        </div>
      </Container>
    </main>
  );
}
