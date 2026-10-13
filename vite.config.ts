import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

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

export default defineConfig({
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
});
