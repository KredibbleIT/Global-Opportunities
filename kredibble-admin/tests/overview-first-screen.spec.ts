/**
 * SEC-149: on a laptop screen the Overview opens on the work. Before, a 12-item activity feed (the API's default; the design
 * and mock mode show 6) put "Needs your attention" about 1,380 px down, two screens below the fold. Now the attention card leads
 * the page and the first Priority sits on the first screen at 1366x768. Runs in both modes (mock and real API).
 */
import { expect, test } from '@playwright/test';
import { defaultBaseUrl } from './mode';

const BASE_URL = defaultBaseUrl();

test.describe('Overview: the first screen shows the work (SEC-149)', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test('at 1366x768 the attention row and the first Priority are visible without scrolling; the feed has at most 6 entries', async ({ page }) => {
    await page.goto(`${BASE_URL}/`, { timeout: 30_000 });
    const attention = page.getByRole('region', { name: 'Needs your attention' });
    await expect(attention.getByRole('link').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('priorities-list')).toBeVisible({ timeout: 20_000 });

    const fold = await page.evaluate(() => window.innerHeight);
    const attentionBox = (await attention.boundingBox())!;
    expect(attentionBox.y + attentionBox.height, 'the whole attention card is above the fold').toBeLessThanOrEqual(fold);
    const firstPriority = (await page.getByTestId('priorities-list').locator('li').first().boundingBox())!;
    expect(firstPriority.y + firstPriority.height, 'the first Priority is above the fold').toBeLessThanOrEqual(fold);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    // The plain e2e seed has no activity (the feed is empty); the demo seed and mock mode have more than six events.
    const activity = page.getByRole('region', { name: 'Recent activity' });
    await expect(activity).toBeVisible();
    await expect(activity.getByLabel('Loading recent activity')).toHaveCount(0);
    expect(await activity.getByRole('listitem').count()).toBeLessThanOrEqual(6);
  });
});
