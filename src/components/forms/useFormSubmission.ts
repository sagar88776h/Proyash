import { useState } from 'react';
import type { FieldErrors, FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { toAppError, type AppError } from '@/lib/errors';

/** Flattens react-hook-form errors into { field, message } for the error summary. */
export function summariseErrors<T extends FieldValues>(errors: FieldErrors<T>): Array<{ field: string; message: string }> {
  return Object.entries(errors)
    .filter(([, v]) => v && typeof v === 'object' && 'message' in v && v.message)
    .map(([field, v]) => ({ field, message: String((v as { message: string }).message) }));
}

/** Tracks a submission's server error and maps field errors from the API onto the form. */
export function useFormSubmission<T extends FieldValues>(setError: UseFormSetError<T>) {
  const [serverError, setServerError] = useState<AppError | null>(null);
  const [attempt, setAttempt] = useState(0);
  return {
    serverError,
    attempt,
    markAttempt: () => setAttempt((a) => a + 1),
    clearServerError: () => setServerError(null),
    handleError(err: unknown) {
      const appError = toAppError(err);
      if (appError.fields) {
        for (const [field, message] of Object.entries(appError.fields)) {
          setError(field as Path<T>, { type: 'server', message });
        }
      }
      setServerError(appError);
      setAttempt((a) => a + 1);
    },
  };
}
