import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type Page } from '@playwright/test';
import { createUser, type AppRole, type TestUser } from '../helpers/stack';

export { expect };

/**
 * Every test fails if the page logs an uncaught error or a console error.
 * Network 4xx responses that are part of a test (e.g. a permission check) are
 * not console errors and are unaffected.
 */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
      page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        // The browser logs failed HTTP responses as console errors; tests that
        // expect a refusal assert on the UI instead.
        if (/Failed to load resource: the server responded with a status of (401|403|404|409|422)/.test(text)) return;
        errors.push(text);
      });
      await use(errors);
      expect(errors, 'console errors').toEqual([]);
    },
    { auto: true },
  ],
});

/** Fails on serious or critical WCAG 2.x A/AA violations. */
export async function expectAccessible(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = serious.map((v) => `${v.id}: ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  expect(summary, `accessibility violations on ${label}`).toEqual([]);
}

/** Creates a staff user through trusted setup and signs in through the real login form. */
export async function signInAs(page: Page, roles: AppRole[], label = 'staff'): Promise<TestUser> {
  const user = await createUser(roles, label);
  await page.goto('/admin/login');
  await page.getByLabel('Email address').fill(user.email);
  await page.getByLabel(/^Password/).fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Welcome/ })).toBeVisible();
  return user;
}

export const MAIL = 'http://127.0.0.1:54324/messages';

export async function latestMail(to: string, subject: RegExp, timeoutMs = 10_000): Promise<{ subject: string; html: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const messages = (await (await fetch(`${MAIL}?to=${encodeURIComponent(to)}`)).json()) as Array<{ subject: string; html: string }>;
    const match = messages.filter((m) => subject.test(m.subject)).at(-1);
    if (match) return match;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No email matching ${subject} for ${to}`);
}
