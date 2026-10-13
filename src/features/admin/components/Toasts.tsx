import { CheckCircle2, X, XCircle } from 'lucide-react';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { ToastContext, type ToastApi } from './useToast';

type Toast = { id: number; tone: 'success' | 'error'; message: string };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (tone: Toast['tone'], message: string) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t.slice(-3), { id, tone, message }]);
      window.setTimeout(() => dismiss(id), tone === 'error' ? 9000 : 5000);
    },
    [dismiss],
  );
  const api = useMemo<ToastApi>(() => ({ success: (m) => push('success', m), error: (m) => push('error', m) }), [push]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed right-4 bottom-4 z-[70] flex w-[min(24rem,calc(100%-2rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-md px-4 py-3 text-sm shadow-lift',
              t.tone === 'success' ? 'bg-forest-800 text-ivory-50' : 'bg-danger-700 text-white',
            )}
          >
            {t.tone === 'success' ? <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> : <XCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}
            <p className="flex-1">{t.message}</p>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="-m-1 rounded p-1 hover:bg-white/15">
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
