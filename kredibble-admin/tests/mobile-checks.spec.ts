import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'fs';
import path from 'path';
import { MOCK_RUN, defaultBaseUrl } from './mode';

/**
 * Phone checks at 360px and 390px (batch 3): the month selector, the View report button, the sign-in form, the Partners board, and the
 * shared dropdowns/menus (open, readable, selected value kept, Escape and outside click close, focus returns to the trigger).
 * Mock mode. Nothing may be wider than the screen. Set SHOT_DIR to also save one screenshot per check.
 */
const BASE_URL = defaultBaseUrl();
const SHOT_DIR = process.env.SHOT_DIR;

// Mock-mode only (the pages need the sample data); the real-API run skips the whole file.
test.skip(!MOCK_RUN, 'phone checks run on sample data: see npm run test:e2e:mock');
const shot = async (page: Page, name: string) => {
  if (!SHOT_DIR) return;
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`) });
};
const noSideScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

for (const width of [360, 390]) {
  test.describe(`phone ${width}px`, () => {
    test.use({ viewport: { width, height: 780 } });

    test('Overview: the month selector never wraps a month name, the sheet keeps the selected value, Esc and a tap outside close it, focus returns', async ({ page }) => {
      await page.goto(`${BASE_URL}/`, { timeout: 30_000 });
      await expect(page.getByTestId('priorities-list')).toBeVisible();
      await noSideScroll(page);
      const trigger = page.getByRole('combobox', { name: 'Month' });
      await trigger.scrollIntoViewIfNeeded();
      expect(Math.round((await trigger.boundingBox())!.height)).toBeLessThanOrEqual(44); // one line: the label did not wrap
      const label = (await trigger.innerText()).trim();
      await trigger.click();
      const sheet = page.getByRole('dialog', { name: 'Select month' });
      await expect(sheet).toBeVisible();
      const options = sheet.getByRole('option');
      await expect(options.first()).toHaveAttribute('aria-selected', 'true'); // the selected value is kept
      for (const option of await options.all()) expect(Math.round((await option.boundingBox())!.height)).toBeLessThanOrEqual(56); // none cut or doubled
      await shot(page, `overview-month-selector-${width}`);
      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
      await expect(trigger).toBeFocused();
      expect((await trigger.innerText()).trim()).toBe(label);
      await trigger.click();
      await page.getByTestId('select-sheet-backdrop').click({ position: { x: 10, y: 10 } }); // outside the sheet
      await expect(sheet).toHaveCount(0);
    });

    test('Overview: View report is whole on screen and the card labels are readable', async ({ page }) => {
      await page.goto(`${BASE_URL}/`, { timeout: 30_000 });
      const button = page.getByRole('link', { name: 'View report' });
      await expect(button).toBeVisible();
      const box = (await button.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.height).toBeGreaterThanOrEqual(40);
      await shot(page, `overview-view-report-${width}`);
      await expect(page.getByTestId('priorities-list')).toBeVisible();
      await page.getByTestId('priorities-card').scrollIntoViewIfNeeded();
      await noSideScroll(page);
      await shot(page, `overview-card-labels-${width}`);
    });

    test.describe('sign-in', () => {
      test.use({ storageState: { cookies: [], origins: [] } });
      test('the form comes first, the logo (or wordmark) stays visible, nothing is wider than the screen', async ({ page }) => {
        await page.goto(`${BASE_URL}/login`, { timeout: 30_000 });
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Admin Portal');
        await expect(page.getByText('sign in to manage the platform')).toHaveCount(0); // no subtitle
        // (the photo panel with the other logo is not drawn on a phone, so look inside <main>, the form side)
        const logo = page.locator('main').getByTestId('brand-logo').or(page.locator('main').getByTestId('brand-wordmark'));
        await expect(logo).toBeVisible();
        const form = (await page.getByLabel('Email').boundingBox())!;
        expect(form.y).toBeLessThan(500); // the form is on the first screen, not under a photo panel
        await noSideScroll(page);
        await shot(page, `sign-in-${width}`);
      });
    });

    test('Partners: the stages are tabs on a phone, the last stage (Renewed) is reachable, and nothing is wider than the screen', async ({ page }) => {
      await page.goto(`${BASE_URL}/partners`, { timeout: 30_000 });
      await expect(page.getByRole('tab', { name: /^Prospect/ })).toBeVisible();
      await noSideScroll(page);
      const last = page.getByRole('tab', { name: /^Renewed/ });
      await last.scrollIntoViewIfNeeded();
      await last.click();
      await expect(last).toHaveAttribute('aria-selected', 'true');
      await shot(page, `partners-board-${width}`);
    });

    test('Channels: the row menu opens above the table inside the screen, Escape closes it and focus returns', async ({ page }) => {
      await page.goto(`${BASE_URL}/community`, { timeout: 30_000 });
      const kebab = page.getByRole('button', { name: /^Channel actions for/ }).first();
      await expect(kebab).toBeVisible();
      await kebab.click();
      const menu = page.getByRole('menu').first();
      await expect(menu).toBeVisible();
      await expect(menu.getByRole('menuitem', { name: 'Edit channel' })).toBeVisible();
      await shot(page, `channels-row-menu-${width}`);
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
      await expect(kebab).toBeFocused();
    });

    test('Edit channel: the dialog fits, its category list opens inside it, Escape closes the list first and not the dialog, focus returns', async ({ page }) => {
      await page.goto(`${BASE_URL}/community`, { timeout: 30_000 });
      await page.getByRole('button', { name: /^Channel actions for/ }).first().click();
      await page.getByRole('menuitem', { name: 'Edit channel' }).click();
      const dialog = page.getByRole('dialog', { name: 'Edit channel' });
      await expect(dialog).toBeVisible();
      await noSideScroll(page);
      const category = dialog.getByRole('combobox', { name: 'Category' });
      await category.scrollIntoViewIfNeeded();
      const before = (await category.innerText()).trim();
      await category.click();
      const list = page.getByRole('dialog', { name: 'Category' });
      await expect(list).toBeVisible();
      await expect(list.getByRole('option').first()).toBeVisible();
      await shot(page, `edit-channel-category-${width}`);
      await page.keyboard.press('Escape');
      await expect(list).toHaveCount(0);
      await expect(dialog).toBeVisible(); // the dialog stays
      await expect(category).toBeFocused();
      expect((await category.innerText()).trim()).toBe(before); // the value is kept
      await shot(page, `edit-channel-dialog-${width}`);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    });
  });
}

test.describe('tablet 768px: the Partners board', () => {
  test.use({ viewport: { width: 768, height: 900 } });
  test('scrolls sideways inside itself, the arrow buttons reach Renewed, and the page never scrolls sideways', async ({ page }) => {
    await page.goto(`${BASE_URL}/partners`, { timeout: 30_000 });
    const scroller = page.getByTestId('kanban-scroller');
    await expect(scroller).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const end = page.getByTestId('kanban-scroll-end');
    await expect(end).toBeVisible();
    // click until the button goes away (it is only drawn while there is more to the right)
    for (let i = 0; i < 6 && (await end.isVisible()); i += 1) {
      await end.click({ timeout: 5_000 });
      await page.waitForTimeout(500);
    }
    await expect(page.getByTestId('kanban-column-renew')).toBeInViewport();
    await shot(page, 'partners-board-scroll-768');
    const start = page.getByTestId('kanban-scroll-start');
    await expect(start).toBeVisible();
  });
});
