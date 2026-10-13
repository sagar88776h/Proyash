import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export function AdminNotFound() {
  useDocumentTitle('Page not found');
  return (
    <EmptyState
      title="Page not found"
      description="This page does not exist in the portal, or the link is out of date."
      action={<ButtonLink to="/admin" variant="secondary">Back to the overview</ButtonLink>}
    />
  );
}
