/**
 * Production dependencies for the edge functions, backed by supabase-js.
 * Runtime-neutral (no Deno globals) so tests can construct them in Node.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { DbError } from './http.ts';

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export function serviceClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, clientOptions);
}

/** A client that acts as the signed-in caller, so database permission checks apply to them. */
export function userClient(url: string, anonKey: string, jwt: string): SupabaseClient {
  return createClient(url, anonKey, {
    ...clientOptions,
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

export async function rpcCall<T>(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<{ data: T | null; error: DbError | null }> {
  // deno-lint-ignore no-explicit-any
  const { data, error } = await (client.rpc as any)(fn, args);
  return { data: (data ?? null) as T | null, error: error ? (error as DbError) : null };
}

export function storageDeps(client: SupabaseClient) {
  return {
    async upload(bucket: string, path: string, bytes: Uint8Array, contentType: string, upsert = false) {
      const { error } = await client.storage.from(bucket).upload(path, bytes, { contentType, upsert });
      return { error: error ? error.message : null };
    },
    async download(bucket: string, path: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
      const { data, error } = await client.storage.from(bucket).download(path);
      if (error || !data) return null;
      return { bytes: new Uint8Array(await data.arrayBuffer()), contentType: data.type };
    },
    async remove(bucket: string, paths: string[]) {
      if (paths.length) await client.storage.from(bucket).remove(paths);
    },
  };
}
