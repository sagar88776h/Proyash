import { BackendNotConfiguredError } from './supabase';

export type AppErrorKind =
  | 'network'
  | 'validation'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'not_configured'
  | 'server';

/** Normalised error with a message that is safe and helpful to show people. */
export class AppError extends Error {
  constructor(
    public kind: AppErrorKind,
    message: string,
    public code?: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

type PostgrestLike = { code?: string; message?: string; hint?: string | null; details?: string | null };

function isPostgrestLike(err: unknown): err is PostgrestLike {
  return typeof err === 'object' && err !== null && 'message' in err && ('code' in err || 'hint' in err);
}

const NETWORK_MESSAGE = 'We could not reach the server. Check your internet connection and try again.';
const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

/**
 * Messages written for people carry a machine-readable code in `hint`
 * (see private.fail() in the database). Anything else is a raw database or
 * server message: it can reveal table, column or constraint names, so it is
 * never shown — a generic message is used instead.
 */
const OWN_HINT = /^[a-z][a-z0-9_]*(:[a-z0-9_]+)?$/;

function ownMessage(err: PostgrestLike): string | undefined {
  return err.hint && OWN_HINT.test(err.hint) && err.message ? err.message : undefined;
}

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof BackendNotConfiguredError) return new AppError('not_configured', err.message);
  if (err instanceof TypeError && /fetch|network|load failed/i.test(err.message)) {
    return new AppError('network', NETWORK_MESSAGE);
  }
  if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return new AppError('network', 'The request took too long. Please try again.');
  }
  if (isPostgrestLike(err)) {
    const own = ownMessage(err);
    const hint = own ? (err.hint ?? undefined) : undefined;
    switch (err.code) {
      case '42501':
        return new AppError('forbidden', hint && hint !== 'forbidden' && own ? own : 'You do not have permission to do this.', hint ?? 'forbidden');
      case '23505':
        return new AppError('conflict', 'A record with these details already exists (for example the same payment reference).', 'duplicate');
      case '23514':
        return new AppError('validation', 'Some of the values are not allowed. Please check the form.', 'check_violation');
      case '22023': {
        if (!own) return new AppError('validation', 'Some of the values are not allowed. Please check the form.', 'invalid');
        const field = hint?.startsWith('invalid:') ? hint.slice(8) : undefined;
        return new AppError('validation', own, hint, field ? { [field]: own } : undefined);
      }
      case 'PGRST116':
        return new AppError('not_found', 'The record could not be found.', 'not_found');
      case 'P0001':
        return own ? new AppError('conflict', own, hint) : new AppError('server', GENERIC_MESSAGE);
      default:
        if (/failed to fetch|network/i.test(err.message ?? '')) return new AppError('network', NETWORK_MESSAGE);
        return new AppError('server', GENERIC_MESSAGE);
    }
  }
  if (err instanceof Error && /failed to fetch|network/i.test(err.message)) {
    return new AppError('network', NETWORK_MESSAGE);
  }
  return new AppError('server', GENERIC_MESSAGE);
}

export function errorMessage(err: unknown): string {
  return toAppError(err).message;
}

/** Throws a normalised error when a Supabase response contains one. */
export function unwrap<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw toAppError(result.error);
  return result.data;
}
