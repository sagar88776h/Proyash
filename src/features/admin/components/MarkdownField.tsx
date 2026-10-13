import { lazy, Suspense, useState } from 'react';
import { Field, Textarea } from '@/components/ui/Field';
import { LoadingBlock } from '@/components/ui/Spinner';

const Markdown = lazy(() => import('@/components/Markdown').then((m) => ({ default: m.Markdown })));

type Props = { id: string; label: string; value: string; onChange: (v: string) => void; max: number; hint?: string; rows?: number; required?: boolean; error?: string };

/** Markdown textarea with a preview toggle. */
export function MarkdownField({ id, label, value, onChange, max, hint, rows = 8, required, error }: Props) {
  const [preview, setPreview] = useState(false);
  return (
    <Field
      id={id}
      label={label}
      required={required}
      error={error}
      hint={
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span>{hint ?? 'Supports **bold**, lists (- item) and links [text](https://…).'}</span>
          <button type="button" className="text-sm font-medium text-forest-700 underline underline-offset-2" onClick={() => setPreview((p) => !p)} aria-pressed={preview}>
            {preview ? 'Edit' : 'Preview'}
          </button>
        </span>
      }
    >
      {preview ? (
        <div className="min-h-32 rounded-sm border border-ink-200 bg-white p-4">
          <Suspense fallback={<LoadingBlock />}>
            <Markdown>{value || '_Nothing to preview._'}</Markdown>
          </Suspense>
        </div>
      ) : (
        <Textarea rows={rows} maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
      <span className="text-right text-xs text-ink-600">{value.length} / {max}</span>
    </Field>
  );
}
