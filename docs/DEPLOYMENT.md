# Deploying the website (Vercel)

The website is a static single-page app built with Vite. It talks directly to
Supabase (database, sign-in, storage) and to two Supabase Edge Functions.
Vercel only hosts the built files and adds security headers.

Set up Supabase first: [SUPABASE_SETUP.md](SUPABASE_SETUP.md).

## 1. Import the repository

1. In Vercel, **Add New → Project** and import this repository.
2. Framework preset: **Vite** (also declared in `vercel.json`).
   - Build command: `npm run build` (type-checks, then builds)
   - Output directory: `dist`
   - Node.js version: 20.x or 22.x

## 2. Environment variables

Project → Settings → **Environment Variables** (Production, and Preview if used):

| Name | Value | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` | Public |
| `VITE_SUPABASE_ANON_KEY` | anon / publishable key | Public by design; RLS protects data |
| `VITE_SITE_URL` | `https://www.example.org` | Used in sign-in email links |
| `VITE_TURNSTILE_SITE_KEY` | Turnstile site key | Optional |

**Never add the service-role key, the database password or any secret to
Vercel.** Everything prefixed `VITE_` is compiled into public JavaScript. The
build aborts if it detects a service-role or `sb_secret_` key.

## 3. Domain

1. Add the organisation’s domain under Project → Settings → **Domains**.
2. Use the final address everywhere it is configured:
   - Supabase Auth **Site URL** and **Redirect URLs** (`…/admin/auth/confirm`)
   - Edge Function secrets `ALLOWED_ORIGINS` and `STAFF_SITE_URL`
   - `VITE_SITE_URL`
3. Redeploy after changing environment variables (they are read at build time).

## 4. What `vercel.json` does

- Serves `index.html` for every route that is not a built asset, so deep links
  such as `/our-work/some-project` work.
- Adds security headers to every response:
  - **Content-Security-Policy** — scripts only from this site (and Cloudflare
    Turnstile if enabled); network requests only to this site and
    `*.supabase.co`; no framing; no plugins.
  - **Strict-Transport-Security** (two years), `X-Content-Type-Options`,
    `X-Frame-Options: DENY`, `Referrer-Policy`, a restrictive
    `Permissions-Policy` and `Cross-Origin-Opener-Policy`.
- Marks `/admin` pages `noindex`, `no-store` and `no-referrer`.
- Caches hashed build assets for a year.

The end-to-end tests serve this exact policy (with the local API added) and
fail on any CSP violation, so a change that the policy would block is caught
before deployment. If you add a third-party service, update the policy in
`vercel.json` deliberately.

## 5. After the first deployment

1. Open the site and check every page loads (placeholders are expected until
   content is entered).
2. Provision the first administrator: [ADMIN_PROVISIONING.md](ADMIN_PROVISIONING.md).
3. Sign in at `/admin`, enable two-step verification, and complete the
   **Launch checklist** on the overview page.
4. Work through [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) before announcing the site.

## Updating

- Website: push to the production branch; Vercel builds and deploys.
- Database: add a new file to `supabase/migrations` (never edit an applied
  one), test it locally (`npm run stack:reset && npm run test:db`), then
  `supabase db push`.
- Edge Functions: `supabase functions deploy public-api --no-verify-jwt`
  (and/or `staff-api`).

## Hosting elsewhere

Any static host works if it can (1) serve `index.html` for unknown paths and
(2) send the headers listed in `vercel.json`. Do not deploy without the
Content-Security-Policy and HSTS headers.
