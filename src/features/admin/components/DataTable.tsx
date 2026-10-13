import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/cn';

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Hide from the stacked mobile view. */
  hideOnMobile?: boolean;
  align?: 'left' | 'right';
};

type DataTableProps<T> = {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  caption: string;
  /** Column whose cell becomes the link and heading in the mobile card view. */
  primaryKey?: string;
  rowClassName?: (row: T) => string | undefined;
};

/**
 * Accessible data table. On small screens rows render as stacked cards so no
 * horizontal scrolling is needed.
 */
export function DataTable<T>({ rows, columns, rowKey, rowHref, caption, primaryKey, rowClassName }: DataTableProps<T>) {
  const primary = columns.find((c) => c.key === primaryKey) ?? columns[0]!;
  return (
    <>
      <div className="hidden overflow-x-auto rounded-card bg-white shadow-[inset_0_0_0_1px_rgb(34_41_35/0.08)] md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="border-b border-ink-100 bg-ivory-50 text-xs font-semibold tracking-wide text-ink-600 uppercase">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn('px-4 py-3 whitespace-nowrap', c.align === 'right' && 'text-right', c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className={cn('border-b border-ink-100 last:border-0 hover:bg-ivory-50/80', rowClassName?.(row))}>
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-4 py-3 align-top', c.align === 'right' && 'text-right tabular-nums', c.className)}>
                    {c.key === primary.key && rowHref ? (
                      <Link to={rowHref(row)} className="font-medium text-forest-700 underline-offset-2 hover:underline">
                        {c.cell(row)}
                      </Link>
                    ) : (
                      c.cell(row)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-3 md:hidden" aria-label={caption}>
        {rows.map((row) => (
          <li key={rowKey(row)} className={cn('rounded-card bg-white p-4 shadow-[inset_0_0_0_1px_rgb(34_41_35/0.08)]', rowClassName?.(row))}>
            <p className="mb-2 font-medium">
              {rowHref ? (
                <Link to={rowHref(row)} className="text-forest-700 underline-offset-2 hover:underline">
                  {primary.cell(row)}
                </Link>
              ) : (
                primary.cell(row)
              )}
            </p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {columns
                .filter((c) => c.key !== primary.key && !c.hideOnMobile)
                .map((c) => (
                  <div key={c.key} className="min-w-0">
                    <dt className="text-xs text-ink-600">{c.header}</dt>
                    <dd className="break-words">{c.cell(row)}</dd>
                  </div>
                ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
