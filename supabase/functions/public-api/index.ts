// Supabase Edge Function entry point. See handler.ts for configuration.
import { handler } from './handler.ts';

Deno.serve(handler);
