# PRAYASH — community welfare platform

**PRAYASH — A Group of Friends & Well-Wishers.**
*Together for Humanity. Together for a Better Tomorrow.*

The public website and secure administration portal for PRAYASH, which unites
compassionate people across nearby villages to support people in need and
strengthen the community.

- **Public website:** Home, About, Our Work (projects), Villages, Request Help
  (with private status lookup), Support Us (authorised payment details and
  donation reporting), Volunteer, Transparency & Financial Reports, Contact,
  Privacy and Terms.
- **Administration portal** (`/admin`, invitation only): requests for help,
  volunteers and assignments, villages, projects, outcomes and a consent-aware
  photo library, a transaction-based financial ledger with four-eyes
  verification, reconciliation, receipts and public reports, page content,
  settings, users and roles, and an append-only audit history.

> This is a real organisation. The site contains **no invented history,
> statistics, registration details or achievements**. Missing facts and photos
> are shown as clearly labelled placeholders until PRAYASH provides them.

## Technology

React 19 · Vite · TypeScript · Tailwind CSS 4 · TanStack Query · React Hook
Form + Zod · Framer Motion, GSAP and a small Three.js scene (all lazy-loaded,
with reduced-motion and no-WebGL fallbacks) · Supabase (Postgres with Row
Level Security, Auth with TOTP MFA, Storage, Edge Functions on Deno) · Vercel.

## Repository layout

```
src/
  components/          shared UI, layout, forms, motion and visuals
  content/registry.ts  editable page fields and truthful default text
  features/public/     public pages
  features/admin/      portal pages and data access (subject to RLS)
  features/auth/       sign-in, recovery, invitations, MFA, route guards
  lib/                 formatting, Supabase client, API helpers
supabase/
  migrations/          schema, RLS, functions, storage policies, security checks
  functions/           public-api and staff-api Edge Functions (+ shared validation)
  templates/           Auth email templates
  config.toml          reference Auth/API configuration
scripts/
  provision-admin.mjs  one-time, safe first-administrator setup
  local-stack/         Docker-free local Supabase-compatible stack for tests
  gen-db-types.mjs     generates src/types/database.ts
tests/
  db/                  RLS, roles, workflows and finance rules (real Postgres + Auth)
  functions/           Edge Function end-to-end tests
  e2e/                 Playwright browser tests (desktop, tablet, phone)
docs/                  setup, deployment, security, finance and content guides
```

## Local development

Requirements: Node.js 20.19+ and, for the backend, PostgreSQL 15–17 installed
locally (the local stack downloads Supabase Auth and PostgREST release
binaries; Deno comes from npm).

```bash
npm install
npm run stack:start            # local Postgres + Auth + PostgREST + Storage + functions + mail catcher
cp .env.example .env.local     # then set VITE_SUPABASE_URL=http://127.0.0.1:54321 and the printed anon key
npm run dev                    # http://127.0.0.1:5173
```

Without a backend configured, the public site still renders with its default
text and placeholders, and forms explain that they are not connected.

If you prefer the official Supabase CLI with Docker, `supabase start` uses the
same migrations and `supabase/config.toml`.

## Checks and tests

```bash
npm run typecheck              # TypeScript (app, tests, configs)
npm run typecheck:functions    # Deno type-check of the Edge Functions
npm run lint                   # ESLint incl. jsx-a11y and React Compiler rules
npm test                       # unit tests (Vitest + jsdom)
npm run test:db                # database security & workflow tests (needs the local stack)
npm run test:functions         # Edge Function tests (needs the local stack)
npm run test:e2e               # Playwright: builds the site and tests it against the local stack
npm run build                  # production build
```

Results of the last full run are in [docs/TESTING.md](docs/TESTING.md).

## Deployment

1. [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) — create and configure the Supabase project.
2. [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — deploy the website on Vercel.
3. [docs/ADMIN_PROVISIONING.md](docs/ADMIN_PROVISIONING.md) — create the first administrator safely.
4. [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md) — everything to confirm before launch.

## Further documentation

- [docs/SECURITY.md](docs/SECURITY.md) — access model, privacy and threat mitigations
- [docs/FINANCE.md](docs/FINANCE.md) — treasurer’s guide and the manual donation verification process
- [docs/CONTENT.md](docs/CONTENT.md) — publishing, photographs and consent
- [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) — colours, type, components, motion, accessibility
- [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) — architecture and decisions

## Secrets

Only public values (`VITE_*`) belong in the website build. The Supabase
service-role key, database password, SMTP credentials and Turnstile secret must
never be committed or added to Vercel; the build refuses to start if a
service-role key is supplied to the browser.
