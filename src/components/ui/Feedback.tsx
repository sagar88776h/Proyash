import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, RefreshCw, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const toneStyles: Record<Tone, string> = {
  info: 'bg-info-50 text-info-700 border-info-700/20',
  success: 'bg-success-50 text-success-700 border-success-700/20',
  warning: 'bg-warning-50 text-warning-700 border-warning-700/25',
  danger: 'bg-danger-50 text-danger-700 border-danger-700/20',
};

const toneIcons: Record<Tone, ReactNode> = {
  info: <Info aria-hidden="true" className="size-5 shrink-0" />,
  success: <CheckCircle2 aria-hidden="true" className="size-5 shrink-0" />,
  warning: <AlertTriangle aria-hidden="true" className="size-5 shrink-0" />,
  danger: <XCircle aria-hidden="true" className="size-5 shrink-0" />,
};

type AlertProps = {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** "alert" interrupts screen readers; use for errors that need attention now. */
  live?: 'polite' | 'assertive' | 'off';
  action?: ReactNode;
};

export function Alert({ tone = 'info', title, children, className, live = 'polite', action }: AlertProps) {
  const role = live === 'assertive' ? 'alert' : live === 'polite' ? 'status' : undefined;
  return (
    <div role={role} className={cn('flex gap-3 rounded-md border px-4 py-3.5', toneStyles[tone], className)}>
      {toneIcons[tone]}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title && <p className="font-semibold leading-snug">{title}</p>}
        {children && <div className="text-sm leading-relaxed text-ink-800">{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}

type BadgeTone = 'neutral' | 'forest' | 'gold' | 'info' | 'success' | 'warning' | 'danger';

const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-ink-100 text-ink-800',
  forest: 'bg-forest-100 text-forest-800',
  gold: 'bg-gold-100 text-gold-800',
  info: 'bg-info-50 text-info-700',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

type EmptyStateProps = {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-ink-200 bg-white/60 px-6 py-12 text-center',
        className,
      )}
    >
      {icon && <div className="text-forest-600">{icon}</div>}
      <p className="font-display text-lg font-semibold text-ink-900">{title}</p>
      {description && <div className="max-w-md text-sm leading-relaxed text-ink-600">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

type ErrorStateProps = {
  title?: ReactNode;
  message?: ReactNode;
  onRetry?: () => void;
  className?: string;
};

export function ErrorState({
  title = 'Something went wrong',
  message = 'We could not load this information. Please check your connection and try again.',
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-card border border-danger-700/20 bg-danger-50 px-6 py-10 text-center',
        className,
      )}
    >
      <XCircle aria-hidden="true" className="size-8 text-danger-700" />
      <p className="font-display text-lg font-semibold text-ink-900">{title}</p>
      <div className="max-w-md text-sm leading-relaxed text-ink-700">{message}</div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} iconLeft={<RefreshCw aria-hidden="true" className="size-4" />}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-md bg-ink-900/[0.07]', className)} />;
}
