/** HTTP helpers shared by the edge functions (runtime-neutral: Deno and Node). */

export type ApiErrorBody = {
  ok: false;
  error: { code: string; message: string; fields?: Record<string, string> };
};

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export function corsHeaders(origin: string | null, allowedOrigins: string[]): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin && allowedOrigins.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export function json(body: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

export function errorResponse(err: HttpError, headers: Record<string, string>): Response {
  const body: ApiErrorBody = { ok: false, error: { code: err.code, message: err.message } };
  if (err.fields) body.error.fields = err.fields;
  return json(body, err.status, headers);
}

/** Route path after the function name, e.g. "/public-api/assistance" → "/assistance". */
export function routePath(url: URL, functionName: string): string {
  const idx = url.pathname.indexOf(`/${functionName}`);
  const rest = idx >= 0 ? url.pathname.slice(idx + functionName.length + 1) : url.pathname;
  return rest === '' ? '/' : rest.replace(/\/+$/, '') || '/';
}

export async function readJson(req: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw new HttpError(413, 'payload_too_large', 'The submission is too large.');
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new HttpError(415, 'unsupported_media_type', 'Send the form as JSON.');
  }
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'payload_too_large', 'The submission is too large.');
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'invalid_json', 'The submission could not be read.');
  }
}

export type ParsedMultipart = { fields: Record<string, unknown>; file: File | null };

/**
 * Reads multipart/form-data where the field "payload" holds the JSON form
 * values and the optional field "file" holds one attachment.
 */
export async function readMultipart(req: Request, maxBytes: number): Promise<ParsedMultipart> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw new HttpError(413, 'payload_too_large', 'The file is too large (maximum 5 MB).');
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) return { fields: await readJson(req, maxBytes), file: null };
  if (!contentType.includes('multipart/form-data')) {
    throw new HttpError(415, 'unsupported_media_type', 'Unsupported submission format.');
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, 'invalid_form', 'The submission could not be read.');
  }
  const payload = form.get('payload');
  if (typeof payload !== 'string' || payload.length > 64 * 1024) {
    throw new HttpError(400, 'invalid_form', 'The submission could not be read.');
  }
  let fields: Record<string, unknown>;
  try {
    fields = JSON.parse(payload);
  } catch {
    throw new HttpError(400, 'invalid_json', 'The submission could not be read.');
  }
  const file = form.get('file');
  return { fields, file: file && typeof file !== 'string' && file.size > 0 ? file : null };
}

/** Database error shape returned by PostgREST / supabase-js. */
export type DbError = { message: string; code?: string; hint?: string | null; details?: string | null };

/**
 * Database messages written for people carry a machine-readable code in
 * `hint` (private.fail() in the migrations). Any other database message is
 * raw and may reveal internal names, so it is never passed to the caller.
 */
export const OWN_HINT = /^[a-z][a-z0-9_]*(:[a-z0-9_]+)?$/;

export function hasOwnMessage(error: DbError): boolean {
  return Boolean(error.hint && OWN_HINT.test(error.hint) && error.message);
}

export function dbErrorToHttp(error: DbError): HttpError {
  if (!hasOwnMessage(error)) {
    if (error.code === '42501') return new HttpError(403, 'forbidden', 'You do not have permission to perform this action.');
    return new HttpError(500, 'server_error', 'Something went wrong on our side. Please try again later.');
  }
  const hint = error.hint!;
  if (hint.startsWith('invalid:')) {
    const field = hint.slice('invalid:'.length);
    return new HttpError(422, 'validation_failed', error.message, { [field]: error.message });
  }
  if (error.code === '42501') return new HttpError(403, hint, error.message);
  if (error.code === 'P0001') return new HttpError(409, hint, error.message);
  return new HttpError(500, 'server_error', 'Something went wrong on our side. Please try again later.');
}
