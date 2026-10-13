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
    const hint = err.hint ?? undefined;
    const message = err.message ?? 'Something went wrong.';
    switch (err.code) {
      case '42501':
        return new AppError('forbidden', hint === 'forbidden' || !hint ? 'You do not have permission to do this.' : message, hint);
      case '23505':
        return new AppError('conflict', 'A record with these details already exists (for example the same payment reference).', 'duplicate');
      case '23514':
        return new AppError('validation', 'Some of the values are not allowed. Please check the form.', 'check_violation');
      case '22023': {
        const field = hint?.startsWith('invalid:') ? hint.slice(8) : undefined;
        return new AppError('validation', message, hint, field ? { [field]: message } : undefined);
      }
      case 'PGRST116':
        return new AppError('not_found', 'The record could not be found.', 'not_found');
      case 'P0001':
        return new AppError('conflict', message, hint);
      default:
        if (err.code?.startsWith('PGRST')) return new AppError('server', 'The request could not be processed.', err.code);
        if (/failed to fetch|network/i.test(message)) return new AppError('network', NETWORK_MESSAGE);
        return new AppError('server', 'Something went wrong. Please try again.', err.code);
    }
  }
  if (err instanceof Error && /failed to fetch|network/i.test(err.message)) {
    return new AppError('network', NETWORK_MESSAGE);
  }
  return new AppError('server', 'Something went wrong. Please try again.');
}

export function errorMessage(err: unknown): string {
  return toAppError(err).message;
}

/** Throws a normalised error when a Supabase response contains one. */
export function unwrap<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw toAppError(result.error);
  return result.data;
}
