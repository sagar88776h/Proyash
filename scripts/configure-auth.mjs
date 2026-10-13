#!/usr/bin/env node
// Applies PRAYASH's Supabase Auth settings and email templates to a hosted
// project through the Supabase Management API — no dashboard clicking needed.
//
//   SUPABASE_ACCESS_TOKEN=<personal access token>   (https://supabase.com/dashboard/account/tokens)
//   SUPABASE_PROJECT_REF=<project ref>              (the part before .supabase.co)
//   SITE_URL=https://<your site>
//   npm run configure-auth
//
// The access token is read from the environment only and never printed.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const token = process.env.SUPABASE_ACCESS_TOKEN ?? '';
const ref = (process.env.SUPABASE_PROJECT_REF ?? '').trim();
const siteUrl = (process.env.SITE_URL ?? '').trim().replace(/\/+$/, '');

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

if (!/^sbp_[A-Za-z0-9]{20,}$/.test(token)) {
  fail('Set SUPABASE_ACCESS_TOKEN to a personal access token (it starts with "sbp_"). Create one at https://supabase.com/dashboard/account/tokens.');
}
if (!/^[a-z0-9]{20}$/.test(ref)) fail('Set SUPABASE_PROJECT_REF to your project ID (the 20 letters before .supabase.co).');
if (!/^https:\/\/[^/\s]+$/.test(siteUrl)) fail('Set SITE_URL to the website address, e.g. https://prayash.vercel.app');

const template = (name) => readFileSync(join(root, 'supabase', 'templates', name), 'utf8');

async function patch(label, body) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.ok) {
    console.log(`✔ ${label}`);
    return true;
  }
  const text = await res.text().catch(() => '');
  const reason = res.status === 401 ? 'the access token was not accepted' : res.status === 404 ? 'project not found for this token' : text.slice(0, 300);
  console.error(`✖ ${label}: ${reason}`);
  return false;
}

// Applied in small groups so one unsupported option cannot block the rest.
const results = [
  await patch('Sign-in links point to the website', {
    site_url: siteUrl,
    uri_allow_list: `${siteUrl}/admin/auth/confirm`,
  }),
  await patch('Public sign-up turned off (invitation only)', { disable_signup: true }),
  await patch('PRAYASH email templates installed', {
    mailer_subjects_invite: 'You have been invited to PRAYASH',
    mailer_templates_invite_content: template('invite.html'),
    mailer_subjects_recovery: 'Reset your PRAYASH password',
    mailer_templates_recovery_content: template('recovery.html'),
    mailer_subjects_email_change: 'Confirm your new email address',
    mailer_templates_email_change_content: template('email_change.html'),
  }),
  await patch('Email links expire after one hour', { mailer_otp_exp: 3600 }),
  await patch('Two-step verification (authenticator app) enabled', {
    mfa_totp_enroll_enabled: true,
    mfa_totp_verify_enabled: true,
  }),
  await patch('Password rules: at least 10 characters', { password_min_length: 10 }),
  await patch('Password rules: upper and lower case letters and a number', {
    password_required_characters: 'abcdefghijklmnopqrstuvwxyz:ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789',
  }),
];

const failed = results.filter((ok) => !ok).length;
console.log(
  failed
    ? `\n${failed} setting(s) could not be applied — set them in the dashboard (see docs/SUPABASE_SETUP.md).\n`
    : '\nAll settings applied. Remove the token from this window: Remove-Item Env:SUPABASE_ACCESS_TOKEN\n',
);
process.exit(failed ? 1 : 0);
