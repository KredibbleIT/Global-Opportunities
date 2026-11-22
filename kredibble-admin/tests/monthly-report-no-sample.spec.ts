/**
 * Monthly report, real API run (npm run test:e2e): no sample figures anywhere.
 *
 * With Mock data off both reports are read from the server (GET /admin/reports/partner and /team, with the Network, Leaderboard, Database and Social figures):
 * a month with no records is all zeros, there is no "not connected" notice, and nothing is labelled "Sample" because nothing is sample data. (The mock run
 * keeps its sample figures on purpose and is covered in admin.e2e.spec.ts.)
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
    await expect(page.getByTestId('not-connected-notice')).toHaveCount(0); // the figures come from the server now
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
    await expect(page.getByTestId('not-connected-notice')).toHaveCount(0);
    await expect(paper.getByTestId('top-row')).toHaveCount(0);
    await expect(paper.getByTestId('top-none')).toBeVisible();
    // The scoreboard lists the team members the server has (here: the one seeded account), never the sample people of the mock run.
    const people = await paper.getByTestId('team-row').allTextContents();
    for (const sample of ['Amara', 'Kwame', 'Nia']) expect(people.join(' ')).not.toContain(sample);
    for (const id of ['team-network', 'team-kpis', 'team-pipeline', 'team-database', 'team-social', 'team-scoreboard']) await expect(paper.getByTestId(id)).toBeVisible();
    const framedInside = await paper.locator('.card-surface .card-surface').evaluateAll((nodes) => nodes.filter((node) => parseFloat(getComputedStyle(node).borderTopWidth) > 0).length);
    expect(framedInside, 'a framed card inside another card').toBe(0);
  });
});
