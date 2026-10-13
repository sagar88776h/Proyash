import { Container, Section } from '@/components/layout/Container';
import { PageHero } from '@/components/layout/PageHero';
import { Markdown } from '@/components/Markdown';
import { Alert } from '@/components/ui/Feedback';
import { textOf, type ContentKey } from '@/content/registry';
import { useContent } from '@/content/useContent';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { formatDate } from '@/lib/format';

function LegalPage({ contentKey }: { contentKey: Extract<ContentKey, 'privacy' | 'terms'> }) {
  const { content, isDefault, publishedAt } = useContent(contentKey);
  const heading = textOf(content, 'heading');
  useDocumentTitle(heading);
  const updated = textOf(content, 'last_updated') || (publishedAt ? formatDate(publishedAt) : '');
  return (
    <>
      <PageHero eyebrow="Information" title={heading} intro={updated ? `Last updated: ${updated}` : undefined} size="compact" />
      <Section tone="ivory">
        <Container size="narrow" className="flex flex-col gap-8">
          {isDefault && (
            <Alert tone="warning" title="Draft — pending review by PRAYASH">
              This text describes how this website handles information. It must be reviewed and approved by PRAYASH before the website is launched.
            </Alert>
          )}
          <Markdown className="max-w-none">{textOf(content, 'body')}</Markdown>
        </Container>
      </Section>
    </>
  );
}

export function PrivacyPage() {
  return <LegalPage contentKey="privacy" />;
}

export function TermsPage() {
  return <LegalPage contentKey="terms" />;
}
