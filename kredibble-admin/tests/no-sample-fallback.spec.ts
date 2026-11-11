/**
 * SEC-148 (real API run only): with Mock data off, a failed request shows an error with "Try again", never sample data.
 *
 * The shared in-browser store starts from the sample seed in both modes. The staff and listing loaders used to catch every
 * API error and answer from that store, so a 429 or an outage listed sample people as the desk's team, and a link to a
 * sample id (staff-1, lst-001) opened a sample person or listing as if it were real. They now show the page's error (or
 * "not found" for an id the API doesn't know). The curated listing page is also checked for the SEC-146 kind of loop: its
 * metrics used to be written to the store on every load, and the page reloads on every store change.
 */
import { expect, test } from '@playwright/test';
import { MOCK_RUN, defaultBaseUrl } from './mode';

const BASE_URL = defaultBaseUrl();
const API_URL = process.env.E2E_API_URL || 'http://localhost:4000/api';
const API_ORIGIN = new URL(API_URL).origin;
const SAMPLE_STAFF = ['Nana Adjei', 'Efua Mensimah', 'Yaw Antwi'];
const failWith500 = { status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Server unavailable' } }) };

test.describe('A failed request never shows sample data (real API, SEC-148)', () => {
  test.skip(MOCK_RUN, 'real API run only: see npm run test:e2e');
  test.use({ viewport: { width: 1440, height: 900 } });

  test('Team: a failed load says so with Try again, lists no sample people, and Try again loads the real team', async ({ page }) => {
    await page.route('**/admin/staff?*', (route) => route.fulfill(failWith500));
    await page.goto(`${BASE_URL}/team`, { timeout: 30_000 });
    await expect(page.getByText('Could not load this list', { exact: true })).toBeVisible({ timeout: 20_000 });
    for (const name of SAMPLE_STAFF) await expect(page.getByText(name, { exact: true })).toHaveCount(0);

    await page.unroute('**/admin/staff?*');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('E2E Support', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Could not load this list', { exact: true })).toHaveCount(0);
  });

  test('a sample staff id is "not found", not the sample person', async ({ page }) => {
    await page.goto(`${BASE_URL}/staff/staff-1`, { timeout: 30_000 });
    await expect(page.getByText(/not found/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Nana Adjei', { exact: true })).toHaveCount(0);
  });

  test('a staff member whose load fails shows the error, not a sample person', async ({ page }) => {
    await page.route('**/admin/staff/staff-1', (route) => route.fulfill(failWith500));
    await page.goto(`${BASE_URL}/staff/staff-1`, { timeout: 30_000 });
    await expect(page.getByText('Could not load this record', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(page.getByText('Nana Adjei', { exact: true })).toHaveCount(0);
  });

  test('a sample listing id is "not found", not the sample listing', async ({ page }) => {
    await page.goto(`${BASE_URL}/opportunities/lst-001`, { timeout: 30_000 });
    await expect(page.getByText(/not found/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: /^Edit/ })).toHaveCount(0);
  });

  test('a curated listing page is quiet once loaded (SEC-146 kind of loop)', async ({ page }) => {
    test.setTimeout(90_000);
    const title = `E2E quiet listing ${Date.now()}`;
    await page.goto(`${BASE_URL}/opportunities/new`, { timeout: 30_000 });
    await page.getByTestId('sidebar-toggle').waitFor();
    await page.getByLabel('Title', { exact: true }).fill(title);
    await page.getByLabel('Description', { exact: true }).fill('A listing saved on the server by a test.');
    await page.getByLabel('Offering organisation').fill('Test Organisation');
    await page.getByRole('combobox', { name: 'Opportunity type' }).click();
    await page.getByRole('option', { name: 'Fellowship' }).click();
    await page.getByRole('combobox', { name: 'Country' }).click();
    await page.getByRole('option', { name: 'Ghana' }).click();
    await page.getByLabel('Application deadline').fill('2099-12-31');
    await page.getByLabel('Official application link').fill('https://example.org/apply');
    const saved = page.waitForResponse((response) => response.url().endsWith('/admin/opportunities') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save draft' }).click();
    expect((await saved).status()).toBe(201);
    await expect(page).toHaveURL(/\/opportunities\/[0-9a-f]{24}$/, { timeout: 15_000 });
    const id = /([0-9a-f]{24})$/.exec(page.url())![1];

    try {
      const requests: string[] = [];
      let counting = false;
      page.on('request', (request) => {
        if (counting && request.url().startsWith(API_ORIGIN)) requests.push(`${request.method()} ${request.url().replace(API_ORIGIN, '')}`);
      });
      await page.goto(`${BASE_URL}/opportunities/${id}`, { timeout: 30_000 });
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title, { timeout: 20_000 });
      await page.waitForTimeout(2_000);
      counting = true;
      await page.waitForTimeout(4_000);
      counting = false;
      expect(requests.length, `the listing page sent ${requests.length} API requests while idle:\n${requests.slice(0, 10).join('\n')}`).toBeLessThanOrEqual(4);
    } finally {
      await page.evaluate(async ({ api, id }) => { await fetch(`${api}/admin/opportunities/${id}`, { method: 'DELETE', credentials: 'include' }); }, { api: API_URL, id });
    }
  });
});
