import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

type PageHeaderProps = {
  title: ReactNode;
  documentTitle?: string;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
  meta?: ReactNode;
};

export function PageHeader({ title, documentTitle, description, actions, back, meta }: PageHeaderProps) {
  useDocumentTitle(documentTitle ?? (typeof title === 'string' ? title : undefined));
  return (
    <header className="mb-8 flex flex-col gap-4">
      {back && (
        <Link to={back.to} className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-ink-600 hover:text-forest-700">
          <ArrowLeft aria-hidden="true" className="size-4" /> {back.label}
        </Link>
      )}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-[1.75rem] leading-tight font-semibold sm:text-3xl">{title}</h1>
          {description && <div className="max-w-3xl text-ink-600">{description}</div>}
          {meta && <div className="flex flex-wrap items-center gap-2 text-sm text-ink-600">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Card({ children, className = '', title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={`rounded-card bg-white p-5 shadow-[inset_0_0_0_1px_rgb(34_41_35/0.08)] sm:p-6 ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="font-display text-lg font-semibold">{title}</h2>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function KeyValue({ items, columns = 2 }: { items: Array<{ label: ReactNode; value: ReactNode; hidden?: boolean }>; columns?: 1 | 2 | 3 }) {
  return (
    <dl className={`grid gap-x-6 gap-y-4 ${columns === 2 ? 'sm:grid-cols-2' : columns === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : ''}`}>
      {items
        .filter((i) => !i.hidden)
        .map((item, idx) => (
          <div key={idx} className="min-w-0">
            <dt className="text-sm text-ink-600">{item.label}</dt>
            <dd className="mt-0.5 font-medium break-words text-ink-900">{item.value ?? '—'}</dd>
          </div>
        ))}
    </dl>
  );
}
