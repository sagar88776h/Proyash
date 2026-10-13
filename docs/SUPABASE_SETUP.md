# Supabase setup

PRAYASH uses one Supabase project for its database (Postgres), sign-in
(Auth), file storage and two Edge Functions. Everything that protects data —
Row Level Security, role checks, the finance rules, the audit log — lives in
the SQL migrations in `supabase/migrations`, so a correctly migrated project is
secure by default. The steps below configure the parts that are not SQL.

> Do the steps in order. Do not invite anyone or publish the website until
> step 9 (“Verify”) passes.

## 1. Create the project

1. Create a new project at <https://supabase.com/dashboard>.
   - **Region:** choose the one closest to the people using the site
     (for India, *South Asia (Mumbai)*).
   - **Database password:** generate a long random password and store it in the
     organisation’s password manager. It is only needed for migrations.
2. Note the **Project URL**, the **anon / publishable key** and the
   **service-role / secret key** (Project Settings → API).
   - The anon key goes into the website build (it is public by design).
   - The service-role key must **never** go into the website, Vercel, a chat
     message or a repository. It is used only by Edge Functions (Supabase
     provides it to them automatically) and once by the provisioning script.

## 2. Apply the database migrations

Install the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), then from the repository root:

```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push
```

`db push` applies every file in `supabase/migrations` in order. The last
statement of the security migrations runs `private.assert_security_invariants()`,
which aborts the migration if any table lacks Row Level Security, if the
public role can reach a private table, or if a privileged function is
executable by the wrong role. A successful push therefore already means those
checks passed.

Re-run the check at any time in the SQL editor:

```sql
select private.assert_security_invariants();  -- returns nothing when all checks pass
```

## 3. API (Data API) settings

Project Settings → **Data API**:

| Setting | Value |
| --- | --- |
| Exposed schemas | `public` only. **Never expose `private`.** |
| Extra search path | `public, extensions` |
| Max rows | `1000` |

## 4. Authentication

Authentication → **Sign In / Providers**

- **Allow new users to sign up: off.** Staff accounts are created only by
  invitation from the portal. (Public visitors never need an account.)
- Anonymous sign-ins: off. Phone provider: off. No social providers are needed.
- Email provider: on, **Confirm email: on**, **Secure email change: on**,
  **Secure password change: on**.

Authentication → **URL Configuration**

- **Site URL:** the public address, e.g. `https://www.example.org`
- **Redirect URLs:** `https://www.example.org/admin/auth/confirm`
  (add the Vercel preview pattern only if you test sign-in on previews).

Authentication → **Policies / Passwords**

- Minimum length **10**, required characters **lowercase, uppercase and digits**.
- Leaked password protection: on (available on paid plans).

Authentication → **Multi-Factor** → **TOTP: enabled** (enroll and verify).
Once a person turns on two-step verification, the database ignores their
roles until they have completed the second step in that session.

Authentication → **Emails → SMTP Settings**

- Configure the organisation’s own SMTP service (for example the email
  provider PRAYASH already uses). Supabase’s built-in sender is only for
  testing and is heavily rate-limited, so invitations and password resets
  will not arrive reliably without this.
- Sender name `PRAYASH`, sender address on a domain the organisation controls.

Authentication → **Emails → Templates** — replace the default templates with
the files in `supabase/templates/`:

| Template | Subject | File |
| --- | --- | --- |
| Invite user | You have been invited to PRAYASH | `invite.html` |
| Reset password | Reset your PRAYASH password | `recovery.html` |
| Change email address | Confirm your new email address | `email_change.html` |

These templates link to `/admin/auth/confirm?token_hash=…`, which the portal
verifies and then removes from the address bar. Links expire after one hour
(**Email OTP expiration: 3600 seconds**).

Authentication → **Rate Limits:** keep the defaults or lower them; the
`supabase/config.toml` values (30 per hour for emails, sign-ins and
verifications) are a reasonable starting point.

## 5. Storage

The migrations create five buckets and all their access policies. Check
Storage in the dashboard shows:

| Bucket | Public | Holds |
| --- | --- | --- |
| `media-public` | **yes** | Copies of photos a publisher has published (EXIF stripped) |
| `media-private` | no | Uploaded photos awaiting review |
| `assistance-files` | no | Documents applicants attach to requests |
| `finance-evidence` | no | Bills, receipts, statements, donor screenshots |
| `report-documents` | no | Redacted documents attached to financial reports |

Do not change bucket privacy or add policies by hand. Only `media-public` is
public, and files reach it only through the `staff-api` publish step, which
the database refuses unless consent rules are met.

## 6. Edge Functions

```bash
supabase functions deploy public-api --no-verify-jwt
supabase functions deploy staff-api --no-verify-jwt
```

`--no-verify-jwt` is intentional: `public-api` serves anonymous forms (with
its own validation, spam checks and rate limits), and `staff-api` verifies
the caller’s session itself and asks the database to check their role before
doing anything.

Set the function secrets (values are examples):

```bash
supabase secrets set \
  ALLOWED_ORIGINS="https://www.example.org,https://example.org" \
  STAFF_SITE_URL="https://www.example.org" \
  RATE_LIMIT_SALT="$(openssl rand -hex 32)"

# Only if you enable Cloudflare Turnstile on the forms:
supabase secrets set TURNSTILE_SECRET_KEY="<turnstile secret>"
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are
injected automatically. Function logs record only event names and counts —
never form contents, names, phone numbers or emails.

## 7. Spam protection (optional but recommended)

All public forms already have a hidden honeypot field, a minimum fill time,
duplicate-submission protection and per-connection rate limits. To add a
visible challenge, create a Cloudflare Turnstile widget for the site’s domain,
put the **site key** in `VITE_TURNSTILE_SITE_KEY` (website build) and the
**secret key** in the `TURNSTILE_SECRET_KEY` function secret.

## 8. Backups

- Paid plans include daily backups; enable **Point-in-Time Recovery** if the
  budget allows, because the ledger and audit history are the organisation’s
  financial records.
- On the free plan, schedule a regular `supabase db dump` to storage the
  organisation controls, and test restoring it.

## 9. Verify

1. `select private.assert_security_invariants();` succeeds.
2. Dashboard → **Advisors → Security Advisor** shows no errors.
3. Visit the deployed site: public pages load, and `/admin` shows the sign-in page.
4. Provision the first administrator (see [ADMIN_PROVISIONING.md](ADMIN_PROVISIONING.md)),
   sign in, and complete the **Launch checklist** on the portal overview.

## Regenerating TypeScript types

After changing the schema, regenerate `src/types/database.ts`:

```bash
DATABASE_URL="postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres" npm run db:types
```

(or run it against the local stack, which is the default).
