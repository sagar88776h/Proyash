// staff-api handler with production dependencies. Secrets:
//   ALLOWED_ORIGINS   comma-separated site origins allowed to call this function
//   STAFF_SITE_URL    public site URL used in invitation links
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createStaffApi } from './app.ts';
import { rpcCall, serviceClient, storageDeps, userClient } from '../_shared/deps.ts';
import { listEnv, requireEnv } from '../_shared/env.ts';

const url = requireEnv('SUPABASE_URL');
const anonKey = requireEnv('SUPABASE_ANON_KEY');
const admin = serviceClient(url, requireEnv('SUPABASE_SERVICE_ROLE_KEY'));
const storage = storageDeps(admin);

export const handler = createStaffApi({
  async getUser(jwt) {
    const { data, error } = await admin.auth.getUser(jwt);
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  },
  userRpc: (jwt, fn, args) => rpcCall(userClient(url, anonKey, jwt), fn, args),
  async inviteUser(email, fullName, redirectTo) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName }, redirectTo });
    if (error || !data.user) return { error: error?.message ?? 'invite failed', status: error?.status };
    return { id: data.user.id };
  },
  async setBanned(userId, banned) {
    const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: banned ? '876000h' : 'none' });
    return { error: error ? error.message : null };
  },
  download: (bucket, path) => storage.download(bucket, path),
  upload: (bucket, path, bytes, contentType, upsert) => storage.upload(bucket, path, bytes, contentType, upsert),
  remove: (bucket, paths) => storage.remove(bucket, paths),
  config: { allowedOrigins: listEnv('ALLOWED_ORIGINS'), siteUrl: requireEnv('STAFF_SITE_URL').replace(/\/+$/, '') },
  log: (event, data) => console.log(JSON.stringify({ fn: 'staff-api', event, ...data })),
});
