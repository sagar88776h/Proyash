import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

type Props = {
  errors: Array<{ field: string; message: string }>;
  /** Changes on every failed submit so focus moves to the summary again. */
  attempt: number;
  title?: string;
};

/**
 * Lists form errors with links to each field and moves focus to the list after
 * a failed submit, so keyboard and screen-reader users find the problems.
 */
export function FormErrorSummary({ errors, attempt, title = 'Please correct the following' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const focusedAttempt = useRef(0);
  // Errors can arrive in a later render than the attempt counter, so focus the
  // summary once per failed attempt, as soon as it has something to show.
  useEffect(() => {
    if (attempt > focusedAttempt.current && errors.length > 0) {
      focusedAttempt.current = attempt;
      ref.current?.focus();
    }
  });
  // Inline messages guide people while they fill in the form; the summary
  // appears only after they try to submit.
  if (attempt === 0 || errors.length === 0) return null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      aria-labelledby="form-error-summary-title"
      className="rounded-md border border-danger-700/25 bg-danger-50 px-5 py-4 text-danger-700"
    >
      <p id="form-error-summary-title" className="flex items-center gap-2 font-semibold">
        <AlertTriangle aria-hidden="true" className="size-5" />
        {title}
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-7 text-sm">
        {errors.map((e) => (
          <li key={e.field}>
            <a href={`#f-${e.field}`} className="underline underline-offset-2 hover:no-underline">
              {e.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
