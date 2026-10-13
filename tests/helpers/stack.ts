/**
 * Test helpers for the local Supabase-compatible stack
 * (start it with `npm run stack:start`).
 *
 * Users are created through the real Auth admin API and sign in with real
 * passwords, so every request below goes through GoTrue-issued JWTs,
 * PostgREST and Row Level Security exactly as in production.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js';
import pg from 'pg';

type StackState = { apiUrl: string; dbUrl: string; anonKey: string; serviceRoleKey: string };

function loadState(): StackState {
  const file = join(process.cwd(), '.local-stack', 'state.json');
  if (!existsSync(file)) {
    throw new Error('Local stack is not running. Start it with `npm run stack:start` before running these tests.');
  }
  return JSON.parse(readFileSync(file, 'utf8')) as StackState;
}

export const stack = loadState();

export type AppRole =
  | 'admin'
  | 'treasurer'
  | 'assistance_reviewer'
  | 'volunteer_coordinator'
  | 'publisher'
  | 'volunteer';

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export function anonClient(): SupabaseClient {
  return createClient(stack.apiUrl, stack.anonKey, clientOptions);
}

export function serviceClient(): SupabaseClient {
  return createClient(stack.apiUrl, stack.serviceRoleKey, clientOptions);
}

const pool = new pg.Pool({ connectionString: stack.dbUrl, max: 4 });

/** Runs SQL as the database owner (trusted test setup / assertions only). */
export async function sql<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

export async function closePool() {
  await pool.end();
}

export type TestUser = { id: string; email: string; password: string; client: SupabaseClient };

export function uniqueSuffix() {
  return randomUUID().slice(0, 8);
}

/** Creates an auth user, grants roles (as trusted setup) and signs them in. */
export async function createUser(roles: AppRole[], label = 'user'): Promise<TestUser> {
  const email = `${label}-${uniqueSuffix()}@test.prayash.local`;
  const password = `Pw-${randomUUID()}`;
  const admin = serviceClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Test ${label}` },
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  for (const role of roles) {
    await sql('insert into public.user_roles (user_id, role) values ($1, $2)', [data.user.id, role]);
  }
  const client = createClient(stack.apiUrl, stack.anonKey, clientOptions);
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`signIn failed: ${signIn.error.message}`);
  return { id: data.user.id, email, password, client };
}

/** Asserts a Supabase response failed, optionally with a specific hint/code. */
export function expectFailure(
  result: { error: PostgrestError | null } | { error: { message: string } | null },
  match?: { hint?: string; code?: string; message?: RegExp },
) {
  const error = result.error as (PostgrestError & { message: string }) | null;
  if (!error) throw new Error('Expected the request to fail, but it succeeded');
  if (match?.hint && error.hint !== match.hint) {
    throw new Error(`Expected hint "${match.hint}" but got "${error.hint}" (${error.message})`);
  }
  if (match?.code && error.code !== match.code) {
    throw new Error(`Expected code "${match.code}" but got "${error.code}" (${error.message})`);
  }
  if (match?.message && !match.message.test(error.message)) {
    throw new Error(`Expected message ${match.message} but got "${error.message}"`);
  }
  return error;
}

export function expectOk<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(`Expected success but got: ${result.error.message}`);
  return result.data;
}

export function randomPhone(): string {
  // Indian mobile format, random to avoid collisions between tests.
  return `9${Math.floor(100000000 + Math.random() * 899999999)}`;
}

export function randomReference(prefix = 'UTR'): string {
  return `${prefix}${Math.floor(Math.random() * 1e12)}`;
}

export function todayIST(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

export function daysAgo(n: number): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000 - n * 86400 * 1000).toISOString().slice(0, 10);
}
