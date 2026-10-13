import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
};

/**
 * Modal dialog built on the native <dialog> element, which provides focus
 * containment, Escape-to-close and an inert background for free.
 */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={cn(
        'm-auto w-[calc(100%-2rem)] rounded-card bg-ivory-50 p-0 text-ink-900 shadow-lift backdrop:bg-ink-950/50 backdrop:backdrop-blur-[2px]',
        size === 'sm' && 'max-w-md',
        size === 'md' && 'max-w-lg',
        size === 'lg' && 'max-w-2xl',
      )}
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-6 pt-5 pb-4">
            <div>
              <h2 id={titleId} className="font-display text-xl font-semibold">
                {title}
              </h2>
              {description && (
                <p id={descId} className="mt-1 text-sm text-ink-600">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-2 rounded-full p-2 text-ink-600 hover:bg-ink-900/5 hover:text-ink-900"
              aria-label="Close dialog"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
          {children && <div className="overflow-y-auto px-6 py-5">{children}</div>}
          {footer && <div className="flex flex-wrap justify-end gap-3 border-t border-ink-100 px-6 py-4">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
