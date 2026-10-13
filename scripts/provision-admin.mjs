#!/usr/bin/env node
// Provision the FIRST PRAYASH administrator — safely.
//
//   SUPABASE_URL=https://<project>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role key> \
//   SITE_URL=https://<your site> \
//   npm run provision-admin -- --email admin@example.org --name "Full Name"
//
// What it does:
//   1. Refuses to continue if an active administrator already exists
//      (public.bootstrap_first_admin enforces this again in the database).
//   2. Sends a Supabase Auth invitation email. No password is created or
//      printed here: the person chooses their own password from the link.
//   3. Grants the administrator role to that account.
//
// The service-role key is read from the environment only (never from a
// command-line argument, which would end up in shell history) and is never
// printed. Run this from a trusted machine, then remove the key from your
// shell environment. After the first administrator exists, manage every other
// account from the portal (Administration → Users & roles).
import { createClient } from '@supabase/supabase-js';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const siteUrl = (process.env.SITE_URL ?? '').replace(/\/+$/, '');
const email = (arg('email') ?? '').trim().toLowerCase();
const name = (arg('name') ?? '').trim();

if (process.argv.some((a) => /service[_-]?role|sb_secret_/i.test(a))) {
  fail('Do not pass keys as arguments. Set SUPABASE_SERVICE_ROLE_KEY in the environment instead.');
}
if (!url || !key) fail('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.');
// Catch the common mistakes before contacting Supabase (without printing the key).
function jwtRole(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).role;
  } catch {
    return undefined;
  }
}
const keyLooksSecret = key.startsWith('sb_secret_') || (key.startsWith('eyJ') && jwtRole(key) === 'service_role');
if (!keyLooksSecret) {
  if (key.startsWith('sb_publishable_') || jwtRole(key) === 'anon') {
    fail('That is the public anon/publishable key. Use the service_role key (Project Settings → API Keys → Legacy API keys → service_role) or a secret key starting with sb_secret_.');
  }
  fail('SUPABASE_SERVICE_ROLE_KEY does not look like a Supabase key. Paste the real service_role key (it starts with "eyJ") or secret key (starts with "sb_secret_") — not placeholder text.');
}
if (!siteUrl.startsWith('https://') && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(siteUrl)) {
  fail('Set SITE_URL to the public https:// address of the website (used for the invitation link).');
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Pass the administrator’s email address with --email.');
if (name.length < 2) fail('Pass the administrator’s full name with --name "Full Name".');

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// 1. Pre-check without side effects: with an unknown address the function
//    reports "admin_exists" if an administrator exists, otherwise "not_found".
const probe = await supabase.rpc('bootstrap_first_admin', { p_email: `probe-${Date.now()}@invalid.invalid` });
if (probe.error?.hint === 'admin_exists') {
  fail('An administrator already exists. Sign in to the portal and invite people from Users & roles.');
}
if (probe.error && probe.error.hint !== 'not_found') {
  fail(`Could not check existing administrators: ${probe.error.message}`);
}

// 2. Invite (the person sets their own password from the email link).
const invite = await supabase.auth.admin.inviteUserByEmail(email, {
  data: { full_name: name },
  redirectTo: `${siteUrl}/admin/auth/confirm`,
});
let invited = true;
if (invite.error) {
  if (invite.error.status === 422 || /already/i.test(invite.error.message)) {
    invited = false;
    console.log('ℹ An account with this email already exists; granting the role to it.');
  } else {
    fail(`The invitation could not be sent: ${invite.error.message}. Check the project’s SMTP settings.`);
  }
}

// 3. Grant the administrator role (refused by the database if one now exists).
const granted = await supabase.rpc('bootstrap_first_admin', { p_email: email });
if (granted.error) fail(`The administrator role could not be granted: ${granted.error.message}`);

console.log(`
✔ ${email} is the first PRAYASH administrator.

Next steps
  1. ${invited ? 'Open the invitation email and choose a password' : 'Use “Forgot your password?” on the sign-in page if you do not know the password'} (${siteUrl}/admin/login).
  2. In the portal, open “Your account” and turn on two-step verification.
  3. Invite at least one more administrator or treasurer, so financial entries
     can be verified by a second person.
  4. Remove SUPABASE_SERVICE_ROLE_KEY from this shell (e.g. \`unset SUPABASE_SERVICE_ROLE_KEY\`).
`);
