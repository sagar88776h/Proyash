import { Alert } from '@/components/ui/Feedback';
import { isBackendConfigured } from '@/lib/env';

/** Explains a disabled submit button while the site has no database connection. */
export function NotConnectedNotice({ title }: { title: string }) {
  if (isBackendConfigured) return null;
  return (
    <Alert tone="warning" title={title}>
      This website is not yet connected to its database. Please contact PRAYASH directly.
    </Alert>
  );
}
