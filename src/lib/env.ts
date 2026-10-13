/**
 * Runtime configuration read from Vite environment variables.
 * Only *public* values may appear here: the Supabase URL and the anon /
 * publishable key. Service-role or secret keys must never be given to the
 * browser; we refuse to start if one is detected.
 */

function readEnv(name: string): string | undefined {
  const value = (import.meta.env as Record<string, string | undefined>)[name];
  return value && value.trim() !== '' ? value.trim() : undefined;
}

function decodeJwtRole(token: string): string | undefined {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return undefined;
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as { role?: unknown };
    return typeof payload.role === 'string' ? payload.role : undefined;
  } catch {
    return undefined;
  }
}

/** Throws if a privileged key was configured for the browser. */
export function assertPublicKey(key: string): void {
  if (key.startsWith('sb_secret_') || decodeJwtRole(key) === 'service_role') {
    throw new Error(
      'A Supabase secret/service-role key was provided to the browser build. ' +
        'Use the anon (publishable) key in VITE_SUPABASE_ANON_KEY and keep the ' +
        'service-role key only in Edge Function secrets.',
    );
  }
}

const supabaseUrl = readEnv('VITE_SUPABASE_URL');
const supabaseAnonKey = readEnv('VITE_SUPABASE_ANON_KEY') ?? readEnv('VITE_SUPABASE_PUBLISHABLE_KEY');

if (supabaseAnonKey) assertPublicKey(supabaseAnonKey);

export const env = {
  supabaseUrl,
  supabaseAnonKey,
  /** Cloudflare Turnstile site key (optional). When set, public forms show the widget. */
  turnstileSiteKey: readEnv('VITE_TURNSTILE_SITE_KEY'),
  /** Public site origin used for auth redirect links. Defaults to the current origin. */
  siteUrl: readEnv('VITE_SITE_URL'),
} as const;

export const isBackendConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export function siteOrigin(): string {
  return env.siteUrl ?? window.location.origin;
}
