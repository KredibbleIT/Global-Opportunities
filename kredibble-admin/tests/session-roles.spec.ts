/**
 * SEC-136: the admin shows each staff member the screens of THEIR roles, read from GET /auth/admin/me.
 *
 * Every staff User has the session role "admin" (BE-028 creates them that way), and the UI used to map that to Super
 * Admin, so every staff member saw every page while the API (SEC-131) refused most of them. These tests run against the
 * real API only: the root admin (the e2e admin, no staff record) creates a Partnerships Officer through BE-028, the invite
 * is accepted with a random password, and that person signs in through the login form.
 *
 * ALL DATA IS FAKE: emails end in @example.com and the password is random per run and never printed.
 */
import crypto from 'node:crypto';
import { expect, request, test, type Page } from '@playwright/test';
import { AUTH_FILE, MOCK_RUN, defaultBaseUrl } from './mode';

const BASE_URL = defaultBaseUrl();
const API_URL = process.env.E2E_API_URL || 'http://localhost:4000/api';

test.skip(MOCK_RUN, 'roles come from the real API session');
test.describe.configure({ mode: 'serial' });

/** Creates an Admin account in `group` as the root admin and accepts its invite. Returns its staff id and credentials. */
async function createStaffer(group: string) {
  const email = `sec136-${group}-${Date.now()}@example.com`;
  const password = `Aa1${crypto.randomBytes(12).toString('hex')}`;
  const asRoot = await request.newContext({ storageState: AUTH_FILE });
  try {
    const created = await asRoot.post(`${API_URL}/admin/accounts`, { data: { type: 'admin', group, name: `SEC-136 ${group}`, email } });
    expect(created.status(), 'create the account as the root admin').toBe(201);
    const body = (await created.json()) as { data: { account: { id: string }; invite?: { url: string } } };
    const token = body.data.invite?.url.split('/').pop();
    expect(token, 'the e2e API sends no email, so it returns the invite link').toMatch(/^[0-9a-f]{64}$/);
    const accepted = await asRoot.post(`${API_URL}/auth/accept-invite`, { data: { token, password } });
    expect(accepted.ok(), 'accept the invite').toBe(true);
    return { id: body.data.account.id, email, password };
  } finally {
    await asRoot.dispose();
  }
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE_URL}/login`, { timeout: 30_000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE_URL}/`, { timeout: 30_000 });
}

/** Opens `path` and says whether the route guard let the page render. */
async function opens(page: Page, path: string) {
  await page.goto(`${BASE_URL}${path}`, { timeout: 30_000 });
  await expect(page.getByTestId('page-title').or(page.getByTestId('no-access')).first()).toBeVisible();
  return (await page.getByTestId('no-access').count()) === 0;
}

test.describe('SEC-136: a staff member sees the screens of their own roles', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('a Partnerships Officer gets Partners and not Team or Seekers; a role change shows on the next load', async ({ page }) => {
    const officer = await createStaffer('partnerships_officer');
    await signIn(page, officer.email, officer.password);

    const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem('kredibble_admin_user') ?? 'null'));
    expect(stored?.roles).toEqual(['partnerships_officer']);
    expect(await opens(page, '/partners')).toBe(true);
    expect(await opens(page, '/team')).toBe(false);
    expect(await opens(page, '/seekers')).toBe(false);

    // A Super Admin moves them to Training Officer; the shell re-reads the roles on load, with no new sign-in.
    const asRoot = await request.newContext({ storageState: AUTH_FILE });
    try {
      const moved = await asRoot.patch(`${API_URL}/admin/staff/${officer.id}`, { data: { roles: ['training_officer'] } });
      expect(moved.ok(), 'change the role as the root admin').toBe(true);
    } finally {
      await asRoot.dispose();
    }
    expect(await opens(page, '/programs')).toBe(true);
    expect(await opens(page, '/partners')).toBe(false);
  });

  test('a suspended staff member is sent back to the login page on the next load', async ({ page }) => {
    const officer = await createStaffer('database_officer');
    await signIn(page, officer.email, officer.password);
    expect(await opens(page, '/database')).toBe(true);

    const asRoot = await request.newContext({ storageState: AUTH_FILE });
    try {
      const suspended = await asRoot.patch(`${API_URL}/admin/staff/${officer.id}`, { data: { status: 'suspended' } });
      expect(suspended.ok(), 'suspend as the root admin').toBe(true);
    } finally {
      await asRoot.dispose();
    }
    await page.goto(`${BASE_URL}/database`, { timeout: 30_000 });
    await expect(page).toHaveURL(`${BASE_URL}/login`, { timeout: 15_000 });
  });
});
