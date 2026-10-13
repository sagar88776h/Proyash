import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';

export function StatTile({ value, label, note, className }: { value: number; label: ReactNode; note?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2 border-t border-current/15 pt-5', className)}>
      <p className="font-display text-[clamp(2.5rem,1.8rem+2.4vw,3.75rem)] leading-none font-semibold tracking-tight tabular-nums">
        {formatNumber(value)}
      </p>
      <p className="font-medium">{label}</p>
      {note && <p className="text-sm opacity-75">{note}</p>}
    </div>
  );
}
