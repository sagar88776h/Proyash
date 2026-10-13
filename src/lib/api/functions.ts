import { env } from '@/lib/env';
import { AppError, toAppError, type AppErrorKind } from '@/lib/errors';
import { isBackendConfigured } from '@/lib/env';
import { BackendNotConfiguredError, getSupabase } from '@/lib/supabase';

type FunctionName = 'public-api' | 'staff-api';

type CallOptions = {
  body?: unknown;
  formData?: FormData;
  /** Attach the signed-in user's access token (staff-api). */
  auth?: boolean;
  timeoutMs?: number;
};

type ErrorBody = { ok: false; error?: { code?: string; message?: string; fields?: Record<string, string> } };

function kindForStatus(status: number): AppErrorKind {
  if (status === 401 || status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 413 || status === 415 || status === 422 || status === 400) return 'validation';
  if (status === 429) return 'rate_limited';
  return 'server';
}

/** Calls an Edge Function and returns its JSON body, throwing AppError on failure. */
export async function callFunction<T>(fn: FunctionName, path: string, options: CallOptions = {}): Promise<T> {
  if (!isBackendConfigured || !env.supabaseUrl || !env.supabaseAnonKey) throw new BackendNotConfiguredError();
  const headers: Record<string, string> = { apikey: env.supabaseAnonKey };
  if (options.auth) {
    const { data } = await (await getSupabase()).auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new AppError('forbidden', 'Your session has expired. Please sign in again.', 'not_authenticated');
    headers.Authorization = `Bearer ${token}`;
  }
  let body: BodyInit | undefined;
  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  let res: Response;
  try {
    res = await fetch(`${env.supabaseUrl}/functions/v1/${fn}${path}`, {
      method: body ? 'POST' : 'GET',
      headers,
      body,
      signal: AbortSignal.timeout(options.timeoutMs ?? 25_000),
    });
  } catch (err) {
    throw toAppError(err);
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // fall through with null body
  }
  if (!res.ok) {
    const error = (json as ErrorBody | null)?.error;
    throw new AppError(
      kindForStatus(res.status),
      error?.message ?? 'Something went wrong. Please try again.',
      error?.code,
      error?.fields,
    );
  }
  return json as T;
}
