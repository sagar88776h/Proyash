/**
 * public-api — the only entry point for public form submissions.
 *
 *   POST /assistance             request help (JSON)
 *   POST /assistance/status      check a request's status (JSON)
 *   POST /assistance/follow-up   add requested information (+ optional file)
 *   POST /volunteer              volunteer registration (JSON)
 *   POST /contact                contact message (JSON)
 *   POST /donation-report        "I have donated" report (+ optional screenshot)
 *   GET  /health
 *
 * Every submission is validated, checked for spam (honeypot, fill time,
 * optional Cloudflare Turnstile), rate limited per hashed IP (and per hashed
 * phone/reference where relevant), then passed to a SECURITY DEFINER database
 * function that validates it again. Personal data is never logged.
 */
import {
  assistanceRequestSchema,
  contactSchema,
  donationReportSchema,
  extensionFor,
  fieldErrors,
  followUpSchema,
  formMetaSchema,
  MAX_UPLOAD_BYTES,
  normalizePhone,
  sniffFileType,
  statusLookupSchema,
  volunteerSchema,
} from '../_shared/validation.ts';
import {
  corsHeaders,
  dbErrorToHttp,
  errorResponse,
  HttpError,
  json,
  readJson,
  readMultipart,
  routePath,
  type DbError,
} from '../_shared/http.ts';
import { clientIp, hashKey, spamVerdict, verifyTurnstile } from '../_shared/security.ts';

export type RpcResult<T> = { data: T | null; error: DbError | null };

export type PublicApiDeps = {
  rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<RpcResult<T>>;
  upload(bucket: string, path: string, bytes: Uint8Array, contentType: string): Promise<{ error: string | null }>;
  remove(bucket: string, paths: string[]): Promise<void>;
  config: {
    allowedOrigins: string[];
    rateLimitSalt: string;
    /** Multiplies every limit (e.g. for automated test runs). Defaults to 1. */
    rateLimitMultiplier?: number;
    turnstileSecret?: string;
  };
  verifyCaptcha?: (token: string | undefined, ip: string) => Promise<boolean>;
  now?: () => number;
  log?: (event: string, data: Record<string, string | number | boolean>) => void;
};

type Limit = { scope: string; limit: number; window: number; global?: boolean };

// Per-IP limits plus a generous global ceiling per route, which bounds abuse
// even when client IPs cannot be attributed reliably.
const LIMITS: Record<string, Limit[]> = {
  assistance: [
    { scope: 'assist_ip', limit: 5, window: 3600 },
    { scope: 'assist_ip_day', limit: 15, window: 86400 },
    { scope: 'assist_all', limit: 300, window: 3600, global: true },
  ],
  status: [
    { scope: 'status_ip', limit: 20, window: 3600 },
    { scope: 'status_all', limit: 1000, window: 3600, global: true },
  ],
  followup: [
    { scope: 'followup_ip', limit: 10, window: 3600 },
    { scope: 'followup_all', limit: 300, window: 3600, global: true },
  ],
  volunteer: [
    { scope: 'volunteer_ip', limit: 5, window: 3600 },
    { scope: 'volunteer_all', limit: 300, window: 3600, global: true },
  ],
  contact: [
    { scope: 'contact_ip', limit: 5, window: 3600 },
    { scope: 'contact_all', limit: 300, window: 3600, global: true },
  ],
  donation: [
    { scope: 'donation_ip', limit: 5, window: 3600 },
    { scope: 'donation_all', limit: 300, window: 3600, global: true },
  ],
};
const PHONE_LIMIT: Limit = { scope: 'assist_phone', limit: 3, window: 86400 };
const REFERENCE_LIMIT: Limit = { scope: 'status_ref', limit: 10, window: 3600 };

const JSON_LIMIT = 32 * 1024;
const MULTIPART_LIMIT = MAX_UPLOAD_BYTES + 128 * 1024;

const RECEIVED = { ok: true, result: 'received' } as const;

function safeFileName(name: string): string {
  const cleaned = name.normalize('NFKD').replace(/[^\w.\- ]+/g, '_').trim();
  return (cleaned || 'attachment').slice(-100);
}

export function createPublicApi(deps: PublicApiDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? (() => {});
  const verifyCaptcha =
    deps.verifyCaptcha ?? ((token: string | undefined, ip: string) => verifyTurnstile(deps.config.turnstileSecret, token, ip));
  const multiplier = Math.max(1, deps.config.rateLimitMultiplier ?? 1);

  async function consume(limit: Limit, value: string) {
    const key = `${limit.scope}:${await hashKey(deps.config.rateLimitSalt, value)}`;
    const { data, error } = await deps.rpc<boolean>('consume_rate_limit', {
      p_bucket: key,
      p_limit: limit.limit * multiplier,
      p_window_seconds: limit.window,
    });
    if (error) throw new HttpError(503, 'unavailable', 'The service is temporarily unavailable. Please try again shortly.');
    if (data === false) {
      throw new HttpError(429, 'rate_limited', 'Too many submissions from your connection. Please wait a while and try again.');
    }
  }

  async function enforce(route: string, ip: string) {
    for (const limit of LIMITS[route] ?? []) await consume(limit, limit.global ? 'all' : ip);
  }

  /** Validates anti-abuse metadata. Returns false for honeypot hits (silently accepted). */
  async function screen(body: Record<string, unknown>, ip: string): Promise<{ accept: boolean; submissionId: string }> {
    const meta = formMetaSchema.safeParse(body);
    if (!meta.success) throw new HttpError(400, 'invalid_form', 'The form could not be submitted. Please reload the page and try again.');
    const verdict = spamVerdict(meta.data, now());
    if (verdict === 'honeypot') return { accept: false, submissionId: meta.data.client_submission_id };
    if (verdict === 'too_fast') {
      throw new HttpError(400, 'too_fast', 'Please take a moment to check your details, then submit again.');
    }
    if (!(await verifyCaptcha(meta.data.captcha_token, ip))) {
      throw new HttpError(400, 'captcha_failed', 'Please complete the security check and try again.');
    }
    return { accept: true, submissionId: meta.data.client_submission_id };
  }

  function validated<T>(result: { success: true; data: T } | { success: false; error: Parameters<typeof fieldErrors>[0] }): T {
    if (!result.success) {
      throw new HttpError(422, 'validation_failed', 'Please check the highlighted fields.', fieldErrors(result.error));
    }
    return result.data;
  }

  async function callRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await deps.rpc<T>(fn, args);
    if (error) throw dbErrorToHttp(error);
    return data as T;
  }

  async function readFile(file: File | null): Promise<{ bytes: Uint8Array; mime: ReturnType<typeof sniffFileType> & string; name: string } | null> {
    if (!file) return null;
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new HttpError(413, 'file_too_large', 'The file is too large (maximum 5 MB).', { file: 'The file is too large (maximum 5 MB).' });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = sniffFileType(bytes);
    if (!mime) {
      throw new HttpError(422, 'validation_failed', 'Upload a PDF, JPG, PNG or WebP file.', {
        file: 'Upload a PDF, JPG, PNG or WebP file.',
      });
    }
    return { bytes, mime, name: safeFileName(file.name) };
  }

  const routes: Record<string, (req: Request, ip: string) => Promise<Response>> = {
    async '/assistance'(req, ip) {
      const body = await readJson(req, JSON_LIMIT);
      const { accept, submissionId } = await screen(body, ip);
      const data = validated(assistanceRequestSchema.safeParse(body));
      if (!accept) return json(RECEIVED, 200);
      await enforce('assistance', ip);
      await consume(PHONE_LIMIT, normalizePhone(data.phone) ?? data.phone);
      const result = await callRpc<{ result: string; reference_code?: string }>('submit_assistance_request', {
        p_category: data.category,
        p_urgency: data.urgency,
        p_applicant_name: data.applicant_name,
        p_phone: data.phone,
        p_email: data.email || null,
        p_village_id: data.village_id,
        p_locality: data.locality || null,
        p_description: data.description,
        p_relationship: data.relationship,
        p_preferred_contact: data.preferred_contact,
        p_consent: data.consent,
        p_client_submission_id: submissionId,
      });
      log('assistance_submitted', { result: result.result });
      if (result.result === 'duplicate_open_request') return json({ ok: true, result: 'duplicate_open_request' }, 200);
      return json({ ok: true, result: 'created', reference_code: result.reference_code }, 200);
    },

    async '/assistance/status'(req, ip) {
      const body = await readJson(req, JSON_LIMIT);
      const data = validated(statusLookupSchema.safeParse(body));
      await enforce('status', ip);
      await consume(REFERENCE_LIMIT, data.reference_code);
      const status = await callRpc<Record<string, unknown> & { found: boolean }>('assistance_status_lookup', {
        p_reference_code: data.reference_code,
        p_phone: data.phone,
      });
      if (!status.found) {
        throw new HttpError(404, 'not_found', 'We could not find a request with that reference number and phone number.');
      }
      return json({ ok: true, status }, 200);
    },

    async '/assistance/follow-up'(req, ip) {
      const { fields, file } = await readMultipart(req, MULTIPART_LIMIT);
      const { accept } = await screen(fields, ip);
      const data = validated(followUpSchema.safeParse(fields));
      const attachment = await readFile(file);
      if (!accept) return json(RECEIVED, 200);
      await enforce('followup', ip);
      await consume(REFERENCE_LIMIT, data.reference_code);
      const requestId = await callRpc<string | null>('assistance_followup_target', {
        p_reference_code: data.reference_code,
        p_phone: data.phone,
      });
      if (!requestId) {
        throw new HttpError(
          409,
          'followup_not_allowed',
          'We could not add information to this request. Check the reference and phone number, and that the request is waiting for more information.',
        );
      }
      let path: string | null = null;
      if (attachment) {
        path = `${requestId}/${crypto.randomUUID()}.${extensionFor(attachment.mime)}`;
        const uploaded = await deps.upload('assistance-files', path, attachment.bytes, attachment.mime);
        if (uploaded.error) throw new HttpError(500, 'upload_failed', 'The file could not be uploaded. Please try again.');
      }
      const { error } = await deps.rpc('assistance_add_followup', {
        p_request_id: requestId,
        p_message: data.message,
        p_attachment_path: path,
        p_attachment_name: attachment?.name ?? null,
        p_attachment_mime: attachment?.mime ?? null,
        p_attachment_size: attachment?.bytes.length ?? null,
      });
      if (error) {
        if (path) await deps.remove('assistance-files', [path]);
        throw dbErrorToHttp(error);
      }
      log('assistance_followup', { attachment: Boolean(path) });
      return json(RECEIVED, 200);
    },

    async '/volunteer'(req, ip) {
      const body = await readJson(req, JSON_LIMIT);
      const { accept, submissionId } = await screen(body, ip);
      const data = validated(volunteerSchema.safeParse(body));
      if (!accept) return json(RECEIVED, 200);
      await enforce('volunteer', ip);
      const result = await callRpc<{ result: string }>('submit_volunteer_registration', {
        p_full_name: data.full_name,
        p_phone: data.phone,
        p_email: data.email || null,
        p_village_id: data.village_id,
        p_locality: data.locality || null,
        p_is_adult: data.is_adult,
        p_guardian_name: data.guardian_name || null,
        p_guardian_phone: data.guardian_phone || null,
        p_skills: data.skills,
        p_skills_other: data.skills_other || null,
        p_availability: data.availability,
        p_preferred_activities: data.preferred_activities,
        p_languages: data.languages || null,
        p_motivation: data.motivation || null,
        p_consent_contact: data.consent_contact,
        p_consent_public_recognition: data.consent_public_recognition,
        p_client_submission_id: submissionId,
      });
      log('volunteer_registered', { result: result.result });
      return json({ ok: true, result: result.result === 'replayed' ? 'created' : result.result }, 200);
    },

    async '/contact'(req, ip) {
      const body = await readJson(req, JSON_LIMIT);
      const { accept, submissionId } = await screen(body, ip);
      const data = validated(contactSchema.safeParse(body));
      if (!accept) return json(RECEIVED, 200);
      await enforce('contact', ip);
      await callRpc('submit_contact_message', {
        p_name: data.name,
        p_email: data.email || null,
        p_phone: data.phone || null,
        p_subject: data.subject,
        p_message: data.message,
        p_client_submission_id: submissionId,
      });
      log('contact_message', {});
      return json(RECEIVED, 200);
    },

    async '/donation-report'(req, ip) {
      const { fields, file } = await readMultipart(req, MULTIPART_LIMIT);
      const { accept, submissionId } = await screen(fields, ip);
      const data = validated(donationReportSchema.safeParse(fields));
      const attachment = await readFile(file);
      if (!accept) return json(RECEIVED, 200);
      await enforce('donation', ip);
      const result = await callRpc<{ result: string; entry_id?: string }>('submit_donation_report', {
        p_amount: Number(data.amount),
        p_paid_on: data.paid_on,
        p_payment_method: data.payment_method,
        p_transaction_reference: data.transaction_reference,
        p_donor_name: data.is_anonymous ? null : data.donor_name || null,
        p_donor_phone: data.donor_phone || null,
        p_donor_email: data.donor_email || null,
        p_is_anonymous: data.is_anonymous,
        p_acknowledge_publicly: data.acknowledge_publicly,
        p_message: data.message || null,
        p_client_submission_id: submissionId,
      });
      if (result.result !== 'created' || !result.entry_id) {
        return json({ ok: true, result: result.result === 'replayed' ? 'created' : result.result }, 200);
      }
      let evidenceSaved = false;
      if (attachment) {
        const path = `entries/${result.entry_id}/${crypto.randomUUID()}.${extensionFor(attachment.mime)}`;
        const uploaded = await deps.upload('finance-evidence', path, attachment.bytes, attachment.mime);
        if (!uploaded.error) {
          const { error } = await deps.rpc('attach_donation_report_evidence', {
            p_entry_id: result.entry_id,
            p_storage_path: path,
            p_file_name: attachment.name,
            p_mime_type: attachment.mime,
            p_byte_size: attachment.bytes.length,
          });
          if (error) await deps.remove('finance-evidence', [path]);
          else evidenceSaved = true;
        }
      }
      log('donation_reported', { evidence: evidenceSaved });
      return json({ ok: true, result: 'created', evidence_saved: evidenceSaved }, 200);
    },
  };

  return async function handler(req: Request): Promise<Response> {
    const origin = req.headers.get('origin');
    const cors = corsHeaders(origin, deps.config.allowedOrigins);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const path = routePath(new URL(req.url), 'public-api');
    try {
      if (origin && !deps.config.allowedOrigins.includes(origin)) {
        throw new HttpError(403, 'origin_not_allowed', 'Requests from this website are not allowed.');
      }
      if (req.method === 'GET' && path === '/health') return json({ ok: true }, 200, cors);
      const route = routes[path];
      if (!route) throw new HttpError(404, 'not_found', 'Not found.');
      if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Method not allowed.');
      const response = await route(req, clientIp(req));
      for (const [k, v] of Object.entries(cors)) response.headers.set(k, v);
      return response;
    } catch (err) {
      if (err instanceof HttpError) {
        log('request_rejected', { route: path, code: err.code, status: err.status });
        return errorResponse(err, cors);
      }
      // Never log the error object itself: it may contain submitted data.
      log('request_failed', { route: path });
      return errorResponse(new HttpError(500, 'server_error', 'Something went wrong on our side. Please try again later.'), cors);
    }
  };
}
