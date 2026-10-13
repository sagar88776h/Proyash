# Launch checklist

Work through this list before announcing the website. Items marked **(external)**
need a decision, approval or action from PRAYASH or a third party — they cannot
be completed in code.

## 1. Decisions and approvals (external)

- [ ] **Who runs the site:** name the people who will hold the administrator,
      treasurer, assistance reviewer, coordinator and publisher roles. At least
      two people must handle finance.
- [ ] **Official details confirmed:** organisation name as it should appear,
      and — only if they exist — registration authority/number and year
      established. Leave them empty otherwise.
- [ ] **Authorised payment method:** confirm in writing which bank account
      and/or UPI ID belong to PRAYASH and may be published, and who may change
      them.
- [ ] **Legal review (external):** have the draft Privacy Policy and Terms of
      Use reviewed and adapted, including obligations under India’s Digital
      Personal Data Protection Act, 2023. Name a contact for privacy requests.
- [ ] **Donations law (external, ask an accountant):**
  - Foreign contributions require FCRA registration. Unless PRAYASH has it,
    add to the Support Us instructions that donations are accepted only from
    Indian citizens/residents in Indian rupees.
  - Do not describe donations as tax-deductible (80G) unless PRAYASH holds
    that registration; receipts make no such claim.
  - Check cash-handling limits and record-keeping requirements that apply.
- [ ] **Data retention:** decide how long closed requests for help, volunteer
      records and contact messages are kept, and who redacts them.
- [ ] **Assistance policy:** agree how requests are assessed and who decides,
      so reviewers apply the same standards.

## 2. Infrastructure

- [ ] Supabase project created in the chosen region and configured per
      [SUPABASE_SETUP.md](SUPABASE_SETUP.md) (sign-up off, redirect URLs,
      password rules, MFA, email templates).
- [ ] **Custom SMTP** configured with a sender on PRAYASH’s own domain, with
      SPF/DKIM set up so invitations and password resets are delivered.
- [ ] Migrations pushed; `select private.assert_security_invariants();` passes;
      Security Advisor clean.
- [ ] Edge Functions deployed with `ALLOWED_ORIGINS`, `STAFF_SITE_URL`,
      `RATE_LIMIT_SALT` (and Turnstile secret if used).
- [ ] Backups enabled (PITR if possible) and a restore tested once.
- [ ] Vercel project with the production domain, HTTPS, and only the public
      `VITE_` variables ([DEPLOYMENT.md](DEPLOYMENT.md)).
- [ ] Optional: Cloudflare Turnstile keys added if spam appears.

## 3. Accounts

- [ ] First administrator provisioned ([ADMIN_PROVISIONING.md](ADMIN_PROVISIONING.md)).
- [ ] Two-step verification turned on for every administrator and treasurer.
- [ ] Team invited with the minimum roles they need.
- [ ] Service-role key stored only in the password manager and Supabase.

## 4. Content (the portal’s Launch checklist tracks most of these)

- [ ] Contact details (Settings → Contact details).
- [ ] Payment details entered, double-checked by a second person, and
      donations switched on (Settings → Donation payment details).
- [ ] Financial accounts and opening balances recorded and verified.
- [ ] “Our story” and other page text written from confirmed facts.
- [ ] Reviewed Privacy Policy and Terms published, with the “Last updated” date.
- [ ] Villages PRAYASH actually serves added and published.
- [ ] At least one real project published, with verified outcomes only.
- [ ] **Authentic photographs** uploaded, with alt text and recorded consent
      for every identifiable person. Every remaining “To be provided by
      PRAYASH” placeholder reviewed: filled in, or consciously left.
- [ ] Social links added only for official accounts.

## 5. Final checks on the live site

Do **not** record test financial transactions in production — ledger entries
cannot be deleted. Test finance flows on a separate staging project.

- [ ] Every public page loads on a phone and a computer.
- [ ] Submit one real-looking request for help (marked as a test in the
      description), check the status page, then decline it with the note
      “test” and redact it.
- [ ] Send a contact message and close it.
- [ ] Password reset email arrives and works.
- [ ] Try one page with a screen reader (TalkBack on Android or NVDA on
      Windows) and with the keyboard only.
- [ ] Check the browser console on the live site for Content-Security-Policy
      errors.

## 6. After launch

- Verify ledger entries weekly; reconcile monthly; publish reports regularly
  ([FINANCE.md](FINANCE.md)).
- Review requests for help promptly and keep applicants informed through the
  status message.
- Review user accounts every few months; deactivate people who have left.
- Re-run `npm audit --omit=dev` and update dependencies periodically.
