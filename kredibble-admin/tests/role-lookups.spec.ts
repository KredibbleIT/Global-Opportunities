/**
 * SEC-135 (real API run only): the Partners and Programs pages work for the roles they are for, signed in AS those roles.
 *
 * Since SEC-131 the server applies the BE-001 matrix to every staff session. A Partnerships Officer has no Programs or Team
 * screen, and a Training Officer has no Partners screen, so the pages read their lookups from routes their own grants cover:
 * the partner page gets its linked programs with the partner, the owner picker reads /admin/partners/owner-options, and the
 * program form's partner picker reads /admin/programs/partner-options.
 *
 * Each test makes a staff account through BE-028 (as the saved root-admin session), sets its password through the invite
 * link, and signs in through the login form in a fresh browser. Passwords are random per run and never printed.
 * ALL DATA IS FAKE.
 */
import { randomBytes } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { MOCK_RUN, defaultBaseUrl } from './mode';

const BASE_URL = defaultBaseUrl();
const API_URL = process.env.E2E_API_URL || 'http://localhost:4000/api';

interface Account {
  name: string;
  email: string;
  password: string;
}

test.describe('Partners and Programs for their own roles (real API, SEC-135)', () => {
  test.skip(MOCK_RUN, 'real API run only: see npm run test:e2e');
  test.describe.configure({ mode: 'serial' });
  test.use({ viewport: { width: 1440, height: 900 } });
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const partnerName = `Live Role Partner ${stamp}`;
  const linkedProgram = `Live Linked Program ${stamp}`;
  let partnerId = '';

  /** A staff account in `group`, made by the signed-in root admin; the invite link sets its password. */
  const makeStaff = async (page: Page, group: string): Promise<Account> => {
    const account = {
      name: `Live ${group} ${stamp}`,
      email: `role.${group}.${stamp}@example.org`,
      password: `${randomBytes(18).toString('base64url')}Aa1!`,
    };
    const created = await page.request.post(`${API_URL}/admin/accounts`, { data: { name: account.name, email: account.email, type: 'admin', group } });
    expect(created.status()).toBe(201);
    const token = String((await created.json()).data.invite?.url ?? '').split('/').pop() ?? '';
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const accepted = await page.request.post(`${API_URL}/auth/accept-invite`, { data: { token, password: account.password } });
    expect(accepted.ok()).toBe(true);
    return account;
  };

  /** A fresh browser, signed in as `account` through the login form. */
  const signIn = async (browser: Browser, account: Account) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/login`, { timeout: 30_000 });
    await page.fill('input[type="email"]', account.email);
    await page.fill('input[type="password"]', account.password);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
    return { context, page };
  };

  const open = async (page: Page, path: string) => {
    await page.goto(`${BASE_URL}${path}`, { timeout: 30_000 });
    await page.getByTestId('sidebar-toggle').waitFor();
  };

  test('a Partnerships Officer sees a partner\'s linked programs and picks its owner', async ({ page, browser }) => {
    // Set up as the root admin: a partner with one linked program.
    // Everything the partner form requires, so the officer's edit can be saved as it is.
    const partner = await page.request.post(`${API_URL}/admin/partners`, {
      data: {
        organizationName: partnerName, partnerType: 'foundation', country: 'Ghana', provides: 'Scholarship funding',
        contactName: 'Ama Boateng', contactEmail: `partner.${stamp}@example.org`,
      },
    });
    expect(partner.status()).toBe(201);
    partnerId = (await partner.json()).data.id;
    const program = await page.request.post(`${API_URL}/admin/programs`, {
      data: { title: linkedProgram, programType: 'bootcamp', country: 'Ghana', partnerId, startAt: '2031-04-01T09:00:00.000Z', endAt: '2031-04-01T12:00:00.000Z' },
    });
    expect(program.status()).toBe(201);
    const officer = await makeStaff(page, 'partnerships_officer');

    const { context, page: officerPage } = await signIn(browser, officer);
    try {
      await open(officerPage, `/partners/${partnerId}`);
      await expect(officerPage.getByRole('heading', { level: 1 })).toHaveText(partnerName, { timeout: 15_000 });
      await expect(officerPage.getByTestId('linked-programs')).toContainText(linkedProgram);

      await open(officerPage, `/partners/${partnerId}/edit`);
      await officerPage.getByRole('combobox', { name: 'Assigned owner' }).click();
      await officerPage.getByRole('option', { name: new RegExp(`^${officer.name}`) }).click();
      await officerPage.getByRole('button', { name: 'Save changes' }).click();
      await expect(officerPage.getByText(`${partnerName} was updated.`)).toBeVisible({ timeout: 15_000 });
      await expect(officerPage.locator('main')).toContainText(officer.name);
    } finally {
      await context.close();
    }
  });

  test('a Training Officer links a new program to a partner', async ({ page, browser }) => {
    const programName = `Live Role Program ${stamp}`;
    const trainer = await makeStaff(page, 'training_officer');
    const { context, page: trainerPage } = await signIn(browser, trainer);
    try {
      await open(trainerPage, '/programs/new');
      await trainerPage.getByLabel('Title', { exact: true }).fill(programName);
      await trainerPage.getByRole('combobox', { name: 'Country' }).click();
      await trainerPage.getByRole('option', { name: 'Ghana' }).click();
      const when = async (label: string, time: string) => {
        const group = trainerPage.getByRole('group', { name: label });
        await group.getByLabel('Date', { exact: true }).fill('2031-05-01');
        await group.getByLabel('Date', { exact: true }).blur();
        await group.getByLabel('Time', { exact: true }).fill(time);
        await group.getByLabel('Time', { exact: true }).blur();
      };
      await when('Start date and time', '09:00');
      await when('End date and time', '11:00');
      await trainerPage.getByLabel('Participant target').fill('20');
      await trainerPage.getByRole('combobox', { name: 'Linked partner' }).click();
      await trainerPage.getByRole('option', { name: partnerName }).click();
      await trainerPage.getByRole('button', { name: 'Create program' }).click();
      await expect(trainerPage.getByText(`${programName} was created.`)).toBeVisible({ timeout: 15_000 });
      // The program names its partner. With SEC-136 the UI follows the trainer's own roles: there is no Partners
      // screen, so the name is plain text rather than a link to the partner page.
      await expect(trainerPage.locator('main')).toContainText(partnerName, { timeout: 15_000 });
      await expect(trainerPage.getByTestId('partner-link')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
