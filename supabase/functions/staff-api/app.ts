/**
 * staff-api — privileged operations that need the service role.
 *
 *   POST /users/invite        { email, full_name, roles[] }          admin
 *   POST /users/set-active    { user_id, active }                    admin
 *   POST /media/publish       { media_id }                           publisher/admin
 *   POST /media/unpublish     { media_id, status }                   publisher/admin
 *   POST /assistance/redact   { request_id }                         admin
 *   GET  /health
 *
 * Every request must carry the caller's Supabase access token. The token is
 * verified with Supabase Auth, and every permission check is performed by the
 * database itself by calling RPCs *as the caller* — the service role is only
 * used afterwards for the narrow operation that requires it.
 */
import { z } from 'zod';
import {
  corsHeaders,
  dbErrorToHttp,
  errorResponse,
  HttpError,
  json,
  readJson,
  routePath,
  type DbError,
} from '../_shared/http.ts';
import { fieldErrors } from '../_shared/validation.ts';

export type RpcResult<T> = { data: T | null; error: DbError | null };

export type StaffApiDeps = {
  getUser(jwt: string): Promise<{ id: string; email: string | null } | null>;
  userRpc<T = unknown>(jwt: string, fn: string, args: Record<string, unknown>): Promise<RpcResult<T>>;
  inviteUser(
    email: string,
    fullName: string,
    redirectTo: string,
  ): Promise<{ id: string; error?: undefined } | { id?: undefined; error: string; status?: number }>;
  setBanned(userId: string, banned: boolean): Promise<{ error: string | null }>;
  download(bucket: string, path: string): Promise<{ bytes: Uint8Array; contentType: string } | null>;
  upload(bucket: string, path: string, bytes: Uint8Array, contentType: string, upsert: boolean): Promise<{ error: string | null }>;
  remove(bucket: string, paths: string[]): Promise<void>;
  config: { allowedOrigins: string[]; siteUrl: string };
  log?: (event: string, data: Record<string, string | number | boolean>) => void;
};

const APP_ROLES = ['admin', 'treasurer', 'assistance_reviewer', 'volunteer_coordinator', 'publisher', 'volunteer'] as const;

const inviteSchema = z.object({
  email: z.email('Enter a valid email address.').max(254).transform((v) => v.trim().toLowerCase()),
  full_name: z.string().trim().min(2, 'Enter the person\'s name.').max(120),
  roles: z.array(z.enum(APP_ROLES)).min(1, 'Choose at least one role.'),
});
const setActiveSchema = z.object({ user_id: z.uuid(), active: z.boolean() });
const mediaSchema = z.object({ media_id: z.uuid() });
const unpublishSchema = z.object({
  media_id: z.uuid(),
  status: z.enum(['archived', 'rejected', 'pending_review']).default('archived'),
});
const redactSchema = z.object({ request_id: z.uuid() });

const EXTENSIONS: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

export function createStaffApi(deps: StaffApiDeps): (req: Request) => Promise<Response> {
  const log = deps.log ?? (() => {});

  function parse<T>(schema: z.ZodType<T>, body: unknown): T {
    const result = schema.safeParse(body);
    if (!result.success) {
      throw new HttpError(422, 'validation_failed', 'Please check the highlighted fields.', fieldErrors(result.error));
    }
    return result.data;
  }

  async function asCaller<T>(jwt: string, fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await deps.userRpc<T>(jwt, fn, args);
    if (error) throw dbErrorToHttp(error);
    return data as T;
  }

  async function requireRoleViaDb(jwt: string, roles: string[]) {
    const mine = (await asCaller<string[]>(jwt, 'my_roles', {})) ?? [];
    if (!mine.some((r) => roles.includes(r))) {
      throw new HttpError(403, 'forbidden', 'You do not have permission to perform this action.');
    }
  }

  const routes: Record<string, (jwt: string, body: Record<string, unknown>, callerId: string) => Promise<Response>> = {
    async '/users/invite'(jwt, body, callerId) {
      const input = parse(inviteSchema, body);
      await requireRoleViaDb(jwt, ['admin']);
      const invited = await deps.inviteUser(input.email, input.full_name, `${deps.config.siteUrl}/admin/auth/confirm`);
      if (invited.error !== undefined) {
        if (invited.status === 422 || /already/i.test(invited.error)) {
          throw new HttpError(409, 'user_exists', 'An account with this email address already exists.');
        }
        throw new HttpError(502, 'invite_failed', 'The invitation email could not be sent. Check the email settings and try again.');
      }
      // Roles are granted by the database, which re-checks that the caller is an admin.
      const roles = await asCaller<string[]>(jwt, 'admin_set_user_roles', { p_user_id: invited.id, p_roles: input.roles });
      log('user_invited', { by: callerId, roles: input.roles.length });
      return json({ ok: true, user_id: invited.id, roles }, 200);
    },

    async '/users/set-active'(jwt, body, callerId) {
      const input = parse(setActiveSchema, body);
      await asCaller(jwt, 'admin_set_user_active', { p_user_id: input.user_id, p_active: input.active });
      const banned = await deps.setBanned(input.user_id, !input.active);
      log('user_active_changed', { by: callerId, active: input.active, session_revoked: !banned.error });
      return json({ ok: true, sessions_revoked: !banned.error }, 200);
    },

    async '/media/publish'(jwt, body, callerId) {
      const input = parse(mediaSchema, body);
      const prep = await asCaller<{ private_path: string; mime_type: string }>(jwt, 'media_prepare_publish', {
        p_media_id: input.media_id,
      });
      const file = await deps.download('media-private', prep.private_path);
      if (!file) throw new HttpError(404, 'file_missing', 'The original photo file could not be found.');
      const ext = EXTENSIONS[prep.mime_type] ?? 'webp';
      const publicPath = `media/${input.media_id}.${ext}`;
      const uploaded = await deps.upload('media-public', publicPath, file.bytes, prep.mime_type, true);
      if (uploaded.error) throw new HttpError(502, 'copy_failed', 'The photo could not be published. Please try again.');
      const { error } = await deps.userRpc(jwt, 'media_mark_published', {
        p_media_id: input.media_id,
        p_public_path: publicPath,
      });
      if (error) {
        await deps.remove('media-public', [publicPath]);
        throw dbErrorToHttp(error);
      }
      log('media_published', { by: callerId });
      return json({ ok: true, public_path: publicPath }, 200);
    },

    async '/media/unpublish'(jwt, body, callerId) {
      const input = parse(unpublishSchema, body);
      const publicPath = await asCaller<string>(jwt, 'media_prepare_unpublish', { p_media_id: input.media_id });
      // Remove the public copy first: privacy wins if anything fails afterwards.
      await deps.remove('media-public', [publicPath]);
      await asCaller(jwt, 'media_set_unpublished', { p_media_id: input.media_id, p_status: input.status });
      log('media_unpublished', { by: callerId });
      return json({ ok: true }, 200);
    },

    async '/assistance/redact'(jwt, body, callerId) {
      const input = parse(redactSchema, body);
      const paths = (await asCaller<string[]>(jwt, 'assistance_redact', { p_request_id: input.request_id })) ?? [];
      await deps.remove('assistance-files', paths);
      log('assistance_redacted', { by: callerId, files: paths.length });
      return json({ ok: true, files_removed: paths.length }, 200);
    },
  };

  return async function handler(req: Request): Promise<Response> {
    const origin = req.headers.get('origin');
    const cors = corsHeaders(origin, deps.config.allowedOrigins);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const path = routePath(new URL(req.url), 'staff-api');
    try {
      if (origin && !deps.config.allowedOrigins.includes(origin)) {
        throw new HttpError(403, 'origin_not_allowed', 'Requests from this website are not allowed.');
      }
      if (req.method === 'GET' && path === '/health') return json({ ok: true }, 200, cors);
      const route = routes[path];
      if (!route) throw new HttpError(404, 'not_found', 'Not found.');
      if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Method not allowed.');

      const auth = req.headers.get('authorization') ?? '';
      const jwt = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
      if (!jwt) throw new HttpError(401, 'not_authenticated', 'Sign in to continue.');
      const user = await deps.getUser(jwt);
      if (!user) throw new HttpError(401, 'not_authenticated', 'Your session has expired. Please sign in again.');

      const body = await readJson(req, 16 * 1024);
      const response = await route(jwt, body, user.id);
      for (const [k, v] of Object.entries(cors)) response.headers.set(k, v);
      return response;
    } catch (err) {
      if (err instanceof HttpError) {
        log('request_rejected', { route: path, code: err.code, status: err.status });
        return errorResponse(err, cors);
      }
      log('request_failed', { route: path });
      return errorResponse(new HttpError(500, 'server_error', 'Something went wrong. Please try again.'), cors);
    }
  };
}
