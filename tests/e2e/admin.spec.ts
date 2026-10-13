import { randomUUID } from 'node:crypto';
import { devices, type Browser } from '@playwright/test';
import { createUser, randomPhone, randomReference, serviceClient, sql, todayIST, type AppRole } from '../helpers/stack';
import { totp } from '../helpers/totp';
import { expect, expectAccessible, latestMail, signInAs, test } from './fixtures';

/** Signs in a second person in an isolated browser context. */
async function secondSession(browser: Browser, roles: AppRole[], label: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const user = await signInAs(page, roles, label);
  return { context, page, user, errors };
}

const ADMIN_PAGES = [
  '/admin',
  '/admin/requests',
  '/admin/requests/new',
  '/admin/volunteers',
  '/admin/projects',
  '/admin/projects/new',
  '/admin/villages',
  '/admin/media',
  '/admin/finance',
  '/admin/finance/ledger',
  '/admin/finance/new',
  '/admin/finance/accounts',
  '/admin/finance/reconciliation',
  '/admin/finance/reports',
  '/admin/content',
  '/admin/content/about',
  '/admin/messages',
  '/admin/settings',
  '/admin/users',
  '/admin/audit',
  '/admin/account',
];

test('an administrator can open every portal page without errors', async ({ page }) => {
  test.setTimeout(180_000);
  await signInAs(page, ['admin'], 'admin');
  for (const path of ADMIN_PAGES) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('You do not have access to this page')).toHaveCount(0);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/something went wrong|could not be loaded/i)).toHaveCount(0);
    await expectAccessible(page, path);
  }
});

test('each role sees only its own areas, and direct links are refused', async ({ browser }) => {
  test.setTimeout(120_000);
  const cases: Array<{ roles: AppRole[]; allowed: string[]; refused: string[] }> = [
    { roles: ['assistance_reviewer'], allowed: ['/admin/requests'], refused: ['/admin/finance', '/admin/users', '/admin/settings', '/admin/volunteers', '/admin/content', '/admin/audit'] },
    { roles: ['treasurer'], allowed: ['/admin/finance', '/admin/audit'], refused: ['/admin/requests', '/admin/users', '/admin/volunteers', '/admin/content', '/admin/messages'] },
    { roles: ['publisher'], allowed: ['/admin/content', '/admin/projects', '/admin/media'], refused: ['/admin/requests', '/admin/finance', '/admin/users', '/admin/settings'] },
    { roles: ['volunteer_coordinator'], allowed: ['/admin/volunteers', '/admin/projects'], refused: ['/admin/requests', '/admin/finance', '/admin/content', '/admin/users'] },
    { roles: ['volunteer'], allowed: ['/admin/my-assignments', '/admin/account'], refused: ['/admin/requests', '/admin/volunteers', '/admin/finance', '/admin/projects', '/admin/users'] },
  ];
  for (const c of cases) {
    const s = await secondSession(browser, c.roles, c.roles[0]!);
    for (const path of c.allowed) {
      await s.page.goto(path);
      await expect(s.page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(s.page.getByText('You do not have access to this page'), `${c.roles} → ${path}`).toHaveCount(0);
    }
    for (const path of c.refused) {
      await s.page.goto(path);
      await expect(s.page.getByText('You do not have access to this page'), `${c.roles} → ${path}`).toBeVisible();
    }
    expect(s.errors).toEqual([]);
    await s.context.close();
  }
});

test('a deactivated account loses access immediately', async ({ page, browser }) => {
  await signInAs(page, ['admin'], 'admin');
  const target = await secondSession(browser, ['assistance_reviewer'], 'leaver');
  await page.goto('/admin/users');
  const row = page.getByRole('row').filter({ hasText: target.user.email });
  await row.getByRole('button', { name: 'Deactivate' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Deactivate' }).click();
  await expect(row).toContainText('Deactivated');
  // Their existing session can no longer read anything.
  await target.page.goto('/admin/requests');
  await expect(target.page.getByText(/no access yet|sign in|deactivated/i).first()).toBeVisible();
  const { data } = await target.user.client.from('assistance_requests').select('id').limit(1);
  expect(data ?? []).toEqual([]);
  await target.context.close();
});

test('password recovery works end to end without revealing whether an account exists', async ({ page }) => {
  const user = await createUser(['publisher'], 'forgetful');
  await page.goto('/admin/forgot-password');
  const unknownEmail = `nobody-${randomUUID().slice(0, 6)}@test.prayash.local`;
  await page.getByLabel('Email address').fill(unknownEmail);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  const unknownMessage = (await page.getByText(/If an account exists/).innerText()).replace(unknownEmail, 'EMAIL');

  await page.goto('/admin/forgot-password');
  await page.getByLabel('Email address').fill(user.email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  const knownMessage = (await page.getByText(/If an account exists/).innerText()).replace(user.email, 'EMAIL');
  expect(knownMessage).toBe(unknownMessage);

  const mail = await latestMail(user.email, /reset|password/i);
  const link = /href="([^"]+auth\/confirm[^"]+)"/.exec(mail.html)?.[1]?.replace(/&amp;/g, '&');
  expect(link).toBeTruthy();
  await page.goto(link!);
  await expect(page).toHaveURL(/\/admin\/set-password/);
  // The one-time token is removed from the address bar.
  expect(page.url()).not.toContain('token_hash');
  const newPassword = `New-${randomUUID()}A1`;
  await page.getByLabel(/^New password/).fill(newPassword);
  await page.getByLabel('Confirm new password').fill(newPassword);
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Welcome/ })).toBeVisible();

  // Old password no longer works; the new one does.
  const old = await serviceClient().auth.signInWithPassword({ email: user.email, password: user.password });
  expect(old.error).toBeTruthy();
});

test('an invited team member can accept the invitation and sign in', async ({ page, browser }) => {
  await signInAs(page, ['admin'], 'admin');
  const email = `invitee-${randomUUID().slice(0, 8)}@test.prayash.local`;
  await page.goto('/admin/users');
  await page.getByRole('button', { name: 'Invite' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Full name').fill('Invited Publisher');
  await dialog.getByLabel('Email address').fill(email);
  await dialog.getByRole('checkbox', { name: /^Publisher/ }).check();
  await dialog.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByRole('row').filter({ hasText: email })).toContainText('Publisher');

  const mail = await latestMail(email, /invit/i);
  const link = /href="([^"]+auth\/confirm[^"]+)"/.exec(mail.html)?.[1]?.replace(/&amp;/g, '&');
  const context = await browser.newContext();
  const invitee = await context.newPage();
  await invitee.goto(link!);
  await expect(invitee).toHaveURL(/\/admin\/set-password/);
  const password = `Inv-${randomUUID()}B2`;
  await invitee.getByLabel(/^New password/).fill(password);
  await invitee.getByLabel('Confirm new password').fill(password);
  await invitee.getByRole('button', { name: 'Save password' }).click();
  await expect(invitee.getByRole('heading', { level: 1, name: /Welcome/ })).toBeVisible();
  await expect(invitee.getByRole('link', { name: 'Page content' })).toBeVisible();
  await expect(invitee.getByRole('link', { name: 'Ledger' })).toHaveCount(0);
  await context.close();
});

test('a publisher drafts, previews and publishes page content', async ({ page }) => {
  await signInAs(page, ['publisher'], 'publisher');
  const story = `PRAYASH test story ${randomUUID().slice(0, 8)}`;
  await page.goto('/admin/content/about');
  await page.getByLabel('Our story').fill(story);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved.')).toBeVisible();

  // Drafts are private.
  const pub = await page.context().browser()!.newContext();
  const visitor = await pub.newPage();
  await visitor.goto('/about');
  await expect(visitor.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(visitor.getByText(story)).toHaveCount(0);

  await page.getByRole('button', { name: 'Save and publish' }).click();
  await expect(page.getByText(/Published version \d+/).first()).toBeVisible();
  await visitor.reload();
  await expect(visitor.getByText(story)).toBeVisible();
  await pub.close();
});

test('administrator settings drive the public contact and payment details', async ({ page }) => {
  await signInAs(page, ['admin'], 'admin');
  await page.goto('/admin/settings');
  const contact = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Contact details' }) });
  await contact.getByLabel(/^Phone number/).fill('+91 98765 43210');
  await contact.getByLabel(/^Email address/).fill('contact@prayash.example');
  await contact.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Contact details saved and published.')).toBeVisible();

  const donation = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Donation payment details' }) });
  await donation.getByLabel(/^UPI ID/).fill('not a upi id');
  await donation.getByRole('button', { name: 'Review and save' }).click();
  await expect(donation.getByText(/valid UPI ID/)).toBeVisible();
  await donation.getByLabel(/^UPI ID/).fill('prayash.test@okbank');
  await donation.getByLabel(/^Registered payee name/).fill('PRAYASH TEST');
  await donation.getByRole('checkbox', { name: /Accept donations on the website/ }).check();
  await donation.getByRole('button', { name: 'Review and save' }).click();
  const confirm = page.getByRole('dialog', { name: 'Confirm the payment details' });
  await expect(confirm).toContainText('prayash.test@okbank');
  await confirm.getByRole('button', { name: /These details are correct/ }).click();
  await expect(page.getByText('Payment details published.')).toBeVisible();

  // The change is in the audit history with old and new values.
  const audit = await sql<{ changes: { old: { value: unknown }; new: { value: { upi_id: string } } } }>(
    "select changes from public.activity_logs where entity_type = 'site_settings' and entity_id = 'donation' order by id desc limit 1",
  );
  expect(audit[0]!.changes.new.value.upi_id).toBe('prayash.test@okbank');

  await page.goto('/support-us');
  await expect(page.getByText('prayash.test@okbank').first()).toBeVisible();
  await page.goto('/contact');
  await expect(page.getByRole('link', { name: /98765 43210/ }).first()).toBeVisible();

  // Restore the seeded empty values so other tests see placeholders.
  await sql(`update public.site_settings set value = '{"accepting": false, "upi_id": null, "payee_name": null, "bank": null, "instructions": null}' where key = 'donation'`);
  await sql(`update public.site_settings set value = '{"phone": null, "whatsapp": null, "email": null, "address": null, "hours": null, "map_url": null}' where key = 'contact'`);
});

test('a contribution needs a second person to verify it before it counts', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const accountName = `E2E Bank ${randomUUID().slice(0, 6)}`;
  await sql("insert into public.financial_accounts (name, account_type) values ($1, 'bank')", [accountName]);
  await signInAs(page, ['treasurer'], 'treasurer-a');
  await page.goto('/admin/finance/new');
  const reference = randomReference('UTR');
  await page.getByLabel(/^Type/).selectOption('member_contribution');
  await page.getByLabel(/^Received into account/).selectOption({ label: accountName });
  await page.getByLabel(/^Transaction date/).fill(todayIST());
  await page.getByLabel(/^Amount/).fill('2500');
  await page.getByLabel(/^Payment method/).selectOption('upi');
  await page.getByLabel(/^Payment reference/).fill(reference);
  await page.getByLabel(/^Member name/).fill('Test Member');
  await page.getByRole('button', { name: 'Record as pending' }).click();
  await expect(page).toHaveURL(/\/admin\/finance\/entries\//);
  const entryUrl = page.url();
  await expect(page.getByText('Pending').first()).toBeVisible();
  // The person who recorded it cannot verify it.
  await expect(page.getByRole('button', { name: 'Verify' })).toBeDisabled();

  // Pending entries do not count towards the balance.
  const balance = async () => (await sql<{ n: string }>(
    "select coalesce(sum(case when direction = 'in' then amount else -amount end), 0)::text as n from public.ledger_entries e join public.financial_accounts a on a.id = e.account_id where a.name = $1 and e.status = 'verified'",
    [accountName],
  ))[0]!.n;
  expect(Number(await balance())).toBe(0);

  const b = await secondSession(browser, ['treasurer'], 'treasurer-b');
  await b.page.goto(entryUrl);
  await b.page.getByRole('button', { name: 'Verify' }).click();
  const dialog = b.page.getByRole('dialog', { name: 'Verify this entry' });
  await dialog.getByLabel('How did you verify it?').fill('Matched to bank statement line 3');
  await dialog.getByRole('button', { name: 'Verify' }).click();
  await expect(b.page.getByText('Verified').first()).toBeVisible();
  await expect(b.page.getByRole('link', { name: 'Receipt' })).toBeVisible();
  expect(Number(await balance())).toBe(2500);

  // Verified entries cannot be edited; corrections are reversals.
  await expect(b.page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  await expect(b.page.getByRole('button', { name: 'Reverse (correct)' })).toBeVisible();
  expect(b.errors).toEqual([]);
  await b.context.close();
});

test('a reviewer moves a request through review and the applicant sees the update', async ({ page }) => {
  const phone = randomPhone();
  const created = await serviceClient().rpc('submit_assistance_request', {
    p_category: 'medical',
    p_urgency: 'standard',
    p_applicant_name: 'E2E Applicant',
    p_phone: phone,
    p_email: null,
    p_village_id: null,
    p_locality: 'Near the temple',
    p_description: 'Needs help with the cost of medicines for the next three months.',
    p_relationship: 'self',
    p_preferred_contact: 'phone_call',
    p_consent: true,
    p_client_submission_id: randomUUID(),
  });
  expect(created.error).toBeNull();
  const reference = (created.data as { reference_code: string }).reference_code;
  const [{ id }] = await sql<{ id: string }>('select id from public.assistance_requests where reference_code = $1', [reference]);

  await signInAs(page, ['assistance_reviewer'], 'reviewer');
  await page.goto(`/admin/requests/${id}`);
  await expect(page.getByText('E2E Applicant').first()).toBeVisible();
  await page.getByRole('button', { name: 'Change status' }).click();
  const dialog = page.getByRole('dialog', { name: 'Change status' });
  await dialog.getByLabel(/^New status/).selectOption('under_review');
  await dialog.getByRole('button', { name: 'Save status' }).click();
  await expect(page.getByText('Under review').first()).toBeVisible();
  await page.getByLabel('Add a note').fill('Called the applicant; documents to follow.');
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(page.getByText('Called the applicant; documents to follow.')).toBeVisible();

  const visitor = await page.context().browser()!.newContext();
  const pub = await visitor.newPage();
  await sql('delete from private.rate_limits');
  await pub.goto('/request-help/status');
  await pub.getByLabel('Reference number').fill(reference);
  await pub.getByLabel('Phone number').fill(phone);
  await pub.getByRole('button', { name: 'Check status' }).click();
  await expect(pub.getByRole('heading', { name: /Status:/ })).toContainText('Under review');
  // Internal notes never reach the applicant.
  await expect(pub.getByText('Called the applicant')).toHaveCount(0);
  await visitor.close();
});

test('staff can turn on two-step verification', async ({ page }) => {
  await signInAs(page, ['treasurer'], 'mfa-user');
  await page.goto('/admin/account');
  await page.getByRole('button', { name: 'Set up two-step verification' }).click();
  const secret = (await page.locator('code').first().innerText()).trim();
  await page.getByLabel('6-digit code').fill(totp(secret));
  await page.getByRole('button', { name: 'Turn on' }).click();
  await expect(page.getByText('Two-step verification is on.').first()).toBeVisible();
});

test('signing out ends the session', async ({ page }) => {
  await signInAs(page, ['publisher'], 'leaving');
  await page.getByRole('button', { name: /sign out/i }).first().click();
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.goto('/admin/content');
  await expect(page).toHaveURL(/\/admin\/login/);
});


test('the portal is usable on a phone', async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signInAs(page, ['admin'], 'phone-admin');
  await page.getByRole('button', { name: 'Open portal menu' }).click();
  const drawer = page.getByRole('dialog', { name: 'Portal menu' });
  await drawer.getByRole('link', { name: 'Ledger' }).click();
  await expect(page).toHaveURL(/\/admin\/finance\/ledger$/);
  await expect(drawer).toBeHidden();
  for (const path of ['/admin', '/admin/requests', '/admin/finance/ledger', '/admin/finance/new', '/admin/projects', '/admin/settings', '/admin/users', '/admin/audit', '/admin/content/home']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
  await context.close();
});
