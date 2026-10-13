import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tab = { id: string; label: ReactNode; hidden?: boolean };

/** WAI-ARIA tabs with arrow-key navigation. */
export function Tabs({ tabs, active, onChange, children, label }: { tabs: Tab[]; active: string; onChange: (id: string) => void; children: ReactNode; label: string }) {
  const base = useId().replace(/:/g, '');
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const visible = tabs.filter((t) => !t.hidden);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (e.key === 'ArrowRight') next = (index + 1) % visible.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + visible.length) % visible.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = visible.length - 1;
    else return;
    e.preventDefault();
    const tab = visible[next]!;
    onChange(tab.id);
    refs.current[tab.id]?.focus();
  };
  return (
    <div>
      <div role="tablist" aria-label={label} className="mb-6 flex gap-1 overflow-x-auto border-b border-ink-100">
        {visible.map((tab, i) => (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[tab.id] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${tab.id}`}
            aria-selected={active === tab.id}
            aria-controls={`${base}-panel`}
            tabIndex={active === tab.id ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
              active === tab.id ? 'border-forest-700 text-forest-800' : 'border-transparent text-ink-600 hover:text-ink-900',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${active}`} tabIndex={0} className="focus-visible:outline-offset-8">
        {children}
      </div>
    </div>
  );
}
