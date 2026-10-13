// Docker-free local Supabase-compatible stack used for development and tests
// in environments where `supabase start` (Docker) is unavailable.
//
// Components: PostgreSQL (system install), Supabase Auth (GoTrue) and
// PostgREST (official release binaries), a small gateway that mimics the
// Supabase URL layout, an SMTP mail catcher, a filesystem-backed Storage API
// emulator that enforces storage.objects RLS, and Deno for Edge Functions.
//
// This is NOT a production setup. Values below are local development
// defaults only; never reuse the JWT secret anywhere else.
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const STACK_DIR = join(ROOT, '.local-stack');
export const BIN_DIR = join(STACK_DIR, 'bin');
export const LOG_DIR = join(STACK_DIR, 'logs');
export const PG_DATA = join(STACK_DIR, 'pgdata');
export const STORAGE_DIR = join(STACK_DIR, 'storage');
export const STATE_FILE = join(STACK_DIR, 'state.json');

function findPgBin() {
  if (process.env.PG_BIN) return process.env.PG_BIN;
  for (const v of ['17', '16', '15']) {
    const dir = `/usr/lib/postgresql/${v}/bin`;
    if (existsSync(join(dir, 'postgres'))) return dir;
  }
  return '';
}
export const PG_BIN = findPgBin();

export const VERSIONS = {
  postgrest: 'v12.2.12',
  auth: 'v2.177.0',
};

export const DOWNLOADS = {
  postgrest: `https://github.com/PostgREST/postgrest/releases/download/${VERSIONS.postgrest}/postgrest-${VERSIONS.postgrest}-linux-static-x86-64.tar.xz`,
  auth: `https://github.com/supabase/auth/releases/download/${VERSIONS.auth}/auth-${VERSIONS.auth}-x86.tar.gz`,
};

export const PORTS = {
  gateway: Number(process.env.STACK_GATEWAY_PORT ?? 54321),
  postgres: Number(process.env.STACK_PG_PORT ?? 54322),
  mailHttp: 54324,
  smtp: 54325,
  postgrest: 54331,
  auth: 54332,
  functions: { 'public-api': 54341, 'staff-api': 54342 },
};

// Supabase CLI's well-known local development secret.
export const JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';

export const SITE_URL = process.env.STACK_SITE_URL ?? 'http://127.0.0.1:4173';
export const API_URL = `http://127.0.0.1:${PORTS.gateway}`;
export const DB_URL = `postgresql://postgres:postgres@127.0.0.1:${PORTS.postgres}/postgres`;
export const RATE_LIMIT_SALT = 'local-development-rate-limit-salt';
