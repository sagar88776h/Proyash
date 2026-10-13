# Testing summary

All results below are from real runs on 13 October 2026 against the code in
this repository. Nothing is reported as passing that was not run.

## How to run

```bash
npm run stack:start                 # local Supabase-compatible stack (see below)
npm run typecheck && npm run typecheck:functions && npm run lint
npm test                            # unit
npm run stack:reset                 # fresh database with all migrations
npm run test:db && npm run test:functions
npm run test:e2e                    # builds the site, serves it with the production CSP, runs Playwright
```

## Results

| Check | Result |
| --- | --- |
| TypeScript (`tsc -b`, strict) | Pass, 0 errors |
| Deno type-check of both Edge Functions | Pass |
| ESLint (incl. `jsx-a11y`, React Compiler rules) | Pass, 0 errors, 0 warnings |
| Production build (`npm run build`) | Pass |
| Unit tests (Vitest, jsdom) | **54 / 54 passed** (5 files) |
| Database tests (RLS, roles, workflows, finance, storage, MFA) | **75 + 1 passed** (6 files) |
| Edge Function end-to-end tests | **24 / 24 passed** (2 files) |
| Database + functions combined, on a freshly reset database | **100 / 100 passed** |
| Browser end-to-end tests (Playwright, Chromium) | **83 passed, 3 skipped by design, 0 failed** — see note |
| `npm audit --omit=dev` (production dependencies) | 0 vulnerabilities |

The three skipped browser tests are viewport-specific by design (desktop
navigation is not shown on phones/tablets; the mobile menu test does not apply
on desktop).

## What the tests cover

**Security and roles (database, through the real API with real sign-ins)**
- Every public table has RLS; the private schema is not exposed; anonymous
  visitors can call only the public aggregate functions; the in-database
  security assertion passes.
- First-administrator provisioning works once, only with the service role.
- Role changes only by administrators, audit-logged; no self-escalation; an
  administrator cannot remove their own role or deactivate themselves;
  deactivation removes access immediately; roles are never read from
  user-editable metadata.
- Direct database access attempts by every role against tables they must not
  read or write (requests, volunteers, ledger, audit, settings, storage).
- MFA: once a factor is enrolled, a password-only session gets no roles.

**Requests for help**: private submission with unique reference; idempotent
replays; duplicate open request refused without revealing the first; status
workflow enforced; status lookup needs reference and phone and never shows
notes; follow-up with attachments; notes cannot impersonate other authors; no
personal content in the audit log; redaction of closed requests only (and
deletion of their files); staff-entered requests.

**Volunteers and projects**: registration and duplicate handling; guardian
details for minors; contact details private to coordinators; only approved
volunteers can be assigned and linked volunteers see only their own work;
coordinators draft but only publishers publish; only verified outcomes of
published projects are public; photo consent and alt-text rules; settings
validation; content drafts and versions; rate limiting.

**Finance**: ledger hidden from non-finance roles; no direct writes; four-eyes
verification with receipt numbers; verified entries immutable (even for the
database owner); evidence required for expenses; rejection with reasons;
duplicate references refused and near-duplicates flagged; balances from
verified entries only; reversals; period-summary arithmetic; reconciliation
closing periods; transfers, refunds limited to the original donation,
allocations; donor self-reports that a screenshot alone can never verify;
public reports needing independent approval and exposing only aggregates;
financial audit trail readable by treasurers, append-only, without donor
contact details.

**Edge Functions**: CORS and origin checks; body size and format limits;
validation errors per field; honeypot and too-fast submissions; rate limits;
status lookup and follow-up uploads; volunteer, contact and donation reports;
no personal data in function logs; staff-api authentication; invitations with
a working link; password recovery without account enumeration; public sign-up
refused; deactivation ends sign-ins; photo publish/unpublish copying only
consented photos; redaction deleting files.

**Browser (Playwright)** — the site is built for production and served with
the Content-Security-Policy from `vercel.json`; any console error, uncaught
exception or CSP violation fails a test.
- All 12 public pages at **desktop (1440 px), tablet (820 px) and phone
  (Pixel 7, 412 px)**: one `h1`, footer, **axe WCAG 2.2 A/AA** with no serious or
  critical violations, no horizontal overflow, no control outside the viewport.
- Navigation, skip link, mobile menu (Escape closes it and returns focus), 404,
  reduced motion (no WebGL canvas, no hidden content), legal draft notices, no
  card/PIN/password fields on the donation page, `/admin` not indexed and
  behind sign-in.
- Forms on desktop and phone: request for help (error summary focus, reference
  number, nothing personal in the URL, “not guaranteed” wording, status lookup),
  volunteer registration, contact message, donation report (stays pending).
- Portal: every page opens for an administrator with axe checks; each of the
  five other roles sees its own areas and is refused elsewhere; deactivation;
  password recovery; invitation acceptance; content drafts stay private until
  published; payment-detail settings with confirmation and audit; four-eyes
  verification of a contribution and balance change; request review with the
  applicant seeing the new status but not the notes; TOTP enrolment; sign-out;
  photo upload → consent → publish (private original not public); coordinator
  draft → publisher publish; reconciliation locking back-dated entries; the
  portal at phone width.

## Bugs found by these tests and fixed

- Phone header: the two call-to-action buttons pushed the menu button off-screen,
  so phone visitors could not open the navigation.
- After a failed submit, focus jumped to the first text field (skipping radio
  groups) instead of the error summary.
- Cross-field validation (village or locality, guardian details, contact
  method) only appeared after every other error was fixed.
- Settings forms were duplicated after saving (React keys collided because the
  seeded settings share a timestamp).
- Dimmed table rows (rejected entries, deactivated users) failed colour
  contrast.
- Public forms disabled their button without explanation when the site has no
  database connection.
- Earlier phases: a Postgres regular-expression limit broke UPI validation;
  re-reversal after a rejected reversal was blocked; donor reports had no
  account to verify into; generated database types were mis-ordered.

## Manual smoke checks

- A build with **no backend configured** renders all public pages and the
  sign-in page without console errors; forms show “not connected” notices.
- The provisioning script on a fresh database: sends an invitation, grants the
  administrator role, refuses a second run without inviting anyone, and refuses
  keys passed as command-line arguments.
- Initial page weight: about **164 KB gzipped** (JS + CSS) for the home page;
  the 132 KB Three.js scene loads only on capable devices after first paint;
  fonts are self-hosted and subset.

## Test environment and limits

Docker is unavailable in the build environment, so the tests use a
Docker-free stack (`scripts/local-stack/`) made from official release
binaries: PostgreSQL 16, Supabase Auth (GoTrue v2.177.0), PostgREST v12.2.12,
Deno for the Edge Functions, a mail catcher, and a filesystem Storage emulator
that enforces the real `storage.objects` RLS policies by running each request
as the caller. What this does **not** prove, and should be checked on the real
Supabase project before launch:

- Supabase’s hosted Storage service and Edge runtime (behaviour should match,
  but they are different implementations from the local emulator/runner).
- Dashboard-only Auth settings, real SMTP delivery and email rendering.
- Cloudflare Turnstile verification against Cloudflare (optional feature; not
  exercised in automated tests).
- Browsers other than Chromium (WebKit/Firefox are not installed here) and
  real phones; screen readers were not used — accessibility is covered by axe
  and keyboard tests only.
- Visual review of the WebGL hero on real hardware and a Lighthouse audit.
