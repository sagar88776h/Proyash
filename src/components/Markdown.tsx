import ReactMarkdown, { type Components } from 'react-markdown';
import { Link } from 'react-router';
import { cn } from '@/lib/cn';

const components: Components = {
  a({ href, children }) {
    if (href && href.startsWith('/') && !href.startsWith('//')) {
      return <Link to={href}>{children}</Link>;
    }
    const safe = href && /^(https?:|mailto:|tel:)/i.test(href) ? href : undefined;
    return (
      <a href={safe} target={safe?.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer">
        {children}
      </a>
    );
  },
};

/**
 * Renders editable content written in Markdown. Raw HTML is ignored and
 * images are not allowed, so content cannot inject scripts or trackers.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn('prose-prayash', className)}>
      <ReactMarkdown skipHtml disallowedElements={['img']} unwrapDisallowed components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
