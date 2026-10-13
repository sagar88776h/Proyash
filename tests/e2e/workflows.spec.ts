import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { sql, todayIST } from '../helpers/stack';
import { expect, signInAs, test } from './fixtures';

// A valid 1×1 PNG; the portal decodes and re-encodes it before upload.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');

test('a photo of identifiable people is published only after consent is recorded', async ({ page, request }) => {
  const user = await signInAs(page, ['publisher'], 'photo-publisher');
  await page.goto('/admin/media');
  await page.locator('input[type="file"]').setInputFiles({ name: 'activity.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByText('1 photo uploaded for review.')).toBeVisible();

  const [uploaded] = await sql<{ id: string; status: string; private_path: string; mime_type: string }>(
    'select id, status, private_path, mime_type from public.media_assets where uploaded_by = $1',
    [user.id],
  );
  expect(uploaded!.status).toBe('pending_review');
  // Re-encoded in the browser (strips metadata) before it was stored privately.
  expect(uploaded!.mime_type).toMatch(/image\/(webp|jpeg)/);

  await page.getByRole('button').filter({ hasText: 'No description yet' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Photo details' });
  await dialog.getByLabel(/^Description for screen readers/).fill('Volunteers sorting school kits');
  await dialog.getByRole('radio', { name: 'Yes' }).check();
  await dialog.getByLabel(/^Consent/).selectOption('pending');
  await expect(dialog.getByRole('button', { name: 'Save and publish' })).toBeDisabled();
  await dialog.getByLabel(/^Consent/).selectOption('obtained');
  await dialog.getByLabel(/^Where is the consent record kept/).fill('Signed form in the office file, Oct 2026');
  await dialog.getByRole('button', { name: 'Save and publish' }).click();
  await expect(page.getByText('Photo published.')).toBeVisible();

  const [published] = await sql<{ status: string; public_path: string }>('select status, public_path from public.media_assets where id = $1', [uploaded!.id]);
  expect(published!.status).toBe('published');
  const stack = JSON.parse(readFileSync('.local-stack/state.json', 'utf8')) as { apiUrl: string };
  const publicFile = await request.get(`${stack.apiUrl}/storage/v1/object/public/media-public/${published!.public_path}`);
  expect(publicFile.status()).toBe(200);
  // The private original is never publicly reachable.
  const privateFile = await request.get(`${stack.apiUrl}/storage/v1/object/public/media-private/${uploaded!.private_path}`);
  expect(privateFile.status()).not.toBe(200);
});

test('a coordinator drafts a project and only a publisher can make it public', async ({ page, browser }) => {
  const title = `School kit drive ${randomUUID().slice(0, 6)}`;
  await signInAs(page, ['volunteer_coordinator'], 'coordinator');
  await page.goto('/admin/projects/new');
  await page.getByLabel(/^Title/).fill(title);
  await page.getByLabel(/^Activity/).selectOption('education');
  await page.getByLabel(/^Summary/).fill('Collecting and distributing school kits before the new term.');
  await expect(page.getByText('Only authorised publishers can publish projects.')).toBeVisible();
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/admin\/projects\/[0-9a-f-]{36}$/);
  const projectUrl = page.url();
  const slug = (await sql<{ slug: string }>('select slug from public.projects where title = $1', [title]))[0]!.slug;

  const visitor = await browser.newContext();
  const pub = await visitor.newPage();
  await pub.goto(`/our-work/${slug}`);
  await expect(pub.getByRole('heading', { level: 1, name: title })).toHaveCount(0);

  const publisher = await browser.newContext();
  const p2 = await publisher.newPage();
  await signInAs(p2, ['publisher'], 'publisher');
  await p2.goto(projectUrl);
  await p2.getByRole('checkbox', { name: /Published on the website/ }).check();
  await p2.getByRole('button', { name: 'Save changes' }).click();
  await expect(p2.getByText(/saved|updated/i).first()).toBeVisible();

  await pub.goto(`/our-work/${slug}`);
  await expect(pub.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await visitor.close();
  await publisher.close();
});

test('reconciling an account closes the period to back-dated entries', async ({ page }) => {
  const accountName = `E2E Cash ${randomUUID().slice(0, 6)}`;
  await sql("insert into public.financial_accounts (name, account_type) values ($1, 'cash')", [accountName]);
  await signInAs(page, ['treasurer'], 'reconciler');
  await page.goto('/admin/finance/reconciliation');
  await page.getByLabel(/^Account/).selectOption({ label: accountName });
  await page.getByLabel(/^Statement date/).fill(todayIST());
  await page.getByLabel(/^Closing balance on the statement/).fill('0');
  await page.getByRole('button', { name: 'Reconcile' }).click();
  await expect(page.getByText('Balanced. The period is now locked.')).toBeVisible();

  await page.goto('/admin/finance/new');
  await page.getByLabel(/^Received into account/).selectOption({ label: accountName });
  await page.getByLabel(/^Transaction date/).fill(todayIST());
  await page.getByLabel(/^Amount/).fill('100');
  await page.getByLabel(/^Member name/).fill('Late Entry');
  await page.getByRole('button', { name: 'Record as pending' }).click();
  await expect(page.getByText(/is reconciled up to/)).toBeVisible();
});
