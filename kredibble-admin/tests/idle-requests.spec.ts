/**
 * SEC-146 (real API run only): no dashboard page keeps calling the API once it has loaded.
 *
 * The Team page used to reload the staff list in a loop (about 50 requests a second): each load wrote the list into the
 * shared store, the write told the page something changed, and the page loaded again. The admin API allows 100 requests
 * per 15 minutes per session, so one visit would have locked the whole dashboard. These tests open every sidebar page,
 * let it load, then count the API requests it sends while nobody touches it.
 */
import { expect, test } from '@playwright/test';
import { MOCK_RUN, defaultBaseUrl } from './mode';

const BASE_URL = defaultBaseUrl();
const API_ORIGIN = new URL(process.env.E2E_API_URL || 'http://localhost:4000/api').origin;

const ROUTES = [
  '/', '/analytics', '/monthly-report', '/scorecard', '/opportunities', '/events', '/grants', '/programs', '/partners',
  '/network', '/ambassador-applications', '/leaderboard', '/seekers', '/hirers', '/community', '/database', '/verification',
  '/reports', '/content/articles', '/reference-data', '/social', '/testimonials', '/showcase', '/notifications', '/team',
  '/team?tab=roles', '/settings',
];

/** Requests a page may send while idle (a session refresh or a slow second render); a loop sends hundreds. */
const IDLE_BUDGET = 4;
const SETTLE_MS = 2_000;
const IDLE_MS = 4_000;

test.describe('No page keeps calling the API while idle (real API, SEC-146)', () => {
  test.skip(MOCK_RUN, 'real API run only: mock mode sends no API requests');
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const route of ROUTES) {
    test(`${route} is quiet once loaded`, async ({ page }) => {
      const requests: string[] = [];
      let counting = false;
      page.on('request', (request) => {
        if (counting && request.url().startsWith(API_ORIGIN)) requests.push(`${request.method()} ${request.url().replace(API_ORIGIN, '')}`);
      });

      await page.goto(`${BASE_URL}${route}`, { timeout: 30_000 });
      await expect(page.locator('main h1').first()).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(SETTLE_MS);

      counting = true;
      await page.waitForTimeout(IDLE_MS);
      counting = false;

      expect(requests.length, `${route} sent ${requests.length} API requests in ${IDLE_MS} ms while idle:\n${requests.slice(0, 10).join('\n')}`).toBeLessThanOrEqual(IDLE_BUDGET);
    });
  }

  test('the Team page asks for the team at most three times when it opens', async ({ page }) => {
    let staffRequests = 0;
    page.on('request', (request) => {
      if (request.url().startsWith(API_ORIGIN) && /\/admin\/staff\?/.test(request.url())) staffRequests += 1;
    });
    await page.goto(`${BASE_URL}/team`, { timeout: 30_000 });
    await expect(page.getByRole('tab', { name: 'Members' })).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(5_000);
    // Three in development: React's strict mode runs the first load twice, and the first answer replaces the sample team in
    // the store, which reloads the list once more; that reload finds nothing new, so it stops (two in production).
    expect(staffRequests).toBeLessThanOrEqual(3);
  });
});
