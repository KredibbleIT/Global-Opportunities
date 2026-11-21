/**
 * Monthly report, real API run (npm run test:e2e): no sample figures anywhere.
 *
 * No API serves the monthly figures yet, so with Mock data off both reports are built from no records: every figure is zero, the page says plainly that
 * the figures are not connected, and nothing is labelled "Sample" because nothing is sample data. (The mock run keeps its sample figures on purpose and is
 * covered in admin.e2e.spec.ts.)
 *
 * ALL DATA IS FAKE.
 */
import { expect, test } from '@playwright/test';
import { MOCK_RUN, defaultBaseUrl } from './mode';

const BASE_URL = defaultBaseUrl();

test.describe('Monthly report with Mock data off', () => {
  test.skip(MOCK_RUN, 'the mock run shows sample figures on purpose');

  test('the partner report has no sample label and every figure is zero', async ({ page }) => {
    await page.goto(`${BASE_URL}/monthly-report/partner`, { timeout: 30_000 });
    const paper = page.getByTestId('partner-report');
    await expect(paper).toBeVisible({ timeout: 20_000 });
    await expect(paper).toHaveAttribute('data-source', 'live');
    await expect(page.getByTestId('sample-data-pill')).toHaveCount(0);
    await expect(paper.getByTestId('sample-report-badge')).toHaveCount(0);
    await expect(page.getByTestId('not-connected-notice')).toContainText("Monthly figures aren't connected to live data yet");
    await expect(page.getByTestId('report-empty')).toBeVisible();
    const values = await paper.getByTestId('metric-value').allTextContents();
    expect(values.length).toBeGreaterThan(5);
    for (const value of values) expect(value.trim()).toMatch(/^[0—-]$/);
    await expect(paper.getByTestId('channel-table')).toHaveCount(0);
    await expect(paper.getByTestId('channels-none')).toBeVisible();
  });

  test('the team report has no sample label, no sample people or ambassadors, and the same cards as the partner report', async ({ page }) => {
    await page.goto(`${BASE_URL}/monthly-report/team`, { timeout: 30_000 });
    const paper = page.getByTestId('team-report');
    await expect(paper).toBeVisible({ timeout: 20_000 });
    await expect(paper).toHaveAttribute('data-source', 'live');
    await expect(page.getByTestId('sample-data-pill')).toHaveCount(0);
    await expect(paper.getByTestId('sample-report-badge')).toHaveCount(0);
    await expect(page.getByTestId('report-empty')).toBeVisible();
    for (const value of await paper.getByTestId('team-kpi-value').allTextContents()) expect(value.trim()).toMatch(/^[0—-]$/);
    await expect(paper.getByTestId('top-row')).toHaveCount(0);
    await expect(paper.getByTestId('top-none')).toBeVisible();
    await expect(paper.getByTestId('team-row')).toHaveCount(0);
    for (const id of ['team-network', 'team-kpis', 'team-pipeline', 'team-database', 'team-social', 'team-scoreboard']) await expect(paper.getByTestId(id)).toBeVisible();
    const framedInside = await paper.locator('.card-surface .card-surface').evaluateAll((nodes) => nodes.filter((node) => parseFloat(getComputedStyle(node).borderTopWidth) > 0).length);
    expect(framedInside, 'a framed card inside another card').toBe(0);
  });
});
