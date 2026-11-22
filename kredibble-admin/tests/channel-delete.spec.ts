/**
 * Deleting a community channel: an admin takes a channel off the platform, for example one a person made that does not fit what the app is about.
 *
 *  - Mock mode (npm run test:e2e:mock): the row menu offers "Delete channel", asks first, and the sample channel becomes Removed.
 *  - Real API (npm run test:e2e): a channel is created through the dashboard, deleted from its row menu, and is gone from the list after a reload;
 *    a second one is deleted from its own page and the dashboard returns to the list.
 *
 * ALL DATA IS FAKE.
 */
import { expect, test, type Page } from '@playwright/test';
import { MOCK_RUN, defaultBaseUrl } from './mode';

const BASE_URL = defaultBaseUrl();

/** Creates a channel through the "Create channel" dialog (real mode only). */
async function createChannel(page: Page, name: string) {
  await page.goto(`${BASE_URL}/community`, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Create channel' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Create channel' });
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('button', { name: 'Create channel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: `Channel actions for ${name}` })).toBeVisible({ timeout: 15_000 });
}

test.describe('Delete a channel', () => {
  test('the row menu asks first: Cancel keeps the channel, Delete channel takes it away', async ({ page }) => {
    let name: string;
    if (MOCK_RUN) {
      await page.goto(`${BASE_URL}/community`, { timeout: 30_000 });
      const label = await page.getByRole('button', { name: /^Channel actions for/ }).first().getAttribute('aria-label');
      name = String(label).replace('Channel actions for ', '');
    } else {
      name = `Test Off Topic ${Date.now()}`;
      await createChannel(page, name);
    }
    const kebab = page.getByRole('button', { name: `Channel actions for ${name}` });

    // Cancel: nothing changes
    await kebab.click();
    await page.getByRole('menuitem', { name: 'Delete channel' }).click();
    const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog', { name: 'Delete this channel?' }));
    await expect(dialog).toContainText(name);
    await expect(dialog).toContainText('disappears for everyone in the app');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(kebab).toBeVisible();

    // Delete
    await kebab.click();
    await page.getByRole('menuitem', { name: 'Delete channel' }).click();
    await dialog.getByRole('button', { name: 'Delete channel' }).click();
    await expect(page.getByText(`${name} was deleted.`)).toBeVisible({ timeout: 10_000 });

    if (MOCK_RUN) {
      // The sample channel stays in the list, marked Removed, and cannot be deleted twice.
      const row = page.getByTestId('table-row').filter({ hasText: name });
      await expect(row).toContainText('Removed');
      await kebab.click();
      await expect(page.getByRole('menuitem', { name: 'Delete channel' })).toHaveCount(0);
      await expect(page.getByRole('menuitem', { name: 'Edit channel' })).toBeVisible();
    } else {
      await expect(kebab).toHaveCount(0);
      await page.reload();
      await expect(page.getByRole('button', { name: `Channel actions for ${name}` })).toHaveCount(0);
    }
  });

  test('a channel can be deleted from its own page, which returns to the list', async ({ page }) => {
    test.skip(MOCK_RUN, 'in mock mode the channel page has its own sample moderation view ("Remove channel")');
    const name = `Test Off Topic Page ${Date.now()}`;
    await createChannel(page, name);
    await page.getByRole('link', { name: new RegExp(name) }).first().click().catch(async () => {
      await page.getByText(name, { exact: true }).first().click();
    });
    await expect(page).toHaveURL(/\/community\/[0-9a-f]{24}/, { timeout: 15_000 });
    await expect(page.getByRole('region', { name: 'Danger zone' })).toBeVisible();
    await page.getByTestId('delete-channel').click();
    await page.getByRole('alertdialog').or(page.getByRole('dialog', { name: 'Delete this channel?' })).getByRole('button', { name: 'Delete channel' }).click();
    await expect(page).toHaveURL(/\/community$/, { timeout: 15_000 });
    await expect(page.getByRole('button', { name: `Channel actions for ${name}` })).toHaveCount(0);
  });
});
