import { env } from './env';
import type { TypedClient } from './supabaseClient';

export type { TypedClient };

export class BackendNotConfiguredError extends Error {
  constructor() {
    super('The website is not connected to its database yet.');
    this.name = 'BackendNotConfiguredError';
  }
}

let clientPromise: Promise<TypedClient> | null = null;

/** Loads the Supabase client on demand (keeps it out of the initial bundle). */
export function getSupabase(): Promise<TypedClient> {
  clientPromise ??= import('./supabaseClient').then(({ supabase }) => {
    if (!supabase) throw new BackendNotConfiguredError();
    return supabase;
  });
  return clientPromise;
}

/** Public URL of an approved photo in the public media bucket. */
export function publicMediaUrl(path: string | null | undefined): string | null {
  if (!path || !env.supabaseUrl) return null;
  return `${env.supabaseUrl}/storage/v1/object/public/media-public/${path.split('/').map(encodeURIComponent).join('/')}`;
}
