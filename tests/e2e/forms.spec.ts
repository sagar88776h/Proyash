import { anonClient, randomPhone, randomReference, sql, todayIST } from '../helpers/stack';
import { expect, expectAccessible, test } from './fixtures';

// Public endpoints are rate limited per connection; every submission here comes
// from the same local address, so clear the counters before each test.
test.beforeEach(async () => {
  await sql('delete from private.rate_limits');
});

/** Public endpoints reject forms completed faster than a person could type them. */
async function humanPause(page: import('@playwright/test').Page) {
  await page.waitForTimeout(2700);
}

test('request for help: validation, submission, reference number and status lookup', async ({ page }) => {
  await page.goto('/request-help');
  const submit = page.getByRole('button', { name: 'Submit request' });

  // Empty submit: an error summary receives focus and links to the fields.
  await submit.click();
  const summary = page.getByRole('alert').filter({ hasText: 'Please correct the following' });
  await expect(summary).toBeFocused();
  await expect(summary.getByRole('link').first()).toBeVisible();
  await expectAccessible(page, '/request-help (errors)');

  const phone = randomPhone();
  await page.getByRole('radio', { name: /^Education/ }).check();
  await page.getByRole('radio', { name: /^Within the next few weeks/ }).check();
  await page.getByRole('radio', { name: /^Myself/ }).check();
  await page.getByLabel('Name of the person who needs help').fill('Test Applicant');
  await page.getByLabel('Phone number').fill(phone);
  await page.getByRole('radio', { name: /^Phone call/ }).check();
  await page.getByLabel('Village or locality, with a landmark').fill('Near the primary school');
  await page.getByLabel('What is happening and what help is needed?').fill('My daughter needs help with school fees and books for the coming term.');
  await page.getByRole('checkbox', { name: /I agree that PRAYASH may use these details/ }).check();
  await humanPause(page);
  await submit.click();

  const panel = page.getByRole('status').filter({ hasText: 'Your reference number' });
  await expect(panel).toBeVisible();
  const reference = (await panel.locator('p.font-display').innerText()).trim();
  expect(reference).toMatch(/^PRY-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  // Personal details never appear in the address bar.
  expect(page.url()).not.toContain(phone);
  expect(page.url()).not.toContain(reference);
  // The confirmation explains that help is not guaranteed and promises nothing.
  await expect(panel.getByText('does not guarantee that assistance can be provided')).toBeVisible();
  await expect(page.getByText(/will be approved|you will receive assistance/i)).toHaveCount(0);

  // The request is stored as pending and is not readable with the public key.
  const rows = await sql<{ status: string }>('select status from public.assistance_requests where reference_code = $1', [reference]);
  expect(rows).toEqual([{ status: 'pending' }]);
  const leaked = await anonClient().from('assistance_requests').select('id').eq('reference_code', reference);
  expect(leaked.data ?? []).toHaveLength(0);

  // Status lookup needs both the reference and the phone number.
  await page.goto('/request-help/status');
  await page.getByLabel('Reference number').fill(reference);
  await page.getByLabel('Phone number').fill(randomPhone());
  await page.getByRole('button', { name: /check status/i }).click();
  await expect(page.getByText(/could not find a request/i).first()).toBeVisible();
  await page.getByLabel('Phone number').fill(phone);
  await page.getByRole('button', { name: /check status/i }).click();
  await expect(page.getByRole('heading', { name: /Status:/ })).toContainText('Pending');
  expect(page.url()).not.toContain(phone);
});

test('volunteer registration is received and kept private', async ({ page }) => {
  await page.goto('/volunteer');
  const phone = randomPhone();
  await page.getByLabel('Full name').fill('Test Volunteer');
  await page.getByLabel(/^Phone number/).fill(phone);
  await page.getByLabel('Village or locality').fill('Main market');
  await page.getByRole('radio', { name: /^Yes/ }).first().check();
  await page.getByRole('group', { name: /Skills you can offer/ }).getByRole('checkbox').first().check();
  await page.getByRole('group', { name: /When are you available/ }).getByRole('checkbox').first().check();
  await page.getByRole('checkbox', { name: /volunteer coordinators may contact me/ }).check();
  await humanPause(page);
  await page.getByRole('button', { name: 'Register as a volunteer' }).click();
  await expect(page.getByRole('heading', { name: /thank you for volunteering/i })).toBeVisible();

  const rows = await sql<{ status: string; consent_public_recognition: boolean }>(
    'select status, consent_public_recognition from public.volunteers where phone like $1',
    [`%${phone}`],
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]!.status).toBe('pending');
  expect(rows[0]!.consent_public_recognition).toBe(false);
  const leaked = await anonClient().from('volunteers').select('id').limit(1);
  expect(leaked.data ?? []).toHaveLength(0);
});

test('contact message is delivered to administrators only', async ({ page }) => {
  await page.goto('/contact');
  const subject = `E2E message ${Date.now()}`;
  await page.getByLabel('Your name').fill('Test Sender');
  await page.getByLabel('Email address').fill('sender@example.org');
  await page.getByLabel('Subject').fill(subject);
  await page.getByLabel('Message').fill('Hello, I would like to know how to help in my village.');
  await humanPause(page);
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('heading', { name: 'Thank you for your message' })).toBeVisible();
  const rows = await sql('select status from public.contact_messages where subject = $1', [subject]);
  expect(rows).toEqual([{ status: 'new' }]);
});

test('donation report stays pending until a treasurer verifies it', async ({ page }) => {
  await page.goto('/support-us');
  const reference = randomReference('UTR');
  await page.getByLabel('Amount paid (₹)').fill('501');
  await page.getByLabel('Date of payment').fill(todayIST());
  await page.getByRole('radio', { name: /^UPI/ }).check();
  await page.getByLabel('UPI reference / UTR number').fill(reference);
  await page.getByLabel('Your name').fill('Test Donor');
  await page.getByLabel('Phone number').fill(randomPhone());
  await humanPause(page);
  await page.getByRole('button', { name: 'Send donation report' }).click();
  await expect(page.getByRole('heading', { name: 'Thank you for your support' })).toBeVisible();
  // Reporting a payment never verifies it.
  await expect(page.getByText(/verified/i).first()).toBeVisible();
  const rows = await sql<{ status: string; source: string }>(
    'select status, source from public.ledger_entries where transaction_reference = $1',
    [reference],
  );
  expect(rows).toEqual([{ status: 'pending', source: 'public_report' }]);
});
