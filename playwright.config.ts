import { existsSync, readFileSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run a production build of the site against the local
 * Supabase-compatible stack (`npm run stack:start`). The build uses only the
 * public anon key; privileged test setup happens in Node via tests/helpers.
 */
const statePath = '.local-stack/state.json';
const state = existsSync(statePath) ? (JSON.parse(readFileSync(statePath, 'utf8')) as { apiUrl: string; anonKey: string }) : null;
const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 }, hasTouch: true }, testMatch: /public\.spec/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /(public|forms)\.spec/ },
  ],
  webServer: {
    command: `npx vite build --outDir dist-e2e --emptyOutDir && npx vite preview --outDir dist-e2e --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      VITE_SUPABASE_URL: state?.apiUrl ?? '',
      VITE_SUPABASE_ANON_KEY: state?.anonKey ?? '',
      VITE_SITE_URL: BASE_URL,
    },
  },
});
