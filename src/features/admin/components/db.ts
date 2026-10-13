import { BackendNotConfiguredError } from '@/lib/supabase';
import { supabase, type TypedClient } from '@/lib/supabaseClient';

/** The Supabase client for the admin portal (signed-in user, subject to RLS). */
export function db(): TypedClient {
  if (!supabase) throw new BackendNotConfiguredError();
  return supabase;
}
