import { m } from 'framer-motion';
import type { ReactNode } from 'react';
import { usePrefersReducedMotion } from '@/hooks/useReducedMotion';
import { cn } from '@/lib/cn';

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  /** Vertical travel in px. */
  y?: number;
  as?: 'div' | 'section' | 'li' | 'article';
};

/**
 * Fades and lifts content into view once. With reduced motion the content is
 * rendered immediately without any transform.
 */
export function Reveal({ children, className, delay = 0, y = 28, as = 'div' }: RevealProps) {
  const reduced = usePrefersReducedMotion();
  if (reduced) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }
  const Component = m[as];
  return (
    <Component
      data-reveal=""
      className={cn(className)}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </Component>
  );
}
