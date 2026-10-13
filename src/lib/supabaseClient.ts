import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { env, isBackendConfigured } from './env';

export type TypedClient = SupabaseClient<Database>;

/**
 * Browser Supabase client using the public anon key. Every request is subject
 * to Row Level Security; there is no privileged key in the frontend.
 * Import through getSupabase() on public pages so it stays off the critical path.
 */
export const supabase: TypedClient | null = isBackendConfigured
  ? createClient<Database>(env.supabaseUrl!, env.supabaseAnonKey!, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
