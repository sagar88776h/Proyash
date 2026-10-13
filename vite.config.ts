import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

/**
 * For end-to-end tests, `vite preview` can serve the production security
 * headers from vercel.json so a too-strict Content-Security-Policy is caught
 * before deployment. Local-only adjustments: the local API origin is allowed
 * and upgrade-insecure-requests is dropped (the test server uses http).
 */
function productionHeadersForPreview(): Record<string, string> | undefined {
  const localApi = process.env.PREVIEW_PRODUCTION_HEADERS_API;
  if (!localApi) return undefined;
  const config = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as {
    headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
  };
  const global = config.headers.find((h) => h.source === '/(.*)')?.headers ?? [];
  const headers: Record<string, string> = {};
  for (const { key, value } of global) {
    if (key === 'Strict-Transport-Security') continue;
    headers[key] =
      key === 'Content-Security-Policy'
        ? value
            .replace(/; upgrade-insecure-requests/, '')
            .replace(/(connect-src [^;]*)/, `$1 ${localApi}`)
            .replace(/(img-src [^;]*)/, `$1 ${localApi}`)
        : value;
  }
  return headers;
}

/**
 * Refuse to build if a secret key was put in a browser variable. Everything
 * prefixed VITE_ is published in the JavaScript bundle, so a service-role or
 * secret key there would give anyone full database access.
 */
function refuseSecretKeysInBrowserEnv(mode: string) {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  for (const [name, value] of Object.entries(env)) {
    const key = value.trim();
    let role: string | undefined;
    const payload = key.split('.')[1];
    if (key.startsWith('eyJ') && payload) {
      try {
        role = (JSON.parse(Buffer.from(payload, 'base64url').toString()) as { role?: string }).role;
      } catch {
        role = undefined;
      }
    }
    if (key.startsWith('sb_secret_') || role === 'service_role') {
      throw new Error(
        `${name} contains a Supabase secret/service-role key. Browser variables are public. ` +
          'Use the anon (publishable) key instead, and rotate the secret key in Supabase if it was ever deployed.',
      );
    }
  }
}

export default defineConfig(({ mode }) => {
  refuseSecretKeysInBrowserEnv(mode);
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@shared': fileURLToPath(new URL('./supabase/functions/_shared', import.meta.url)),
      },
    },
    server: {
      port: 5173,
    },
    preview: {
      port: 4173,
      headers: productionHeadersForPreview(),
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      chunkSizeWarningLimit: 700,
    },
  };
});
