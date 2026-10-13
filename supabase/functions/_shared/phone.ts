/** Phone and reference normalisation (runtime-neutral, no dependencies). */

/** Mirrors private.normalize_phone() in the database. Returns E.164 or null. */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const plus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  if (!plus && digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
  if (!plus && digits.length === 11 && /^0[1-9]/.test(digits)) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && /^91[1-9]/.test(digits)) return `+${digits}`;
  if (plus && digits.length >= 8 && digits.length <= 15 && !digits.startsWith('0')) return `+${digits}`;
  return null;
}

export function normalizeReference(input: string): string {
  const compact = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const body = compact.startsWith('PRY') ? compact.slice(3) : compact;
  return body.length === 8 ? `PRY-${body.slice(0, 4)}-${body.slice(4)}` : input.trim().toUpperCase();
}
