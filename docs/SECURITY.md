# Security and privacy design

PRAYASH handles sensitive information: requests for help (health, money and
family circumstances), volunteers’ contact details (including minors and their
guardians), donor details and the organisation’s financial records. This
document explains how the system protects them and what remains the
organisation’s responsibility.

## Principles

1. **The database is the security boundary.** The website and portal hide
   things a person cannot do, but every permission is enforced again by
   PostgreSQL Row Level Security (RLS) and by checks inside database functions.
   Someone calling the API directly with a valid account gets exactly the same
   answers as the portal.
2. **Deny by default.** Default table privileges are revoked; every table has
   RLS enabled; access is granted per table, per column and per role.
   `private.assert_security_invariants()` runs at the end of the migrations and
   fails the deployment if any table lacks RLS, if the anonymous role can reach
   a private table, or if a privileged function is executable by the wrong role.
3. **Least privilege.** Six roles (administrator, treasurer, assistance
   reviewer, volunteer coordinator, publisher, volunteer), each limited to its
   own data. People can hold several roles. Roles are granted only by an
   administrator, through a function that also prevents removing the last
   administrator or one’s own administrator role.
4. **Secrets stay on the server.** The browser only ever has the public anon
   key. The service-role key is used only inside the `staff-api` Edge Function,
   after the database has confirmed the caller’s role, for the narrow tasks
   that need it (sending invitations, ending sessions, copying a published
   photo, deleting redacted files). The build refuses to start if a
   service-role key is supplied to the browser.

## Who can see what

| Data | Visible to |
| --- | --- |
| Requests for help, notes, attachments | Administrators and assistance reviewers |
| Applicant’s own request status | The applicant, with reference number **and** phone number |
| Volunteer registrations | Administrators and volunteer coordinators; each volunteer sees only their own record and assignments |
| Ledger, donations, expenses, evidence | Administrators and treasurers |
| Contact messages | Administrators |
| Audit history | Administrators (all); treasurers (financial records only) |
| Drafts (projects, villages, content, reports) | The roles that edit them |
| Published projects, villages, outcomes, photos, page content, reports | Everyone |

Public (anonymous) access is limited to published rows **and specific
columns** — for example the public cannot read who created a project, internal
notes, budgets, or any unpublished photo.

## Public forms

Request help, volunteer registration, contact, donation report and request
follow-up all go through the `public-api` Edge Function, never directly to
tables:

- **Validation** with the same schemas in the browser and the function, and
  again by database constraints and functions.
- **Spam and abuse protection:** hidden honeypot field, minimum time to
  complete the form, optional Cloudflare Turnstile, per-connection and
  per-phone-number rate limits (identifiers are salted and hashed before
  storage), and a global ceiling per form.
- **Duplicates:** each form submission carries a one-time ID, so a double
  click or retry is recorded once; a second open request of the same type from
  the same phone number within 90 days is not created (the applicant is told
  one exists, but not its reference, since someone else may know the number).
- **Status lookup** requires both the reference number and the phone number,
  returns the same “not found” answer for any mismatch, is rate limited per
  connection and per reference, and shows only the status and the message the
  reviewers chose to share — never internal notes.
- **Uploads** (follow-up documents, donation screenshots) are limited to 5 MB,
  checked by file signature (not by name or declared type), and stored in
  private buckets.
- Submitting a request never implies help will be granted, and reporting a
  donation never marks it as received: it stays *pending* until a treasurer
  verifies it against the bank record.

## Personal data handling

- **No personal data in URLs, logs or analytics.** Portal addresses use random
  IDs; the status page keeps the reference and phone in the form, not the
  address bar; Edge Function logs contain only event names and counts. The
  public site has no analytics or advertising trackers.
- **Audit history without copying personal data.** Changes to records that
  contain personal details are logged by *field name* only; finance and
  settings changes log old and new values. The audit log is append-only —
  even the service role cannot update or delete it.
- **Photos:** images are re-encoded in the browser before upload, which strips
  location (GPS) and other EXIF metadata. A photo becomes public only when a
  publisher publishes it, and the database refuses to publish a photo of
  identifiable people unless consent is recorded as obtained. Unpublishing
  deletes the public copy.
- **Volunteers** are never shown publicly unless they opted in; minors require
  a guardian’s details.
- **Redaction:** an administrator can permanently remove the personal details
  and attachments of a closed request while keeping anonymous statistics.
- Private files are shown through signed links that expire within 2–10 minutes.

## Finance controls

- The ledger is **append-only**. Entries start *pending*; a second person
  verifies them (four-eyes control, configurable in Settings). Verified entries
  cannot be edited or deleted — corrections are linked reversals.
- Balances and reports are always **calculated** from verified entries.
- Reconciled periods are closed to new entries.
- Public reports are frozen snapshots of aggregate totals, published by a
  second person (configurable); attached documents must be confirmed as
  redacted.
- The site never asks for or stores card numbers, UPI PINs, OTPs or banking
  passwords, and there is no payment gateway. Changes to the published payment
  details require an explicit confirmation step and are audit-logged with old
  and new values.

## Accounts and sessions

- Invitation-only accounts; public sign-up is disabled.
- Passwords: minimum 10 characters with upper and lower case letters and a
  number; with *secure password change* enabled, changing the password after
  a while signed in requires a code sent by email.
- Optional TOTP two-step verification. Once enabled, the database ignores the
  person’s roles in any session that has not completed the second step.
- Sign-in links use one-time token hashes and are removed from the address bar
  after use.
- The portal signs people out after 30 minutes of inactivity.
- Deactivating an account removes all access immediately (roles are honoured
  only for active profiles) and blocks its sessions from being renewed.

## Browser hardening

`vercel.json` sets a strict Content-Security-Policy (scripts only from the
site, network only to the site and Supabase, no framing), HSTS,
`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and a
restrictive `Permissions-Policy`. Admin pages are `noindex` and `no-store`.
Markdown content is rendered without raw HTML.

## Known limits and organisational responsibilities

- **IP-based rate limits** rely on the client address reported by the hosting
  platform. A determined attacker using many addresses can still submit spam
  up to the global ceiling; enable Turnstile if that happens.
- **Access tokens** already issued remain technically valid for up to an hour
  after deactivation, but the database ignores the roles of deactivated
  accounts, so they cannot read or change protected data.
- **Backups and retention:** decide how long closed requests and volunteer
  records are kept, redact them when no longer needed, and enable backups (see
  SUPABASE_SETUP.md).
- **Legal review:** the privacy policy and terms are drafts for PRAYASH to
  review (Digital Personal Data Protection Act, 2023, and any registration
  obligations).
- **People:** never share accounts, enable two-step verification for
  administrators and treasurers, and deactivate accounts when people leave.

## Reporting a vulnerability

Contact the organisation through the official email address on the Contact
page. Please do not test against real data or include personal information in
the report.
