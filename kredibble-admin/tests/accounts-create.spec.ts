/**
 * Create account (Team > Members): a Super Admin creates User and Admin accounts, which start as Invited.
 *
 * Two kinds of test:
 *  - "rules" tests need no browser: they call the pure functions in src/lib/accounts.ts (validation, role mapping, the Super Admin
 *    guard, the self / last-Super-Admin guards, the 48-hour invite);
 *  - "UI" tests drive the Team page in MOCK MODE (npm run test:e2e:mock): create, validation, duplicate email, the row actions,
 *    the audit history, and the permission gate (hidden for roles without accounts.create, refused by the page logic too).
 *
 * ALL DATA IS FAKE: emails end in @example.com and no real password exists anywhere (the feature has no password field at all).
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { MOCK_RUN, defaultBaseUrl } from './mode';
import {
  ADMIN_GROUPS, INVITE_HOURS, accountTypeOf, assertCreatable, canChangeRole, canDeactivate, canResend, isEmailTaken, isInviteExpired, makeInvite, normaliseEmail,
  normaliseName, rolesFor, validateAccount,
} from '../src/lib/accounts';
import type { StaffMember } from '../src/lib/mock-entities';

const BASE_URL = defaultBaseUrl();

const person = (over: Partial<StaffMember> = {}): StaffMember => ({
  id: 'p1', name: 'Test Person', email: 'test.person@example.com', roles: ['support'], status: 'active', joinedDate: '2026-10-01', ...over,
});

// ---------------------------------------------------------------------------------------------------------------------
// Rules (no browser)
// ---------------------------------------------------------------------------------------------------------------------
test.describe('Account rules: validation and roles', () => {
  const taken = [{ email: 'Existing.User@Example.com' }];

  test('name and email are required, and the messages say what to do', () => {
    const errors = validateAccount({ name: '   ', email: '', type: 'user', group: '' }, []);
    expect(errors.name).toMatch(/full name/i);
    expect(errors.email).toMatch(/enter an email/i);
  });

  test('email format: one @, no spaces, a dot in the domain', () => {
    for (const bad of ['plain', 'a@b', 'a b@example.com', '@example.com', 'a@@example.com']) {
      expect(validateAccount({ name: 'A', email: bad, type: 'user', group: '' }, []).email, bad).toMatch(/valid email/i);
    }
    expect(validateAccount({ name: 'A', email: 'ok@example.com', type: 'user', group: '' }, [])).toEqual({});
  });

  test('email must be unique, trimmed and case-insensitive', () => {
    expect(isEmailTaken('  EXISTING.user@example.COM ', taken)).toBe(true);
    expect(isEmailTaken('other@example.com', taken)).toBe(false);
    expect(validateAccount({ name: 'A', email: ' existing.user@example.com', type: 'user', group: '' }, taken).email).toMatch(/already exists/i);
    expect(normaliseEmail('  Ama@Example.COM ')).toBe('ama@example.com');
  });

  test('the name is trimmed and its inner spaces collapsed', () => {
    expect(normaliseName('  Ama    Boateng ')).toBe('Ama Boateng');
  });

  test('a User holds Support; an Admin holds the chosen group, or Admin Support; never Super Admin', () => {
    expect(rolesFor('user', '')).toEqual(['support']);
    expect(rolesFor('user', 'partnerships_officer')).toEqual(['support']); // a group means nothing for a User
    expect(rolesFor('admin', '')).toEqual(['admin_support']);
    expect(rolesFor('admin', 'partnerships_officer')).toEqual(['partnerships_officer']);
    expect(ADMIN_GROUPS).not.toContain('super_admin');
    expect(ADMIN_GROUPS).not.toContain('support');
  });

  test('a Super Admin cannot be created: the guard refuses the role and any other type', () => {
    expect(() => assertCreatable('admin', ['super_admin'])).toThrow(/Super Admin/);
    expect(() => assertCreatable('super_admin', ['admin_support'])).toThrow(/Only User and Admin/);
    expect(() => assertCreatable('admin', ['desk_lead'])).not.toThrow();
    expect(validateAccount({ name: 'A', email: 'a@example.com', type: 'admin', group: 'super_admin' as never }, []).group).toBeTruthy();
    expect(validateAccount({ name: 'A', email: 'a@example.com', type: 'super_admin' as never, group: '' }, []).type).toBeTruthy();
  });

  test('account type of an existing person (Super Admins have none)', () => {
    expect(accountTypeOf(person())).toBe('user');
    expect(accountTypeOf(person({ roles: ['desk_lead'] }))).toBe('admin');
    expect(accountTypeOf(person({ roles: ['support'], accountType: 'admin' }))).toBe('admin');
    expect(accountTypeOf(person({ roles: ['super_admin'] }))).toBeNull();
  });
});

test.describe('Account rules: self, last Super Admin, state, invite', () => {
  const boss = person({ id: 'sa1', roles: ['super_admin'], name: 'Boss One' });
  const boss2 = person({ id: 'sa2', roles: ['super_admin'], name: 'Boss Two' });
  const staff = person({ id: 'u1' });

  test('nobody can deactivate themselves', () => {
    const verdict = canDeactivate(staff, [boss, staff], 'u1');
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/your own account/i);
  });

  test('the last active Super Admin cannot be deactivated, but one of two can', () => {
    const last = canDeactivate(boss, [boss, staff], 'u1');
    expect(last.allowed).toBe(false);
    expect(last.reason).toMatch(/last Super Admin/i);
    expect(canDeactivate(boss, [boss, boss2, staff], 'u1').allowed).toBe(true);
    // an inactive Super Admin does not count as a second one
    expect(canDeactivate(boss, [boss, person({ id: 'sa3', roles: ['super_admin'], status: 'deactivated' })], 'u1').allowed).toBe(false);
  });

  test('only an active account can be deactivated', () => {
    expect(canDeactivate(person({ status: 'invited' }), [], undefined).allowed).toBe(false);
    expect(canDeactivate(person({ status: 'deactivated' }), [], undefined).allowed).toBe(false);
  });

  test('role change: never yourself, never a Super Admin (the last one says so), never while deactivated', () => {
    expect(canChangeRole(staff, [staff], 'u1').reason).toMatch(/your own role/i);
    expect(canChangeRole(boss, [boss], 'x').reason).toMatch(/last Super Admin/i);
    expect(canChangeRole(boss, [boss, boss2], 'x').allowed).toBe(false);
    expect(canChangeRole(person({ status: 'deactivated' }), [], 'x').allowed).toBe(false);
    expect(canChangeRole(staff, [boss, staff], 'sa1').allowed).toBe(true);
  });

  test('an invite can be resent only while the account is Invited', () => {
    expect(canResend(person({ status: 'invited' })).allowed).toBe(true);
    expect(canResend(person({ status: 'active' })).allowed).toBe(false);
  });

  test('the invite lasts exactly 48 hours, is random, and only its last four characters are kept as a hint', () => {
    const now = new Date('2026-10-12T10:00:00.000Z');
    const a = makeInvite(now, 'https://admin.example.com');
    const b = makeInvite(now, 'https://admin.example.com');
    expect(INVITE_HOURS).toBe(48);
    expect(a.expiresAt).toBe('2026-10-14T10:00:00.000Z');
    expect(a.token).toMatch(/^[0-9a-f]{48}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.link).toBe(`https://admin.example.com/accept-invite?token=${a.token}`);
    expect(a.hint).toBe(a.token.slice(-4));
    expect(isInviteExpired(a.expiresAt, new Date('2026-10-14T09:59:59.000Z'))).toBe(false);
    expect(isInviteExpired(a.expiresAt, new Date('2026-10-14T10:00:00.000Z'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// UI (mock mode)
// ---------------------------------------------------------------------------------------------------------------------
const asRoles = (context: BrowserContext, roles: string) => context.addCookies([{ name: 'god_dev_roles', value: roles, url: BASE_URL }]);

const openTeam = async (page: Page, context: BrowserContext, roles = 'super_admin') => {
  await asRoles(context, roles);
  await page.goto(`${BASE_URL}/team`, { timeout: 30_000 });
  await expect(page.getByTestId('page-title')).toHaveText('Team');
  await expect(page.locator('main tbody tr').first()).toBeVisible();
};

const rowOf = (page: Page, text: string) => page.locator('main tbody tr').filter({ hasText: text });

/** Opens the form, fills it and presses Send invite. Returns the dialog. */
const createAccount = async (page: Page, { name, email, type = 'User', group }: { name: string; email: string; type?: 'User' | 'Admin'; group?: string }) => {
  await page.getByTestId('create-account-open').click();
  const dialog = page.getByTestId('create-account-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Full name').fill(name);
  await dialog.getByLabel('Email').fill(email);
  if (type === 'Admin') {
    await dialog.getByRole('radio', { name: 'Admin' }).click();
    if (group) {
      await dialog.getByRole('combobox', { name: 'Team / permission group' }).click();
      await page.getByRole('option', { name: new RegExp(`^${group}`) }).click();
    }
  }
  await dialog.getByTestId('create-account-submit').click();
  return dialog;
};

const closeInviteDialog = async (page: Page) => {
  const link = page.getByTestId('invite-link-dialog');
  await expect(link).toBeVisible();
  const text = (await link.getByTestId('invite-link-text').innerText()).trim();
  await link.getByTestId('invite-link-done').click();
  await expect(link).toBeHidden();
  return text;
};

const openMenu = async (page: Page, name: string) => {
  await page.getByRole('button', { name: `Account actions for ${name}` }).click();
  return page.getByRole('menu');
};

test.describe('Accounts: create (mock mode)', () => {
  test.skip(!MOCK_RUN, 'the Team page runs on sample data: see npm run test:e2e:mock');
  test.use({ viewport: { width: 1440, height: 900 } });

  test('a super admin creates a User: an invite link is shown once, the account is Invited (a word, not a colour) and holds Support', async ({ page, context }) => {
    await openTeam(page, context);
    const dialog = await createAccount(page, { name: 'Test User One', email: 'test.user.one@example.com' });
    await expect(dialog).toBeHidden();
    const link = await closeInviteDialog(page);
    expect(link).toMatch(/\/accept-invite\?token=[0-9a-f]{48}$/);
    const row = rowOf(page, 'test.user.one@example.com');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Test User One');
    await expect(row).toContainText('Support');
    await expect(row).toContainText('Invited');
    // the link is gone once the dialog is closed
    await expect(page.getByText(link)).toHaveCount(0);
  });

  test('a super admin creates an Admin: the optional group decides the role, Admin Support by default', async ({ page, context }) => {
    await openTeam(page, context);
    await createAccount(page, { name: 'Test Admin One', email: 'test.admin.one@example.com', type: 'Admin' });
    await closeInviteDialog(page);
    await expect(rowOf(page, 'test.admin.one@example.com')).toContainText('Admin Support');
    await expect(rowOf(page, 'test.admin.one@example.com')).toContainText('Invited');

    await createAccount(page, { name: 'Test Admin Two', email: 'test.admin.two@example.com', type: 'Admin', group: 'Partnerships Officer' });
    await closeInviteDialog(page);
    await expect(rowOf(page, 'test.admin.two@example.com')).toContainText('Partnerships Officer');
    await expect(rowOf(page, 'test.admin.two@example.com')).toContainText('Invited');
  });

  test('there is no password field anywhere in the flow, and Super Admin is not offered', async ({ page, context }) => {
    await openTeam(page, context);
    await page.getByTestId('create-account-open').click();
    const dialog = page.getByTestId('create-account-dialog');
    await expect(dialog.locator('input[type="password"]')).toHaveCount(0);
    await expect(dialog.getByLabel(/password/i)).toHaveCount(0);
    await expect(dialog.getByText(/set their own password/i).first()).toBeVisible();
    // the role choice: exactly User and Admin
    await expect(dialog.getByRole('radiogroup', { name: 'Account role' }).getByRole('radio')).toHaveText(['User', 'Admin']);
    // the group list (Admin only): no Super Admin
    await dialog.getByRole('radio', { name: 'Admin' }).click();
    await dialog.getByRole('combobox', { name: 'Team / permission group' }).click();
    const options = await page.getByRole('option').allInnerTexts();
    expect(options.length).toBeGreaterThan(3);
    expect(options.join(' ')).not.toMatch(/Super Admin/);
    await page.keyboard.press('Escape');
  });

  test('the status line says Invited, then Active once they accept', async ({ page, context }) => {
    await openTeam(page, context);
    await page.getByTestId('create-account-open').click();
    const status = page.getByTestId('create-account-status');
    await expect(status).toContainText('Invited');
    await expect(status).toContainText('becomes Active when the person accepts');
    await expect(status).toContainText('48 hours');
  });

  test('validation: required fields, a bad email, and the first invalid field takes focus', async ({ page, context }) => {
    await openTeam(page, context);
    await page.getByTestId('create-account-open').click();
    const dialog = page.getByTestId('create-account-dialog');
    await dialog.getByTestId('create-account-submit').click();
    await expect(dialog.getByText("Enter the person's full name.")).toBeVisible();
    await expect(dialog.getByText('Enter an email address.')).toBeVisible();
    await expect(dialog.getByLabel('Full name')).toBeFocused();
    await dialog.getByLabel('Full name').fill('Test Person');
    await dialog.getByLabel('Email').fill('not an email');
    await expect(dialog.getByText('Enter a valid email address, like name@company.com.')).toBeVisible();
    await expect(dialog.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true'); // not only a red border
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  });

  test('a duplicate email is rejected, whatever the capitals or spaces, and no second row appears', async ({ page, context }) => {
    await openTeam(page, context);
    await createAccount(page, { name: 'Test Dup One', email: 'test.dup@example.com' });
    await closeInviteDialog(page);
    const dialog = await createAccount(page, { name: 'Test Dup Two', email: '  TEST.Dup@Example.com ' });
    await expect(dialog).toBeVisible(); // still open
    await expect(dialog.getByText('An account with this email already exists.')).toBeVisible();
    await expect(page.getByTestId('invite-link-dialog')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(rowOf(page, 'test.dup@example.com')).toHaveCount(1);
    await expect(rowOf(page, 'Test Dup Two')).toHaveCount(0);
  });

  test('the name is trimmed and its extra spaces collapsed; the email is saved in lowercase', async ({ page, context }) => {
    await openTeam(page, context);
    await createAccount(page, { name: '   Ama    Test  ', email: 'AMA.Test@Example.com' });
    await closeInviteDialog(page);
    const row = rowOf(page, 'ama.test@example.com');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Ama Test');
  });
});

test.describe('Accounts: row actions and history (mock mode)', () => {
  test.skip(!MOCK_RUN, 'the Team page runs on sample data: see npm run test:e2e:mock');
  test.use({ viewport: { width: 1440, height: 900 } });

  test('Resend invite exists only for Invited accounts, makes a NEW link, and the old link is not shown again', async ({ page, context }) => {
    await openTeam(page, context);
    await createAccount(page, { name: 'Test Resend', email: 'test.resend@example.com' });
    const first = await closeInviteDialog(page);
    const menu = await openMenu(page, 'Test Resend');
    await menu.getByRole('menuitem', { name: 'Resend invite' }).click();
    const second = await closeInviteDialog(page);
    expect(second).toMatch(/accept-invite\?token=/);
    expect(second).not.toBe(first);
    // an Active account has no Resend invite
    const active = await openMenu(page, 'Yaw Antwi');
    await expect(active.getByRole('menuitem', { name: 'Resend invite' })).toHaveCount(0);
    await page.keyboard.press('Escape');
  });

  test('Deactivate asks first, the chip says Deactivated, and Reactivate brings it back to Active', async ({ page, context }) => {
    await openTeam(page, context);
    const row = rowOf(page, 'Yaw Antwi');
    await expect(row).toContainText('Active');
    let menu = await openMenu(page, 'Yaw Antwi');
    await menu.getByRole('menuitem', { name: 'Deactivate' }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText('Yaw Antwi');
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(row).toContainText('Active'); // cancelled: nothing changed
    menu = await openMenu(page, 'Yaw Antwi');
    await menu.getByRole('menuitem', { name: 'Deactivate' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Deactivate account' }).click();
    await expect(row).toContainText('Deactivated');
    menu = await openMenu(page, 'Yaw Antwi');
    await expect(menu.getByRole('menuitem', { name: 'Deactivate' })).toHaveCount(0);
    await menu.getByRole('menuitem', { name: 'Reactivate', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Reactivate account' }).click();
    await expect(row).toContainText('Active');
  });

  test('Change role (User <-> Admin) asks first and changes the role shown', async ({ page, context }) => {
    await openTeam(page, context);
    await createAccount(page, { name: 'Test Switch', email: 'test.switch@example.com' });
    await closeInviteDialog(page);
    const row = rowOf(page, 'test.switch@example.com');
    await expect(row).toContainText('Support');
    let menu = await openMenu(page, 'Test Switch');
    await menu.getByRole('menuitem', { name: 'Make Admin' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('Test Switch');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Make Admin' }).click();
    await expect(row).toContainText('Admin Support');
    menu = await openMenu(page, 'Test Switch');
    await menu.getByRole('menuitem', { name: 'Make User' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Make User' }).click();
    await expect(row).toContainText('Support');
    await expect(row).not.toContainText('Admin Support');
  });

  test('you cannot deactivate or demote yourself: the items are disabled and say why', async ({ page, context }) => {
    await openTeam(page, context);
    const menu = await openMenu(page, 'Esi Mensah-Owusu'); // the signed-in person in the sample data
    await expect(menu.getByRole('menuitem', { name: /Deactivate/ })).toBeDisabled();
    await expect(menu).toContainText('You cannot deactivate your own account.');
    await expect(menu.getByRole('menuitem', { name: /Make User/ })).toBeDisabled();
    await expect(menu).toContainText('You cannot change your own role.');
  });

  test('the last Super Admin cannot be deactivated or demoted', async ({ page, context }) => {
    await openTeam(page, context);
    const menu = await openMenu(page, 'Nana Adjei'); // the only Super Admin in the sample data
    await expect(menu.getByRole('menuitem', { name: /Deactivate/ })).toBeDisabled();
    await expect(menu).toContainText('This is the last Super Admin.');
    await expect(menu.getByRole('menuitem', { name: /Make (Admin|User)/ })).toHaveCount(0); // a Super Admin has no role switch here
  });

  test('every create, resend, role change, deactivate and reactivate is in the history, with who and what, and never the invite token', async ({ page, context }) => {
    await openTeam(page, context);
    await createAccount(page, { name: 'Test Audit', email: 'test.audit@example.com' });
    const firstLink = await closeInviteDialog(page);
    let menu = await openMenu(page, 'Test Audit');
    await menu.getByRole('menuitem', { name: 'Resend invite' }).click();
    const secondLink = await closeInviteDialog(page);
    menu = await openMenu(page, 'Test Audit');
    await menu.getByRole('menuitem', { name: 'Make Admin' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Make Admin' }).click();
    // Deactivate and Reactivate need an Active account: use a seeded one
    menu = await openMenu(page, 'Yaw Antwi');
    await menu.getByRole('menuitem', { name: 'Deactivate' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Deactivate account' }).click();
    menu = await openMenu(page, 'Yaw Antwi');
    await menu.getByRole('menuitem', { name: 'Reactivate', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Reactivate account' }).click();

    await page.getByTestId('account-history-open').click();
    const history = page.getByTestId('history-dialog');
    const entries = history.getByTestId('history-entry');
    await expect(entries).toHaveCount(5);
    await expect(entries.nth(0)).toContainText('Reactivated Yaw Antwi');
    await expect(entries.nth(1)).toContainText('Deactivated Yaw Antwi');
    await expect(entries.nth(2)).toContainText('Changed Test Audit from User to Admin');
    await expect(entries.nth(3)).toContainText('Resent the invite to Test Audit');
    await expect(entries.nth(4)).toContainText('Created User account for Test Audit (invited)');
    await expect(entries.nth(4)).toContainText('test.audit@example.com');
    for (const index of [0, 1, 2, 3, 4]) await expect(entries.nth(index)).toContainText('Super Admin'); // who: the role used
    // never the token or the link: not even a part of it
    const text = await history.innerText();
    for (const link of [firstLink, secondLink]) {
      const token = link.split('token=')[1];
      expect(text).not.toContain(token);
      expect(text).not.toContain(token.slice(0, 12));
      expect(text).not.toContain('accept-invite');
    }
    // only the last four characters are kept, to tell two invites apart
    expect(text).toContain(firstLink.slice(-4));
    // the ambassador import/export history does not show account entries
    await history.getByRole('button', { name: 'Close Account history' }).click();
  });
});

test.describe('Accounts: access (mock mode)', () => {
  test.skip(!MOCK_RUN, 'the Team page runs on sample data: see npm run test:e2e:mock');
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const roles of ['admin_support', 'desk_lead']) {
    test(`${roles}: no Create account, no Account history and no row menu (the Team page itself opens)`, async ({ page, context }) => {
      await openTeam(page, context, roles);
      await expect(page.getByTestId('create-account-open')).toHaveCount(0);
      await expect(page.getByTestId('account-history-open')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^Account actions for / })).toHaveCount(0);
      // SEC-134: the older invite flow gives roles too, so it is Super Admin only as well.
      await expect(page.getByRole('link', { name: 'Invite Staff' })).toHaveCount(0);
    });
  }

  test('super_admin: has Create account, Account history and a row menu on every row', async ({ page, context }) => {
    await openTeam(page, context);
    await expect(page.getByTestId('create-account-open')).toBeVisible();
    await expect(page.getByTestId('account-history-open')).toBeVisible();
    expect(await page.getByRole('button', { name: /^Account actions for / }).count()).toBe(await page.getByTestId('table-row').count());
  });

  test('the page logic refuses too: if the role changes while the form is open, sending it creates nothing', async ({ page, context }) => {
    await openTeam(page, context);
    const before = await page.getByTestId('table-row').count();
    await page.getByTestId('create-account-open').click();
    const dialog = page.getByTestId('create-account-dialog');
    await dialog.getByLabel('Full name').fill('Test Refused');
    await dialog.getByLabel('Email').fill('test.refused@example.com');
    // switch to Admin Support through the dev role switcher (plain events: the open dialog covers the top bar)
    await page.getByRole('button', { name: /Account menu/ }).dispatchEvent('click');
    await page.getByRole('menuitemcheckbox', { name: 'Admin Support', exact: true }).dispatchEvent('click');
    await page.getByRole('menuitemcheckbox', { name: 'Super Admin', exact: true }).dispatchEvent('click'); // leaves Admin Support only
    await expect(page.getByTestId('viewing-as')).toContainText('Viewing as Admin Support');
    await dialog.getByTestId('create-account-submit').dispatchEvent('click');
    await expect(page.getByTestId('toast').filter({ hasText: 'Your role cannot create or manage accounts.' })).toBeVisible();
    await expect(dialog.getByTestId('create-account-problem')).toContainText('Your role cannot create or manage accounts.');
    await expect(page.getByTestId('invite-link-dialog')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Cancel' }).dispatchEvent('click');
    await expect(page.getByTestId('create-account-open')).toHaveCount(0); // the button is gone for this role
    expect(await page.getByTestId('table-row').count()).toBe(before);
    await expect(rowOf(page, 'test.refused@example.com')).toHaveCount(0);
  });

  test('the permission is on the Roles matrix as "Accounts: create", edit for the Super Admin only', async ({ page, context }) => {
    await asRoles(context, 'super_admin');
    await page.goto(`${BASE_URL}/team?tab=roles`, { timeout: 30_000 });
    const row = page.locator('tbody tr').filter({ has: page.getByRole('rowheader', { name: 'Accounts: create' }) });
    await expect(row).toHaveCount(1);
    await expect(row.locator('td[data-level="edit"]')).toHaveCount(1); // super_admin only (desk_lead has every other screen, not this one)
    await expect(row.locator('td[data-level="view"]')).toHaveCount(0);
  });

  test('phones (434px): the form and the invite link fit, nothing is wider than the viewport, and there are no console errors', async ({ page, context }) => {
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) problems.push(message.text());
    });
    await page.setViewportSize({ width: 434, height: 900 });
    await openTeam(page, context);
    await page.getByTestId('create-account-open').click();
    const form = page.getByTestId('create-account-dialog');
    expect((await form.boundingBox())!.width).toBeLessThanOrEqual(434);
    await form.getByLabel('Full name').fill('Test Phone');
    await form.getByLabel('Email').fill('test.phone@example.com');
    await form.getByTestId('create-account-submit').click();
    const link = page.getByTestId('invite-link-dialog');
    await expect(link).toBeVisible();
    expect((await link.boundingBox())!.width).toBeLessThanOrEqual(434);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(problems).toEqual([]);
  });
});
