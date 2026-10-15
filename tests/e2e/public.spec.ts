import { sql } from '../helpers/stack';
import { expect, expectAccessible, test } from './fixtures';

// Published data so data-driven sections (villages, projects) actually render.
test.beforeAll(async () => {
  await sql(
    "insert into public.villages (slug, name, summary, is_published) values ('e2e-seed-village', 'Seed Village', 'Seeded for end-to-end tests.', true) on conflict (slug) do nothing",
  );
  await sql(
    `insert into public.projects (slug, title, summary, category, status, village_id, is_published)
     select 'e2e-seed-project', 'Seed Project', 'Seeded for end-to-end tests.', 'education', 'ongoing', id, true
     from public.villages where slug = 'e2e-seed-village'
     on conflict (slug) do nothing`,
  );
});

const PAGES = [
  { path: '/', name: 'Home' },
  { path: '/about', name: 'About' },
  { path: '/our-work', name: 'Our Work' },
  { path: '/villages', name: 'Villages' },
  { path: '/villages/e2e-seed-village', name: 'Village detail' },
  { path: '/our-work/e2e-seed-project', name: 'Project detail' },
  { path: '/request-help', name: 'Request Help' },
  { path: '/request-help/status', name: 'Check a request' },
  { path: '/support-us', name: 'Support Us' },
  { path: '/volunteer', name: 'Volunteer' },
  { path: '/transparency', name: 'Transparency' },
  { path: '/contact', name: 'Contact' },
  { path: '/privacy', name: 'Privacy' },
  { path: '/terms', name: 'Terms' },
];

for (const p of PAGES) {
  test(`${p.name} page renders accessibly`, async ({ page }) => {
    await page.goto(p.path);
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toHaveCount(1);
    await expect(h1).not.toBeEmpty();
    await expect(page.getByRole('contentinfo')).toBeVisible();
    // Let data-driven sections settle before auditing.
    await page.waitForLoadState('networkidle');
    // No section may fail to load for visitors.
    await expect(page.getByText(/something went wrong|could not load|do not have permission/i)).toHaveCount(0);
    await expectAccessible(page, p.path);
    // No horizontal scrolling at any viewport.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'horizontal overflow (px)').toBeLessThanOrEqual(1);
    // Fixed-position elements do not create scroll overflow, so also check that
    // every visible link and button sits inside the viewport.
    const offscreen = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('a, button'))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          if (r.width < 2 || r.height < 2 || style.visibility === 'hidden') return false;
          if (el.closest('dialog:not([open])')) return false;
          return r.left < -1 || r.right > document.documentElement.clientWidth + 1;
        })
        .map((el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40))
        // The skip link is parked off-screen until focused.
        .filter((label) => !/skip to main content/i.test(label)),
    );
    expect(offscreen, 'controls outside the viewport').toEqual([]);
  });
}

test('unknown pages show a helpful 404', async ({ page }) => {
  await page.goto('/this-page-does-not-exist');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/not found|couldn’t find|could not find/i);
  await expect(page.getByRole('link', { name: /home/i }).first()).toBeVisible();
});

test('skip link moves focus to the main content', async ({ page }) => {
  await page.goto('/about');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: /skip to (main )?content/i });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await skip.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
});

test('main navigation reaches every primary page', async ({ page, isMobile }) => {
  const viewport = page.viewportSize();
  test.skip(isMobile || (viewport?.width ?? 0) < 1280, 'Desktop navigation only');
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  for (const [label, path] of [
    ['About', '/about'],
    ['Our Work', '/our-work'],
    ['Villages', '/villages'],
    ['Volunteer', '/volunteer'],
    ['Transparency', '/transparency'],
    ['Contact', '/contact'],
  ] as const) {
    await nav.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
});

test('mobile menu opens, closes with Escape, returns focus and navigates', async ({ page }) => {
  const viewport = page.viewportSize();
  test.skip((viewport?.width ?? 0) >= 1280, 'Menu button is shown below the desktop breakpoint');
  await page.goto('/');
  const open = page.getByRole('button', { name: 'Open menu' });
  await open.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();
  await open.click();
  await dialog.getByRole('link', { name: 'Transparency', exact: true }).click();
  await expect(page).toHaveURL(/\/transparency$/);
  await expect(dialog).toBeHidden();
});

test('home page offers the two primary actions', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /request help/i }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /support us/i }).first()).toBeVisible();
});

test('home page works with reduced motion and no WebGL canvas', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('canvas')).toHaveCount(0);
  // Content revealed on scroll must already be visible.
  const hidden = await page.evaluate(() =>
    Array.from(document.querySelectorAll('main *')).filter((el) => {
      const s = getComputedStyle(el);
      return el.textContent?.trim() && s.opacity === '0';
    }).length,
  );
  expect(hidden).toBe(0);
  expect(errors).toEqual([]);
  await context.close();
});

test('legal pages flag draft text until it is reviewed', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // Either a published (reviewed) version or a visible draft notice — never unmarked defaults.
  const notice = page.getByText(/draft/i).first();
  const published = page.getByText(/last updated/i).first();
  await expect(notice.or(published)).toBeVisible();
});

test('donation page never asks for card or banking credentials', async ({ page }) => {
  await page.goto('/support-us');
  await page.waitForLoadState('networkidle');
  const inputs = page.locator('input, textarea');
  const count = await inputs.count();
  for (let i = 0; i < count; i++) {
    const meta = await inputs.nth(i).evaluate((el) => `${el.getAttribute('name') ?? ''} ${el.getAttribute('autocomplete') ?? ''} ${el.id}`);
    expect(meta).not.toMatch(/card|cvv|cc-|pin|password|otp/i);
  }
});

test('admin area is not indexed and requires sign-in', async ({ page, request }) => {
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toMatch(/Disallow:\s*\/admin/);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
