/** Abuse-protection helpers (runtime-neutral). */

const encoder = new TextEncoder();

/** Hex SHA-256 of `salt:value`, truncated. Used for rate-limit keys so raw IPs/phones are never stored. */
export async function hashKey(salt: string, value: string, length = 32): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${salt}:${value}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length);
}

/**
 * Best-effort client IP. CF-Connecting-IP is set by Cloudflare (which fronts
 * Supabase) and cannot be supplied by the client; X-Forwarded-For's first hop
 * can be spoofed, so it is only a fallback. Rate limits therefore also include
 * per-phone/per-reference and global ceilings, and Turnstile can be enabled.
 */
export function clientIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return 'unknown';
}

/** Minimum time a person plausibly needs to complete a form. */
export const MIN_FILL_MS = 2500;

export type SpamVerdict = 'ok' | 'honeypot' | 'too_fast';

export function spamVerdict(meta: { website?: string; started_at?: number }, now = Date.now()): SpamVerdict {
  if (meta.website && meta.website.trim() !== '') return 'honeypot';
  if (typeof meta.started_at === 'number' && now - meta.started_at < MIN_FILL_MS) return 'too_fast';
  return 'ok';
}

/** Verifies a Cloudflare Turnstile token. Returns true when no secret is configured. */
export async function verifyTurnstile(
  secret: string | undefined,
  token: string | undefined,
  ip: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!secret) return true;
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip !== 'unknown') body.set('remoteip', ip);
    const res = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(5000),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
