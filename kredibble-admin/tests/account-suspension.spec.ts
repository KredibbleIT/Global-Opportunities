/**
 * SEC-147 (real API run only): Suspend and Reinstate on a seeker's or hirer's page save to the server.
 *
 * Before, both buttons changed the page and showed "X was suspended." while nothing was sent, so after a reload the
 * account was Active again and the person could still sign in. Each test registers a fresh app account (so no other
 * test sees it suspended), suspends it from its admin page, reloads, checks the person can't sign in, then reinstates
 * it and checks they can. ALL DATA IS FAKE.
 */
import { expect, test, type Page } from '@playwright/test';
import { MOCK_RUN, defaultBaseUrl } from './mode';

const BASE_URL = defaultBaseUrl();
const API_URL = process.env.E2E_API_URL || 'http://localhost:4000/api';
const PASSWORD = 'Password123';

interface Case {
  role: 'seeker' | 'hirer';
  list: 'seekers' | 'hirers';
  /** The name the detail page shows in its title and toasts. */
  title: (name: string) => string;
}

const CASES: Case[] = [
  { role: 'seeker', list: 'seekers', title: (name) => name },
  { role: 'hirer', list: 'hirers', title: (name) => `${name} Ltd` },
];

test.describe('Suspend and Reinstate save to the server (real API, SEC-147)', () => {
  test.skip(MOCK_RUN, 'real API run only: see npm run test:e2e');
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const { role, list, title } of CASES) {
    test(`a ${role}: suspended after a reload and unable to sign in, then reinstated`, async ({ page }) => {
      const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
      const name = `Suspend ${role} ${stamp}`;
      const email = `suspend.${role}.${stamp}@example.org`;
      const registered = await page.request.post(`${API_URL}/v1/auth/register`, {
        data: { name, email, password: PASSWORD, role, ...(role === 'hirer' ? { companyName: title(name) } : { country: 'Ghana' }) },
      });
      expect(registered.status()).toBe(201);

      const found = await page.request.get(`${API_URL}/admin/${list}?q=${encodeURIComponent(email)}&limit=5`);
      expect(found.ok()).toBe(true);
      const id = String((await found.json()).data.find((row: { email?: string }) => row.email === email)?.id ?? '');
      expect(id).not.toBe('');

      const signIn = () => page.request.post(`${API_URL}/v1/auth/login`, { data: { email, password: PASSWORD } });
      const summary = (current: Page) => current.getByRole('region', { name: 'Summary' });

      await page.goto(`${BASE_URL}/${list}/${id}`, { timeout: 30_000 });
      await expect(summary(page).getByText('Active', { exact: true })).toBeVisible({ timeout: 15_000 });

      const saved = page.waitForResponse((response) => response.url().endsWith(`/admin/${list}/${id}/status`) && response.request().method() === 'PATCH');
      await page.getByRole('button', { name: 'Suspend account' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Suspend account' }).click();
      expect((await saved).status()).toBe(200);
      await expect(page.getByText(`${title(name)} was suspended.`)).toBeVisible();
      await expect(summary(page).getByText('Suspended', { exact: true })).toBeVisible();

      await page.reload();
      await expect(summary(page).getByText('Suspended', { exact: true })).toBeVisible({ timeout: 15_000 });
      const refused = await signIn();
      expect(refused.status()).toBe(403);
      expect((await refused.json()).error.message).toMatch(/suspended/i);

      await page.getByRole('button', { name: 'Reinstate account' }).click();
      await expect(page.getByText(`${title(name)} was reinstated.`)).toBeVisible();
      await page.reload();
      await expect(summary(page).getByText('Active', { exact: true })).toBeVisible({ timeout: 15_000 });
      expect((await signIn()).status()).toBe(200);
    });
  }

  test('a failed save says so and leaves the account Active', async ({ page }) => {
    const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const name = `Suspend failure ${stamp}`;
    const email = `suspend.failure.${stamp}@example.org`;
    expect((await page.request.post(`${API_URL}/v1/auth/register`, { data: { name, email, password: PASSWORD, role: 'seeker', country: 'Ghana' } })).status()).toBe(201);
    const found = await page.request.get(`${API_URL}/admin/seekers?q=${encodeURIComponent(email)}&limit=5`);
    const id = String((await found.json()).data.find((row: { email?: string }) => row.email === email)?.id ?? '');

    await page.route(`**/admin/seekers/${id}/status`, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Server unavailable' } }) }),
    );
    await page.goto(`${BASE_URL}/seekers/${id}`, { timeout: 30_000 });
    const summary = page.getByRole('region', { name: 'Summary' });
    await expect(summary.getByText('Active', { exact: true })).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Suspend account' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Suspend account' }).click();
    await expect(page.getByText(/The account could not be updated/)).toBeVisible();
    await expect(summary.getByText('Active', { exact: true })).toBeVisible();
    await expect(page.getByText(`${name} was suspended.`)).toHaveCount(0);
  });
});
