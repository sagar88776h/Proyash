# PRAYASH — Implementation Plan

_Status: living document. Updated as phases complete._

## 1. Inspection findings (2026-10-13)

| Item | Finding |
| --- | --- |
| Repository | `sagar88776h/Proyash` — **empty** (no commits, no files, no remote branches). Greenfield build; there is no existing functionality or user data to preserve. |
| Existing framework / routing / DB / auth | None. |
| Authentic PRAYASH photographs | None supplied. All image slots render a clearly labelled **placeholder** until an approved photograph is uploaded through the admin media library. |
| Official contact details, villages, history, registration status, payment details | None supplied. **Nothing is invented.** These are editable in the admin portal (Settings / Content / Villages) and render as labelled placeholders until configured. The admin overview shows a launch-readiness checklist of what is still missing. |

## 2. Architecture

```
Browser (React SPA, Vite, TypeScript, Tailwind v4)
  │  anon key only — never the service-role key
  ├── Supabase Auth (GoTrue)      staff sign-in, invites, password recovery
  ├── PostgREST (/rest/v1)        reads + staff writes, all guarded by RLS
  │      └── SECURITY DEFINER RPCs for workflows (status changes, ledger, roles)
  ├── Edge Functions (/functions/v1)
  │      ├── public-api   public forms: validation, honeypot, rate limits,
  │      │                optional Cloudflare Turnstile, reference numbers
  │      └── staff-api    invite/deactivate users, publish/unpublish media
  │                       (service role lives only here, as a secret)
  └── Storage
         ├── media-private      staff uploads awaiting consent review (private)
         ├── media-public       approved, consented images only (public CDN)
         ├── finance-evidence   receipts, bills, payment screenshots (private)
         ├── assistance-files   applicant follow-up documents (private)
         └── report-documents   redacted report PDFs, readable only once the
                                report is published (private bucket + RLS)
```

### Key design decisions

1. **Deny by default.** RLS is enabled on every table; tables without a policy for a role are inaccessible to it. Supabase's default grants are revoked from `anon` on private tables as defence in depth.
2. **Writes for sensitive workflows go through RPCs**, not direct table updates: assistance status transitions, the financial ledger, role management, report publication. Each RPC re-checks the caller's role server-side, validates input, and writes the audit log.
3. **Roles** are stored in `user_roles` (many-to-many). Deactivated profiles lose every permission immediately, even with an unexpired JWT. Nobody can grant themselves a role; the last active administrator cannot be removed.
4. **Financial ledger is append-only.** Verified entries are immutable (database trigger). Corrections are reversal entries plus an optional replacement entry, linked together. Balances and summaries are always computed from verified entries — there are no editable totals. Verification is a manual step by a treasurer/admin and, by default, must be done by someone other than the person who recorded the entry (four-eyes). A payment screenshot never verifies a donation.
5. **Periods close on reconciliation.** Once an account is reconciled with zero difference, entries on or before that statement date can no longer be added or verified for that account.
6. **Public data is opt-in.** Projects, villages, outcomes, photos, content and financial reports are only public once an authorised publisher (or treasurer + approver for finance) publishes them. Public financial figures come from the frozen snapshot of an approved report, never from live ledger queries.
7. **Privacy.** No personal data in URLs, analytics, logs or notifications. Status checks use POST with reference number + phone number. The audit log stores only *field names* for changes to personal records. Uploaded images are re-encoded client-side, which strips EXIF/GPS metadata. Fonts are self-hosted (no third-party font requests). Closed assistance requests can be redacted by an administrator.
8. **Content** has typed defaults in code (`src/content/defaults.ts`, documented in `docs/CONTENT.md`) and is overridden by published content edited in the admin portal (draft → publish, with version history).

## 3. Roles and least privilege (summary)

| Capability | admin | treasurer | assistance_reviewer | volunteer_coordinator | publisher | volunteer |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| Assistance requests (read/review/notes) | ✔ | – | ✔ | – | – | – |
| Volunteer registrations, assignments | ✔ | – | – | ✔ | – | own only |
| Villages, projects, outcomes, media publishing | ✔ | – | – | read | ✔ | assigned projects |
| Ledger: record / verify / reverse | ✔ | ✔ | – | – | – | – |
| Financial reports: prepare / approve & publish | ✔ | ✔ (not own draft) | – | – | – | – |
| Site content | ✔ | – | – | – | ✔ | – |
| Site settings incl. payment details | ✔ | – | – | – | – | – |
| Users & roles | ✔ | – | – | – | – | – |
| Audit history | ✔ | finance entries | – | – | – | – |

Full matrix: `docs/SECURITY.md`.

## 4. Phases

| Phase | Scope | Verification |
| --- | --- | --- |
| 1 | Plan, scaffold (Vite/React/TS/Tailwind v4), design tokens, UI primitives, tooling | typecheck, lint, build |
| 2 | Public website: 10 pages, responsive nav, footer, reveals/parallax, hero visual with WebGL + reduced-motion fallbacks | Playwright (desktop/tablet/mobile), axe |
| 3 | Schema & migrations, RLS, roles, audit, storage policies; Docker-free local Supabase stack for tests | SQL/RLS tests per role through PostgREST |
| 4 | Assistance + volunteer workflows (public-api edge function, admin review) | function + DB tests, e2e |
| 5 | Villages, projects, outcomes, media consent/publishing, volunteer assignment | DB + e2e |
| 6 | Ledger, verification, receipts, reconciliation, monthly/annual reports, public reports | ledger calculation tests |
| 7 | Admin overview, content publishing, settings, messages, users/roles, audit history | e2e per role |
| 8 | Full test pass, performance, docs, deployment guide | actual results in `docs/TESTING.md` |

The schema (phase 3) is built before the public site is wired to live data so that the frontend is typed against the real database. Phases are committed separately.

## 5. Testing environment note

Docker images cannot be pulled in the build environment (network policy), so `supabase start` is unavailable there. Tests run against a **Docker-free local stack** assembled from the official binaries — PostgreSQL 16, Supabase Auth (GoTrue) and PostgREST — behind a small gateway that mimics Supabase's URL layout (`scripts/local-stack/`). Supabase Storage's HTTP service is not part of that stack; storage *policies* are tested directly in SQL. Anything that could not be exercised is listed in `docs/TESTING.md`.

## 6. External approvals and inputs required before launch

See `docs/LAUNCH_CHECKLIST.md` (kept current). Headline items: official contact details, approved photographs with consent, villages served, organisation history and registration details (if any), authorised payment method details, legal review of the Privacy Policy and Terms, choice of hosting account and domain, SMTP provider for auth emails.
