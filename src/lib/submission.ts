import { useCallback, useState } from 'react';

export type FormMeta = { client_submission_id: string; started_at: number; website: string };

/**
 * Anti-abuse metadata for public forms: a per-attempt idempotency key (so a
 * double-click or retry never creates a duplicate), the time the form was
 * opened, and an always-empty honeypot value.
 */
export function useFormMeta() {
  const create = () => ({ client_submission_id: crypto.randomUUID(), started_at: Date.now() });
  const [meta, setMeta] = useState(create);
  const reset = useCallback(() => setMeta(create()), []);
  return { meta, reset };
}
