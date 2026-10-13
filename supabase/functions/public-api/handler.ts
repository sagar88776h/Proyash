// public-api handler with production dependencies. Secrets (set with `supabase secrets set`):
//   ALLOWED_ORIGINS        comma-separated site origins, e.g. https://prayash.example
//   RATE_LIMIT_SALT        long random string used to hash IPs/phones for rate limits
//   TURNSTILE_SECRET_KEY   optional Cloudflare Turnstile secret
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createPublicApi } from './app.ts';
import { rpcCall, serviceClient, storageDeps } from '../_shared/deps.ts';
import { listEnv, optionalEnv, requireEnv } from '../_shared/env.ts';

const client = serviceClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));
const storage = storageDeps(client);

export const handler = createPublicApi({
  rpc: (fn, args) => rpcCall(client, fn, args),
  upload: (bucket, path, bytes, contentType) => storage.upload(bucket, path, bytes, contentType),
  remove: (bucket, paths) => storage.remove(bucket, paths),
  config: {
    allowedOrigins: listEnv('ALLOWED_ORIGINS'),
    rateLimitSalt: requireEnv('RATE_LIMIT_SALT'),
    rateLimitMultiplier: Number(optionalEnv('RATE_LIMIT_MULTIPLIER') ?? '1'),
    turnstileSecret: optionalEnv('TURNSTILE_SECRET_KEY'),
  },
  log: (event, data) => console.log(JSON.stringify({ fn: 'public-api', event, ...data })),
});
