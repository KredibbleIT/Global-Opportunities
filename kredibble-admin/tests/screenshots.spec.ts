import { test, expect, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'fs';
import path from 'path';
import { defaultBaseUrl } from './mode';

/**
 * Review screenshots of the admin portal (the appendix set). Mock mode only.
 *
 * Run (it only runs when SHOT_DIR is set, so a normal test run never writes images):
 *   SHOT_DIR="C:\Users\LEGION\Downloads\G.O.D app screenshots\admin-review" \
 *   E2E_MOCKS=1 PORT=4001 E2E_API_URL=http://localhost:4001/api E2E_NO_WARMUP=1 npx cross-env playwright test tests/screenshots.spec.ts
 *
 * Rules the script enforces:
 *  - BEFORE every capture it waits until the page is loaded: network idle, fonts ready, and no skeleton (animate-pulse), no aria-busy
 *    region, no spinner and no "Loading" text visible. If a placeholder is still there after 20 seconds the capture FAILS and nothing is saved.
 *  - It never overwrites: if any target file already exists the whole run stops before capturing anything.
 *  - It writes index.md (file, page, state, viewport) next to the images.
 *  - Mock data only. The only thing faked is the Ambassador applications list, which the app reads from the API (not the mock store):
 *    the script answers that one request with three clearly fictional applications so the page is not an empty state.
 */
const SHOT_DIR = process.env.SHOT_DIR;
const BASE_URL = defaultBaseUrl();
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

test.describe.configure({ mode: 'serial' });
test.skip(!SHOT_DIR, 'set SHOT_DIR to capture the review screenshots');
test.use({ viewport: DESKTOP, deviceScaleFactor: 2 });

interface Row { file: string; page: string; state: string; viewport: string }
const rows: Row[] = [];

/** Every file this run will write, in page order (the numbers are the page order). */
const PLAN = [
  '01-sign-in', '02-overview', '03-database', '04-network-ambassadors-list', '05-opportunities', '06-partners-board', '07-programs',
  '08-events-list', '09-event-detail', '10-grants-list', '11-grant-detail', '12-ambassadors-import-dialog', '13-ambassadors-export-dialog',
  '14-ambassador-applications', '15-leaderboard', '16-verification-awaiting', '17-verification-reviewed', '18-social-list',
  '19-social-add-post-dialog', '20-channels-list', '21-edit-channel-dialog', '22-team-members', '23-create-account-dialog',
  '24-team-role-matrix', '25-showcase', '26-reports', '27-settings',
  'm01-sign-in-390', 'm02-overview-390', 'm03-partners-board-390', 'm04-open-dropdown-menu-390',
];

/** Waits for a fully loaded page, and throws (so nothing is saved) if a placeholder is still on screen. */
async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  const placeholders = async () =>
    page.evaluate(() => {
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
      };
      const found: string[] = [];
      document.querySelectorAll('.animate-pulse, .animate-spin, [aria-busy="true"], [role="progressbar"][aria-busy]').forEach((el) => {
        if (visible(el)) found.push(`${el.tagName.toLowerCase()}.${String(el.getAttribute('class') ?? '').slice(0, 40)}`);
      });
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const parent = node.parentElement;
        if (parent && /^\s*Loading\b/i.test(node.textContent ?? '') && visible(parent) && !parent.closest('.sr-only')) found.push(`text:${(node.textContent ?? '').trim().slice(0, 30)}`);
      }
      return found;
    });
  const deadline = Date.now() + 20_000;
  let left = await placeholders();
  while (left.length > 0 && Date.now() < deadline) {
    await page.waitForTimeout(250);
    left = await placeholders();
  }
  if (left.length > 0) throw new Error(`placeholder still visible, capture refused: ${left.join(', ')}`);
  // the dev server's own "N" badge is not part of the product
  await page.addStyleTag({ content: 'nextjs-portal, [data-nextjs-toast], [data-nextjs-dev-tools-button] { display: none !important; }' });
  await page.waitForTimeout(400); // let the last transition (dialog fade, sheet slide) finish
}

async function capture(page: Page, name: string, info: { page: string; state: string; fullPage?: boolean }) {
  await settle(page);
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(SHOT_DIR!, file), fullPage: info.fullPage ?? false });
  const vp = page.viewportSize()!;
  rows.push({ file, page: info.page, state: info.state, viewport: `${vp.width}x${vp.height} @${vp.width === DESKTOP.width ? 2 : 2}x` });
}

const go = async (page: Page, route: string) => page.goto(`${BASE_URL}${route}`, { timeout: 45_000 });

test.beforeAll(() => {
  mkdirSync(SHOT_DIR!, { recursive: true });
  const taken = PLAN.map((n) => `${n}.png`).filter((f) => existsSync(path.join(SHOT_DIR!, f)));
  if (taken.length > 0) throw new Error(`these files already exist and are never overwritten: ${taken.join(', ')}`);
});

test.afterAll(() => {
  if (rows.length === 0) return;
  const lines = [
    '# Admin portal review screenshots',
    '',
    'Mock data only. Desktop images are 1440x900 at device scale factor 2 (2880 px wide); phone images are 390x844 at scale 2.',
    '',
    '| File | Page | State | Viewport |',
    '| --- | --- | --- | --- |',
    ...rows.map((r) => `| ${r.file} | ${r.page} | ${r.state} | ${r.viewport} |`),
    '',
  ];
  writeFileSync(path.join(SHOT_DIR!, 'index.md'), lines.join('\n'), { flag: 'wx' });
  const images = readdirSync(SHOT_DIR!).filter((f) => f.endsWith('.png'));
  for (const f of images) expect(statSync(path.join(SHOT_DIR!, f)).size, `${f} looks blank`).toBeGreaterThan(15_000);
});

test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test('sign-in (desktop)', async ({ page }) => {
    await go(page, '/login');
    await expect(page.getByRole('heading', { name: 'Admin Portal' })).toBeVisible();
    await capture(page, '01-sign-in', { page: 'Sign-in', state: 'Empty form, the photo panel on the left' });
  });
  test('sign-in (phone)', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await go(page, '/login');
    await expect(page.getByRole('heading', { name: 'Admin Portal' })).toBeVisible();
    await capture(page, 'm01-sign-in-390', { page: 'Sign-in', state: 'Empty form, the form first' });
  });
});

test.describe('desktop', () => {
  test('overview', async ({ page }) => {
    await go(page, '/');
    await expect(page.getByTestId('priorities-list')).toBeVisible();
    await capture(page, '02-overview', { page: 'Overview', state: 'This month, Team performance with the month selector', fullPage: true });
  });

  test('database', async ({ page }) => {
    await go(page, '/database');
    await expect(page.getByTestId('table-row').first()).toBeVisible();
    await capture(page, '03-database', { page: 'Database', state: 'Verification pace card and the records list', fullPage: true });
  });

  test('network / ambassadors list, import dialog and export dialog', async ({ page }) => {
    await go(page, '/network');
    await expect(page.getByTestId('table-row').first()).toBeVisible();
    await capture(page, '04-network-ambassadors-list', { page: 'Network (Ambassadors)', state: 'List, two-row toolbar with Export / Import / History', fullPage: true });

    await page.getByRole('button', { name: /^Import/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await capture(page, '12-ambassadors-import-dialog', { page: 'Network (Ambassadors)', state: 'Import ambassadors dialog open (step 1)' });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByRole('button', { name: /^Export/ }).click();
    await page.getByRole('menuitem', { name: 'Export all' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await capture(page, '13-ambassadors-export-dialog', { page: 'Network (Ambassadors)', state: 'Export all: column picker dialog open' });
  });

  test('opportunities', async ({ page }) => {
    await go(page, '/opportunities');
    await expect(page.getByTestId('table-row').first()).toBeVisible();
    await capture(page, '05-opportunities', { page: 'Opportunities', state: 'List with the two-row toolbar', fullPage: true });
  });

  test('partners board', async ({ page }) => {
    await go(page, '/partners');
    await expect(page.getByTestId('kanban-column-prospect')).toBeVisible();
    await expect(page.getByTestId('pipeline-gauge')).toBeVisible();
    await capture(page, '06-partners-board', { page: 'Partners', state: 'Board with Open deals, Closed this month, Next month target and pipeline health', fullPage: true });
  });

  test('programs', async ({ page }) => {
    await go(page, '/programs');
    await expect(page.getByTestId('table-row').first()).toBeVisible();
    await capture(page, '07-programs', { page: 'Programs', state: 'List with the Active summary and status filter', fullPage: true });
  });

  test('events list and detail', async ({ page }) => {
    await go(page, '/events');
    await expect(page.getByTestId('table-row').first()).toBeVisible();
    await capture(page, '08-events-list', { page: 'Events', state: 'List', fullPage: true });
    await page.getByTestId('table-row').first().getByRole('link').first().click();
    await expect(page).toHaveURL(/\/events\/[^/]+$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await capture(page, '09-event-detail', { page: 'Event detail', state: 'First event: one summary, Attendance, capacity and side panel', fullPage: true });
  });

  test('grants list and detail', async ({ page }) => {
    await go(page, '/grants');
    await expect(page.getByTestId('table-row').first()).toBeVisible();
    await capture(page, '10-grants-list', { page: 'Grants', state: 'List with USD amounts', fullPage: true });
    await page.getByTestId('table-row').first().getByRole('link').first().click();
    await expect(page).toHaveURL(/\/grants\/[^/]+$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await capture(page, '11-grant-detail', { page: 'Grant detail', state: 'First grant: funding pool and applications', fullPage: true });
  });

  test('ambassador applications', async ({ page }) => {
    // The one list that reads the API, not the mock store: answer it with three fictional applications.
    const now = new Date().toISOString();
    const application = (id: string, name: string, role: 'seeker' | 'hirer', status: string, profession: string, organisation: string) => ({
      id, userId: `u-${id}`, role, name, email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.org`, profession, organisation, status, createdAt: now, updatedAt: now,
    });
    const data = [
      application('a1', 'Ama Mensah', 'seeker', 'pending', 'Student', 'University of Ghana'),
      application('a2', 'Kofi Boateng', 'seeker', 'pending', 'Software engineer', 'Accra Tech Hub'),
      application('a3', 'Efua Danquah', 'hirer', 'pending', 'Programme manager', 'Bridge Foundation'),
    ];
    await page.route('**/admin/ambassador-requests*', (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data, meta: { page: 1, limit: 100, total: 3, pages: 1 } }) })
        : route.continue(),
    );
    await go(page, '/ambassador-applications');
    await expect(page.getByTestId('table-row').first()).toBeVisible();
    await capture(page, '14-ambassador-applications', { page: 'Ambassador Applications', state: 'Pending applications (three fictional records, answered by the script)', fullPage: true });
  });

  test('leaderboard', async ({ page }) => {
    await go(page, '/leaderboard');
    await expect(page.getByTestId('table-row').first()).toBeVisible();
    await capture(page, '15-leaderboard', { page: 'Leaderboard', state: 'This month so far, short headers and definitions', fullPage: true });
  });

  test('verification both tabs', async ({ page }) => {
    await go(page, '/verification');
    await expect(page.getByTestId('table-row').first()).toBeVisible();
    await capture(page, '16-verification-awaiting', { page: 'Verification Queue', state: 'Awaiting verification tab', fullPage: true });
    await page.getByRole('tab', { name: /^Reviewed requests/ }).click();
    await expect(page.getByTestId('table-row').first()).toBeVisible();
    await capture(page, '17-verification-reviewed', { page: 'Verification Queue', state: 'Reviewed requests tab', fullPage: true });
  });

  test('social list and Add post dialog', async ({ page }) => {
    await go(page, '/social');
    await expect(page.getByTestId('table-row').first()).toBeVisible();
    await expect(page.getByTestId('total-posts')).toContainText(/\d/);
    await capture(page, '18-social-list', { page: 'Social', state: 'Monthly totals and the posts list', fullPage: true });
    await page.getByRole('button', { name: 'Add post' }).click();
    await expect(page.getByRole('dialog', { name: 'Add post' })).toBeVisible();
    await capture(page, '19-social-add-post-dialog', { page: 'Social', state: 'Add post dialog open' });
  });

  test('channels list and Edit channel dialog', async ({ page }) => {
    await go(page, '/community');
    await expect(page.getByTestId('table-row').first()).toBeVisible();
    await capture(page, '20-channels-list', { page: 'Channels', state: 'List with avatars and the row menu', fullPage: true });
    await page.getByRole('button', { name: /^Channel actions for/ }).first().click();
    await page.getByRole('menuitem', { name: 'Edit channel' }).click();
    await expect(page.getByRole('dialog', { name: 'Edit channel' })).toBeVisible();
    await capture(page, '21-edit-channel-dialog', { page: 'Channels', state: 'Edit channel dialog open' });
  });

  test('team members, Create account dialog, role matrix', async ({ page }) => {
    await go(page, '/team');
    await expect(page.getByTestId('table-row').first()).toBeVisible();
    await capture(page, '22-team-members', { page: 'Team', state: 'Members tab with the Create account / Invite Staff help lines', fullPage: true });
    await page.getByTestId('create-account-open').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await capture(page, '23-create-account-dialog', { page: 'Team', state: 'Create account dialog open' });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await go(page, '/team?tab=roles');
    await expect(page.getByRole('table', { name: /other roles can do/ })).toBeVisible();
    await capture(page, '24-team-role-matrix', { page: 'Team', state: 'Roles & permissions tab, role matrix (all roles)', fullPage: true });
  });

  test('showcase', async ({ page }) => {
    await go(page, '/showcase');
    await expect(page.getByTestId('table-row').first()).toBeVisible();
    await capture(page, '25-showcase', { page: 'Showcase', state: 'People and organisations tab', fullPage: true });
  });

  test('reports', async ({ page }) => {
    await go(page, '/reports');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByTestId('table-row').first()).toBeVisible();
    await capture(page, '26-reports', { page: 'Reports Queue', state: 'Open reports', fullPage: true });
  });

  test('settings', async ({ page }) => {
    await go(page, '/settings');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await capture(page, '27-settings', { page: 'Settings', state: 'Default tab', fullPage: true });
  });
});

test.describe('phone', () => {
  test.use({ viewport: PHONE });
  test('overview', async ({ page }) => {
    await go(page, '/');
    await expect(page.getByTestId('priorities-list')).toBeVisible();
    await capture(page, 'm02-overview-390', { page: 'Overview', state: 'This month', fullPage: true });
  });
  test('partners board', async ({ page }) => {
    await go(page, '/partners');
    await expect(page.getByRole('tab', { name: /^Prospect/ })).toBeVisible();
    await capture(page, 'm03-partners-board-390', { page: 'Partners', state: 'Stages as tabs, one stage at a time', fullPage: true });
  });
  test('an open dropdown menu', async ({ page }) => {
    await go(page, '/community');
    const kebab = page.getByRole('button', { name: /^Channel actions for/ }).first();
    await expect(kebab).toBeVisible();
    await kebab.click();
    await expect(page.getByRole('menu').first()).toBeVisible();
    await capture(page, 'm04-open-dropdown-menu-390', { page: 'Channels', state: 'Row actions menu open (bottom sheet)' });
  });
});
