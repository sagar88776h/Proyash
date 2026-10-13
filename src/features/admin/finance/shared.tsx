import { cn } from '@/lib/cn';
import { formatINR } from '@/lib/format';
import { ENTRY_TYPE_LABELS } from '@/lib/labels';
import type { Enums } from '@/types/database';

export function Amount({ value, direction, className }: { value: number; direction: Enums<'ledger_direction'>; className?: string }) {
  const sign = direction === 'out' ? '−' : direction === 'in' ? '+' : '';
  return (
    <span className={cn('font-medium tabular-nums', direction === 'out' ? 'text-danger-700' : direction === 'in' ? 'text-success-700' : 'text-ink-800', className)}>
      {sign}
      {formatINR(value)}
    </span>
  );
}

export function EntryType({ type }: { type: Enums<'ledger_entry_type'> }) {
  return <span>{ENTRY_TYPE_LABELS[type]}</span>;
}
