/**
 * Showcase (/showcase): the people and organisations featured on the app's "Meet our people" page.
 *
 * Two kinds of test:
 *  - "rules" tests need no browser: they call the pure functions in src/lib/showcase.ts (validation, ordering, category deletion
 *    rules, who may edit which category, what the app shows);
 *  - "UI" tests drive the page in MOCK MODE (npm run test:e2e:mock): add with a photo upload, edit, hide and show, order, delete,
 *    categories (including a custom "Developers"), the preview, the audit history and the permission gate for each role;
 *  - "real API" tests (npm run test:e2e, BE-030) save entries and categories on the server, read them back after a reload, check
 *    the server-written History, and show that a refused change leaves everything as it was.
 *
 * ALL DATA IS FAKE (names such as "Test Ambassador One", a one-pixel picture made in the test). No real person is in this file.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { MOCK_RUN, defaultBaseUrl } from './mode';
import {
  BIO_MAX, appView, canDeleteCategory, canEditCategory, entriesOf, moveCategory, moveEntry, nextEntryOrder, validateCategory, validateEntry,
} from '../src/lib/showcase';
import type { ShowcaseCategory, ShowcaseEntry } from '../src/lib/mock-entities';

const BASE_URL = defaultBaseUrl();
const API_URL = process.env.E2E_API_URL || 'http://localhost:4000/api';

/** A real one-pixel PNG, so the upload is an actual image file. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const category = (over: Partial<ShowcaseCategory> = {}): ShowcaseCategory => ({ id: 'c1', key: 'custom', name: 'Developers', kind: 'person', order: 1, visible: true, ...over });
const entry = (over: Partial<ShowcaseEntry> = {}): ShowcaseEntry => ({
  id: 'e1', categoryId: 'c1', name: 'Test Person', title: 'Developer', bio: '', visible: true, order: 1, createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-01T09:00:00.000Z', ...over,
});

// ---------------------------------------------------------------------------------------------------------------------
// Rules (no browser)
// ---------------------------------------------------------------------------------------------------------------------
test.describe('Showcase rules: validation', () => {
  const cats = [category()];
  const valid = { categoryId: 'c1', name: 'Test Person', title: 'Developer', bio: '', country: '', providedBy: '', visible: true };

  test('name, role and category are required, and the messages say what to do', () => {
    const errors = validateEntry({ ...valid, name: '   ', title: '', categoryId: 'nope' }, cats);
    expect(errors.name).toMatch(/enter the name/i);
    expect(errors.title).toMatch(/role or what they do/i);
    expect(errors.categoryId).toMatch(/choose a category/i);
    expect(validateEntry(valid, cats)).toEqual({});
  });

  test('the bio may be 400 characters and not one more; the name and title have limits too', () => {
    expect(validateEntry({ ...valid, bio: 'x'.repeat(BIO_MAX) }, cats)).toEqual({});
    expect(validateEntry({ ...valid, bio: 'x'.repeat(BIO_MAX + 1) }, cats).bio).toMatch(/limit is 400/);
    expect(validateEntry({ ...valid, name: 'n'.repeat(81) }, cats).name).toMatch(/80/);
    expect(validateEntry({ ...valid, title: 't'.repeat(101) }, cats).title).toMatch(/100/);
  });

  test('a category name is required, short, and unique (trimmed, any capitals); a rename may keep its own name', () => {
    const existing = [category({ id: 'a', name: 'Developers' }), category({ id: 'b', name: 'Partners', key: 'partners' })];
    expect(validateCategory('  ', 'person', existing).name).toMatch(/enter a name/i);
    expect(validateCategory('  DEVELOPERS ', 'person', existing).name).toMatch(/already exists/i);
    expect(validateCategory('Developers', 'person', existing, 'a')).toEqual({}); // renaming itself
    expect(validateCategory('x'.repeat(41), 'person', existing).name).toMatch(/40/);
    expect(validateCategory('Mentors', 'banana', existing).kind).toBeTruthy();
    expect(validateCategory('Mentors', 'organisation', existing)).toEqual({});
  });
});

test.describe('Showcase rules: order, categories, access and what the app shows', () => {
  test('moving an entry swaps it with its neighbour inside its category and renumbers 1..n', () => {
    const rows = [entry({ id: 'a', order: 1 }), entry({ id: 'b', order: 2 }), entry({ id: 'c', order: 3 }), entry({ id: 'x', categoryId: 'c2', order: 1 })];
    const down = moveEntry(rows, 'a', 'down');
    expect(entriesOf(down, 'c1').map((row) => row.id)).toEqual(['b', 'a', 'c']);
    expect(entriesOf(down, 'c1').map((row) => row.order)).toEqual([1, 2, 3]);
    expect(entriesOf(down, 'c2').map((row) => row.order)).toEqual([1]); // another category is untouched
    expect(entriesOf(moveEntry(rows, 'a', 'up'), 'c1').map((row) => row.id)).toEqual(['a', 'b', 'c']); // first cannot go up
    expect(entriesOf(moveEntry(rows, 'c', 'down'), 'c1').map((row) => row.id)).toEqual(['a', 'b', 'c']); // last cannot go down
    expect(nextEntryOrder(rows, 'c1')).toBe(4);
    expect(nextEntryOrder(rows, 'new')).toBe(1);
  });

  test('moving a category swaps its place', () => {
    const rows = [category({ id: 'a', order: 1 }), category({ id: 'b', order: 2 }), category({ id: 'c', order: 3 })];
    expect(moveCategory(rows, 'c', 'up').sort((x, y) => x.order - y.order).map((row) => row.id)).toEqual(['a', 'c', 'b']);
    expect(moveCategory(rows, 'a', 'up').map((row) => row.order)).toEqual([1, 2, 3]);
  });

  test('only an empty custom category can be deleted; the four built-in ones never can', () => {
    expect(canDeleteCategory(category({ key: 'partners' }), []).allowed).toBe(false);
    expect(canDeleteCategory(category({ key: 'partners' }), []).reason).toMatch(/built-in/i);
    expect(canDeleteCategory(category(), [entry()]).reason).toMatch(/1 entry/);
    expect(canDeleteCategory(category(), [entry(), entry({ id: 'e2' })]).reason).toMatch(/2 entries/);
    expect(canDeleteCategory(category(), []).allowed).toBe(true);
  });

  test('who may edit which category: editors every one, the Country Lead Ambassadors only, the Partnerships Officer Partners only', () => {
    const grants = (list: string[]) => (screen: string, level: string) => list.includes(`${screen}:${level}`);
    const editor = grants(['showcase:edit']);
    const countryLead = grants(['showcase:view', 'showcase.ambassadors:edit']);
    const partnerships = grants(['showcase:view', 'showcase.partners:edit']);
    const nobody = grants([]);
    const keys = ['ambassadors', 'team', 'partners', 'stakeholders', 'custom'] as const;
    for (const key of keys) expect(canEditCategory(editor as never, { key }), `editor ${key}`).toBe(true);
    expect(keys.filter((key) => canEditCategory(countryLead as never, { key }))).toEqual(['ambassadors']);
    expect(keys.filter((key) => canEditCategory(partnerships as never, { key }))).toEqual(['partners']);
    expect(keys.filter((key) => canEditCategory(nobody as never, { key }))).toEqual([]);
  });

  test('the app shows visible categories in order, with visible entries in order, and leaves out the empty ones', () => {
    const cats = [category({ id: 'b', name: 'B', order: 2 }), category({ id: 'a', name: 'A', order: 1 }), category({ id: 'h', name: 'Hidden cat', order: 3, visible: false }), category({ id: 'e', name: 'Empty', order: 4 })];
    const rows = [
      entry({ id: '1', categoryId: 'b', order: 2, name: 'B2' }),
      entry({ id: '2', categoryId: 'b', order: 1, name: 'B1' }),
      entry({ id: '3', categoryId: 'a', order: 1, name: 'A1', visible: false }),
      entry({ id: '4', categoryId: 'a', order: 2, name: 'A2' }),
      entry({ id: '5', categoryId: 'h', order: 1, name: 'H1' }),
    ];
    const view = appView(cats, rows);
    expect(view.map((group) => group.category.name)).toEqual(['A', 'B']);
    expect(view[0].entries.map((row) => row.name)).toEqual(['A2']); // the hidden one is not shown
    expect(view[1].entries.map((row) => row.name)).toEqual(['B1', 'B2']);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// UI (mock mode)
// ---------------------------------------------------------------------------------------------------------------------
const asRoles = (context: BrowserContext, roles: string) => context.addCookies([{ name: 'god_dev_roles', value: roles, url: BASE_URL }]);

const openShowcase = async (page: Page, context: BrowserContext, roles = 'super_admin') => {
  await asRoles(context, roles);
  await page.goto(`${BASE_URL}/showcase`, { timeout: 30_000 });
  await expect(page.getByTestId('page-title')).toHaveText('Showcase');
  await expect(page.locator('[role=tabpanel]:not([hidden]) [data-testid=table-row]').first()).toBeVisible();
};

const rows = (page: Page) => page.locator('[role=tabpanel]:not([hidden]) [data-testid=table-row]');
const rowOf = (page: Page, text: string) => rows(page).filter({ hasText: text });

const openMenu = async (page: Page, label: string) => {
  await page.getByRole('button', { name: label }).click();
  return page.getByRole('menu');
};

interface NewEntry {
  category?: string;
  name: string;
  title: string;
  bio?: string;
  country?: string;
  photo?: boolean;
  providedBy?: string;
  visible?: boolean;
}

const addEntry = async (page: Page, input: NewEntry) => {
  await page.getByTestId('showcase-add').click();
  const dialog = page.getByTestId('showcase-entry-dialog');
  await expect(dialog).toBeVisible();
  if (input.category) {
    await dialog.getByRole('combobox', { name: 'Category' }).click();
    await page.getByRole('option', { name: new RegExp(`^${input.category}`) }).click();
  }
  await dialog.getByLabel('Name', { exact: true }).fill(input.name);
  await dialog.getByLabel('Role or what they do').fill(input.title);
  if (input.bio !== undefined) await dialog.getByLabel('Short bio').fill(input.bio);
  if (input.country) await dialog.getByLabel('Country').fill(input.country);
  if (input.providedBy) await dialog.getByLabel('Provided by').fill(input.providedBy);
  if (input.photo) await dialog.locator('input[type="file"]').setInputFiles({ name: 'test-photo.png', mimeType: 'image/png', buffer: PNG });
  if (input.visible === false) await dialog.getByRole('switch', { name: 'Show on the app' }).click();
  await dialog.getByTestId('showcase-entry-save').click();
  return dialog;
};

test.describe('Showcase: entries (mock mode)', () => {
  test.skip(!MOCK_RUN, 'the Showcase page runs on sample data: see npm run test:e2e:mock');
  test.use({ viewport: { width: 1440, height: 900 } });

  test('the list shows the featured people with their category and a Visible or Hidden word; filter and search work', async ({ page, context }) => {
    await openShowcase(page, context);
    await expect(rowOf(page, 'Test Ambassador One')).toContainText('Ambassadors');
    await expect(rowOf(page, 'Test Ambassador One')).toContainText('Visible');
    await expect(rowOf(page, 'Test Ambassador Three')).toContainText('Hidden'); // a word, not only a colour
    await page.getByRole('radio', { name: /^Partners/ }).click();
    await expect(rows(page)).toHaveCount(2);
    await expect(rowOf(page, 'Example Partner Foundation')).toBeVisible();
    await page.getByRole('radio', { name: /^All/ }).click();
    await page.getByLabel('Search the showcase').fill('developer');
    await expect(rows(page)).toHaveCount(1);
    await expect(rowOf(page, 'Test Developer One')).toBeVisible();
  });

  test('add an entry with a photo upload: it appears with its picture, Visible, in its category, and the toast says it is on the app', async ({ page, context }) => {
    await openShowcase(page, context);
    const dialog = await addEntry(page, { category: 'Team', name: 'Test Designer', title: 'Designer', bio: 'Designs the app screens.', country: 'Ghana', photo: true, providedBy: 'Sent by the person by email' });
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('toast').filter({ hasText: 'Test Designer was added and is on the app.' })).toBeVisible();
    await page.getByLabel('Search the showcase').fill('Test Designer');
    const row = rowOf(page, 'Test Designer');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Team');
    await expect(row).toContainText('Visible');
    await expect(row.locator('img')).toHaveCount(1); // the uploaded picture, not the initials
    expect(await row.locator('img').evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBe(1);
  });

  test('a picture that is not an image is refused with a message', async ({ page, context }) => {
    await openShowcase(page, context);
    await page.getByTestId('showcase-add').click();
    const dialog = page.getByTestId('showcase-entry-dialog');
    await dialog.locator('input[type="file"]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await expect(dialog.getByText('That file is not an image.')).toBeVisible();
  });

  test('"Start from an existing record" fills the form from an ambassador, and the person is not offered twice', async ({ page, context }) => {
    await openShowcase(page, context);
    await page.getByTestId('showcase-add').click();
    const dialog = page.getByTestId('showcase-entry-dialog');
    await dialog.getByRole('combobox', { name: 'Start from an existing record' }).click();
    const options = await page.getByRole('option').allInnerTexts();
    expect(options.length).toBeGreaterThan(1);
    await page.getByRole('option').nth(1).click(); // the first real record, after "Type it in"
    const name = await dialog.getByLabel('Name', { exact: true }).inputValue();
    expect(name.length).toBeGreaterThan(2);
    await dialog.getByTestId('showcase-entry-save').click();
    await expect(dialog).toBeHidden();
    // opening the form again no longer lists that person
    await page.getByTestId('showcase-add').click();
    await page.getByTestId('showcase-entry-dialog').getByRole('combobox', { name: 'Start from an existing record' }).click();
    expect(await page.getByRole('option').allInnerTexts()).not.toContainEqual(expect.stringContaining(name));
    await page.keyboard.press('Escape');
  });

  test('validation: name and role are required, the bio has a limit, errors are text, and the first invalid field takes focus', async ({ page, context }) => {
    await openShowcase(page, context);
    await page.getByTestId('showcase-add').click();
    const dialog = page.getByTestId('showcase-entry-dialog');
    await dialog.getByTestId('showcase-entry-save').click();
    await expect(dialog.getByText('Enter the name.')).toBeVisible();
    await expect(dialog.getByText('Enter the role or what they do.')).toBeVisible();
    await expect(dialog.getByLabel('Name', { exact: true })).toBeFocused();
    await expect(dialog.getByLabel('Name', { exact: true })).toHaveAttribute('aria-invalid', 'true'); // not only a red border
    await dialog.getByLabel('Name', { exact: true }).fill('Test Long Bio');
    await dialog.getByLabel('Role or what they do').fill('Tester');
    await dialog.getByLabel('Short bio').fill('x'.repeat(401));
    await dialog.getByTestId('showcase-entry-save').click();
    await expect(dialog.getByText('The bio is 401 characters. The limit is 400.')).toBeVisible();
    await expect(dialog).toBeVisible(); // nothing was saved
    await dialog.getByLabel('Short bio').fill('x'.repeat(400));
    await dialog.getByTestId('showcase-entry-save').click();
    await expect(dialog).toBeHidden();
  });

  test('edit changes the entry; hide and show flip the word and the toast; the preview follows', async ({ page, context }) => {
    await openShowcase(page, context);
    let menu = await openMenu(page, 'Entry actions for Test Ambassador One');
    await menu.getByRole('menuitem', { name: 'Edit' }).click();
    const dialog = page.getByTestId('showcase-entry-dialog');
    await dialog.getByLabel('Role or what they do').fill('Regional Lead');
    await dialog.getByTestId('showcase-entry-save').click();
    await expect(rowOf(page, 'Test Ambassador One')).toContainText('Regional Lead');

    menu = await openMenu(page, 'Entry actions for Test Ambassador One');
    await menu.getByRole('menuitem', { name: 'Hide from the app' }).click();
    await expect(rowOf(page, 'Test Ambassador One')).toContainText('Hidden');
    await page.getByTestId('showcase-preview-open').click();
    const preview = page.getByTestId('showcase-preview');
    await expect(preview.getByTestId('preview-entry').filter({ hasText: 'Test Ambassador One' })).toHaveCount(0); // hidden: not on the app
    await expect(preview.getByTestId('preview-entry').filter({ hasText: 'Test Ambassador Two' })).toHaveCount(1);
    await expect(preview.getByTestId('preview-entry').filter({ hasText: 'Test Ambassador Three' })).toHaveCount(0); // hidden in the seed
    await preview.getByRole('button', { name: 'Close Preview on the app' }).click();

    menu = await openMenu(page, 'Entry actions for Test Ambassador One');
    await menu.getByRole('menuitem', { name: 'Show on the app' }).click();
    await expect(rowOf(page, 'Test Ambassador One')).toContainText('Visible');
  });

  test('a new entry can be saved Hidden, and then it is not in the preview', async ({ page, context }) => {
    await openShowcase(page, context);
    await addEntry(page, { category: 'Stakeholders', name: 'Test Quiet Person', title: 'Adviser', visible: false });
    await expect(page.getByTestId('toast').filter({ hasText: 'Test Quiet Person was added (hidden).' })).toBeVisible();
    await expect(rowOf(page, 'Test Quiet Person')).toContainText('Hidden');
    await page.getByTestId('showcase-preview-open').click();
    await expect(page.getByTestId('showcase-preview').getByText('Test Quiet Person')).toHaveCount(0);
  });

  test('order buttons move an entry inside its category, and the first and last cannot go further', async ({ page, context }) => {
    await openShowcase(page, context);
    await page.getByRole('radio', { name: /^Ambassadors/ }).click();
    await expect(rows(page).first()).toContainText('Test Ambassador One');
    await expect(page.getByRole('button', { name: 'Move Test Ambassador One up' })).toHaveAttribute('aria-disabled', 'true');
    await page.getByRole('button', { name: 'Move Test Ambassador One down' }).click();
    await expect(rows(page).first()).toContainText('Test Ambassador Two');
    await expect(rows(page).nth(1)).toContainText('Test Ambassador One');
    await page.getByRole('button', { name: 'Move Test Ambassador One up' }).click();
    await expect(rows(page).first()).toContainText('Test Ambassador One');
  });

  test('delete asks first; cancel keeps it; confirm removes it from the list and the preview', async ({ page, context }) => {
    await openShowcase(page, context);
    let menu = await openMenu(page, 'Entry actions for Test Developer One');
    await menu.getByRole('menuitem', { name: 'Delete' }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText('Test Developer One');
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(rowOf(page, 'Test Developer One')).toHaveCount(1);
    menu = await openMenu(page, 'Entry actions for Test Developer One');
    await menu.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete entry' }).click();
    await expect(rowOf(page, 'Test Developer One')).toHaveCount(0);
  });

  test('the history records each change with who and what, in order', async ({ page, context }) => {
    await openShowcase(page, context);
    await addEntry(page, { category: 'Team', name: 'Test History Person', title: 'Tester', photo: true });
    let menu = await openMenu(page, 'Entry actions for Test History Person');
    await menu.getByRole('menuitem', { name: 'Hide from the app' }).click();
    menu = await openMenu(page, 'Entry actions for Test History Person');
    await menu.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete entry' }).click();
    await page.getByTestId('showcase-history-open').click();
    const entries = page.getByTestId('history-dialog').getByTestId('history-entry');
    await expect(entries).toHaveCount(3);
    await expect(entries.nth(0)).toContainText('Deleted Test History Person from Team');
    await expect(entries.nth(1)).toContainText('Hid Test History Person');
    await expect(entries.nth(2)).toContainText('Added Test History Person to Team (visible)');
    await expect(entries.nth(2)).toContainText('hasPhoto');
    await expect(entries.nth(2)).toContainText('Super Admin'); // who: the role used
    // the ambassador import/export history does not show showcase entries
  });
});

test.describe('Showcase: categories (mock mode)', () => {
  test.skip(!MOCK_RUN, 'the Showcase page runs on sample data: see npm run test:e2e:mock');
  test.use({ viewport: { width: 1440, height: 900 } });

  test('a Super Admin adds a "Developers" category and features someone in it; the preview groups them under it', async ({ page, context }) => {
    await openShowcase(page, context);
    await page.getByRole('tab', { name: 'Categories' }).click();
    await page.getByTestId('showcase-add-category').click();
    const dialog = page.getByTestId('showcase-category-dialog');
    await dialog.getByRole('textbox', { name: 'Name' }).fill('Developers');
    await dialog.getByTestId('showcase-category-save').click();
    await expect(dialog).toBeHidden();
    await expect(rowOf(page, 'Developers')).toContainText('Visible');
    await page.getByRole('tab', { name: 'People and organisations' }).click();
    await addEntry(page, { category: 'Developers', name: 'Test Developer Two', title: 'Mobile developer', photo: true });
    await page.getByTestId('showcase-preview-open').click();
    const group = page.getByTestId('showcase-preview').getByTestId('preview-group').filter({ hasText: 'Developers' });
    await expect(group).toHaveCount(1);
    await expect(group).toContainText('Test Developer Two');
  });

  test('category validation: the name is required and must be unique, whatever the capitals', async ({ page, context }) => {
    await openShowcase(page, context);
    await page.getByRole('tab', { name: 'Categories' }).click();
    await page.getByTestId('showcase-add-category').click();
    const dialog = page.getByTestId('showcase-category-dialog');
    await dialog.getByTestId('showcase-category-save').click();
    await expect(dialog.getByText('Enter a name for the category.')).toBeVisible();
    await dialog.getByRole('textbox', { name: 'Name' }).fill('  partners ');
    await dialog.getByTestId('showcase-category-save').click();
    await expect(dialog.getByText('A category with this name already exists.')).toBeVisible();
  });

  test('rename, reorder, hide and delete: a built-in category cannot be deleted, a custom one with entries cannot either, an empty one can', async ({ page, context }) => {
    await openShowcase(page, context);
    await page.getByRole('tab', { name: 'Categories' }).click();
    // built-in: Delete is disabled with a reason
    let menu = await openMenu(page, 'Category actions for Partners');
    await expect(menu.getByRole('menuitem', { name: /Delete/ })).toBeDisabled();
    await expect(menu).toContainText('The built-in categories cannot be deleted.');
    await page.keyboard.press('Escape');
    // a custom category: add, fill, try to delete, empty, delete
    await page.getByTestId('showcase-add-category').click();
    await page.getByTestId('showcase-category-dialog').getByRole('textbox', { name: 'Name' }).fill('Mentors');
    await page.getByTestId('showcase-category-save').click();
    await page.getByRole('tab', { name: 'People and organisations' }).click();
    await addEntry(page, { category: 'Mentors', name: 'Test Mentor', title: 'Mentor' });
    await page.getByRole('tab', { name: 'Categories' }).click();
    menu = await openMenu(page, 'Category actions for Mentors');
    await expect(menu.getByRole('menuitem', { name: /Delete/ })).toBeDisabled();
    await expect(menu).toContainText('Move or delete its 1 entry first.');
    // rename
    await menu.getByRole('menuitem', { name: 'Rename' }).click();
    await page.getByTestId('showcase-category-dialog').getByRole('textbox', { name: 'Name' }).fill('Mentors and coaches');
    await page.getByTestId('showcase-category-save').click();
    await expect(rowOf(page, 'Mentors and coaches')).toHaveCount(1);
    // hide: the preview loses the whole category
    menu = await openMenu(page, 'Category actions for Mentors and coaches');
    await menu.getByRole('menuitem', { name: 'Hide from the app' }).click();
    await expect(rowOf(page, 'Mentors and coaches')).toContainText('Hidden');
    await page.getByTestId('showcase-preview-open').click();
    await expect(page.getByTestId('showcase-preview').getByText('Test Mentor')).toHaveCount(0);
    await page.getByTestId('showcase-preview').getByRole('button', { name: 'Close Preview on the app' }).click();
    // reorder
    await page.getByRole('button', { name: 'Move Mentors and coaches up' }).click();
    // delete the entry, then the category
    await page.getByRole('tab', { name: 'People and organisations' }).click();
    menu = await openMenu(page, 'Entry actions for Test Mentor');
    await menu.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete entry' }).click();
    await page.getByRole('tab', { name: 'Categories' }).click();
    menu = await openMenu(page, 'Category actions for Mentors and coaches');
    await menu.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete category' }).click();
    await expect(rowOf(page, 'Mentors and coaches')).toHaveCount(0);
  });
});

test.describe('Showcase: access (mock mode)', () => {
  test.skip(!MOCK_RUN, 'the Showcase page runs on sample data: see npm run test:e2e:mock');
  test.use({ viewport: { width: 1440, height: 900 } });

  test('Communications Officer edits every category and publishes directly, but has no Categories tab', async ({ page, context }) => {
    await openShowcase(page, context, 'communications_officer');
    await expect(page.getByTestId('showcase-add')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Categories' })).toHaveCount(0);
    await addEntry(page, { category: 'Partners', name: 'Example Comms Partner', title: 'Sponsor' });
    await expect(page.getByTestId('toast').filter({ hasText: 'was added and is on the app.' })).toBeVisible(); // direct publishing, no approval step
    await expect(rowOf(page, 'Example Comms Partner')).toContainText('Visible');
  });

  test('Country Lead can open the page but edits Ambassadors only: the form offers one category and other rows have no actions', async ({ page, context }) => {
    await openShowcase(page, context, 'country_lead');
    await expect(page.getByRole('tab', { name: 'Categories' })).toHaveCount(0);
    await page.getByTestId('showcase-add').click();
    const dialog = page.getByTestId('showcase-entry-dialog');
    await dialog.getByRole('combobox', { name: 'Category' }).click();
    expect(await page.getByRole('option').allInnerTexts()).toEqual(['Ambassadors']);
    await page.getByRole('option', { name: 'Ambassadors' }).click(); // Esc would close the whole form
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('button', { name: 'Entry actions for Test Ambassador One' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entry actions for Example Partner Foundation' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Entry actions for Test Developer One' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Move Example Partner Foundation up' })).toHaveCount(0);
    await expect(page.getByTestId('showcase-preview-open')).toBeVisible(); // anyone who can open the page can preview
  });

  test('Partnerships Officer edits Partners only', async ({ page, context }) => {
    await openShowcase(page, context, 'partnerships_officer');
    await page.getByTestId('showcase-add').click();
    const dialog = page.getByTestId('showcase-entry-dialog');
    await dialog.getByRole('combobox', { name: 'Category' }).click();
    expect(await page.getByRole('option').allInnerTexts()).toEqual(['Partners']);
    await page.getByRole('option', { name: 'Partners' }).click(); // Esc would close the whole form
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('button', { name: 'Entry actions for Example Partner Foundation' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entry actions for Test Ambassador One' })).toHaveCount(0);
  });

  for (const roles of ['moderator', 'support', 'database_officer']) {
    test(`${roles}: no Showcase in the sidebar, and the page itself says there is no access`, async ({ page, context }) => {
      await asRoles(context, roles);
      await page.goto(`${BASE_URL}/showcase`, { timeout: 30_000 });
      await expect(page.getByTestId('no-access')).toBeVisible();
      await expect(page.getByTestId('showcase-add')).toHaveCount(0);
      await expect(page.getByTestId('nav-item-showcase')).toHaveCount(0);
    });
  }

  test('the page logic refuses too: if the role changes while the form is open, saving into a category it may no longer edit creates nothing', async ({ page, context }) => {
    await openShowcase(page, context);
    await page.getByTestId('showcase-add').click();
    const dialog = page.getByTestId('showcase-entry-dialog');
    await dialog.getByRole('combobox', { name: 'Category' }).click();
    await page.getByRole('option', { name: /^Partners/ }).click();
    await dialog.getByLabel('Name', { exact: true }).fill('Example Refused Partner');
    await dialog.getByLabel('Role or what they do').fill('Sponsor');
    // switch to Country Lead only (plain events: the open dialog covers the top bar)
    await page.getByRole('button', { name: /Account menu/ }).dispatchEvent('click');
    await page.getByRole('menuitemcheckbox', { name: 'Country Lead', exact: true }).dispatchEvent('click');
    await page.getByRole('menuitemcheckbox', { name: 'Super Admin', exact: true }).dispatchEvent('click');
    await expect(page.getByTestId('viewing-as')).toContainText('Viewing as Country Lead');
    await dialog.getByTestId('showcase-entry-save').dispatchEvent('click');
    await expect(page.getByTestId('toast').filter({ hasText: 'Your role cannot change this part of the showcase.' }).first()).toBeVisible();
    await expect(dialog.getByTestId('showcase-entry-problem')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).dispatchEvent('click');
    await expect(rowOf(page, 'Example Refused Partner')).toHaveCount(0);
  });

  test('the four permissions are on the Roles matrix', async ({ page, context }) => {
    await asRoles(context, 'super_admin');
    await page.goto(`${BASE_URL}/team?tab=roles`, { timeout: 30_000 });
    for (const label of ['Showcase', 'Showcase: ambassadors', 'Showcase: partners', 'Showcase: manage']) {
      await expect(page.locator('tbody tr').filter({ has: page.getByRole('rowheader', { name: label, exact: true }) })).toHaveCount(1);
    }
  });

  test('phones (434px): the page and the form fit, nothing is wider than the viewport, and there are no console errors', async ({ page, context }) => {
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) problems.push(message.text());
    });
    await page.setViewportSize({ width: 434, height: 900 });
    await openShowcase(page, context);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByTestId('showcase-add').click();
    const dialog = page.getByTestId('showcase-entry-dialog');
    expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(434);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(problems).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Against the real API (npm run test:e2e, BE-030). The e2e database is shared by the run and can outlive it locally, so every
// name carries a stamp and the checks look only at this run's rows.
// ---------------------------------------------------------------------------------------------------------------------
test.describe('Showcase against the real API', () => {
  test.skip(MOCK_RUN, 'real API run only: see npm run test:e2e');
  test.describe.configure({ mode: 'serial' });
  test.use({ viewport: { width: 1440, height: 900 } });
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const first = `Live Person A ${stamp}`;
  const second = `Live Person B ${stamp}`;
  const toast = (page: Page, text: string) => page.getByTestId('toast').filter({ hasText: text }).first();

  const open = async (page: Page) => {
    await page.goto(`${BASE_URL}/showcase`, { timeout: 30_000 });
    await expect(page.getByTestId('page-title')).toHaveText('Showcase');
    await expect(page.getByTestId('showcase-add')).toBeVisible({ timeout: 15_000 }); // the categories came back from the server
  };
  const onlyThisRun = async (page: Page) => {
    await page.getByLabel('Search the showcase').fill(stamp);
  };

  test('entries are saved on the server: add, reorder, edit, hide and delete, each in the History with who did it', async ({ page }) => {
    await open(page);
    await addEntry(page, { category: 'Team', name: first, title: 'Designer', providedBy: 'Sent by email' });
    await expect(toast(page, `${first} was added and is on the app.`)).toBeVisible({ timeout: 15_000 });
    await addEntry(page, { category: 'Team', name: second, title: 'Developer', visible: false });
    await expect(toast(page, `${second} was added (hidden).`)).toBeVisible({ timeout: 15_000 });

    // A fresh page reads both back from the server, last added last.
    await open(page);
    await onlyThisRun(page);
    await expect(rows(page)).toHaveCount(2, { timeout: 15_000 });
    await expect(rows(page).nth(0)).toContainText(first);
    await expect(rows(page).nth(0)).toContainText('Visible');
    await expect(rows(page).nth(1)).toContainText(second);
    await expect(rows(page).nth(1)).toContainText('Hidden');

    await page.getByRole('button', { name: `Move ${second} up` }).click();
    await expect(rows(page).nth(0)).toContainText(second, { timeout: 15_000 });

    let menu = await openMenu(page, `Entry actions for ${first}`);
    await menu.getByRole('menuitem', { name: 'Edit' }).click();
    const dialog = page.getByTestId('showcase-entry-dialog');
    await dialog.getByLabel('Role or what they do').fill('Lead Designer');
    await dialog.getByTestId('showcase-entry-save').click();
    await expect(toast(page, `${first} was updated.`)).toBeVisible({ timeout: 15_000 });
    await expect(rowOf(page, first)).toContainText('Lead Designer');

    menu = await openMenu(page, `Entry actions for ${first}`);
    await menu.getByRole('menuitem', { name: 'Hide from the app' }).click();
    await expect(toast(page, `${first} is hidden from the app.`)).toBeVisible({ timeout: 15_000 });
    await expect(rowOf(page, first)).toContainText('Hidden');

    menu = await openMenu(page, `Entry actions for ${second}`);
    await menu.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete entry' }).click();
    await expect(toast(page, `${second} was deleted.`)).toBeVisible({ timeout: 15_000 });
    await expect(rowOf(page, second)).toHaveCount(0);

    await page.getByTestId('showcase-history-open').click();
    const history = page.getByTestId('history-dialog').getByTestId('history-entry');
    await expect(history.first()).toContainText(`Deleted ${second} from Team`, { timeout: 15_000 });
    await expect(history.first()).toContainText('E2E Admin'); // who: the signed-in person, as the server recorded it
    for (const line of [`Hid ${first}`, `Edited ${first}`, `Moved ${second} up`, `Added ${second} to Team (hidden)`, `Added ${first} to Team (visible)`]) {
      await expect(history.filter({ hasText: line })).toHaveCount(1);
    }
  });

  test('a change the server refuses shows its message, and nothing changes', async ({ page }) => {
    await open(page);
    await onlyThisRun(page);
    await expect(rowOf(page, first)).toContainText('Hidden', { timeout: 15_000 });
    const visibility = '**/admin/showcase/entries/*/visibility';
    await page.route(visibility, (route) =>
      route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { message: 'E2E: refused by the server.' } }) }),
    );
    const menu = await openMenu(page, `Entry actions for ${first}`);
    await menu.getByRole('menuitem', { name: 'Show on the app' }).click();
    await expect(toast(page, 'E2E: refused by the server.')).toBeVisible({ timeout: 15_000 });
    await page.unroute(visibility);
    await open(page);
    await onlyThisRun(page);
    await expect(rowOf(page, first)).toContainText('Hidden', { timeout: 15_000 });
  });

  test('a category is added, renamed, hidden and deleted on the server; a taken name is refused', async ({ page }) => {
    const name = `Live Devs ${stamp}`;
    const renamed = `Live Mentors ${stamp}`;
    await open(page);
    await page.getByRole('tab', { name: 'Categories' }).click();
    await page.getByTestId('showcase-add-category').click();
    let dialog = page.getByTestId('showcase-category-dialog');
    await dialog.getByRole('textbox', { name: 'Name' }).fill(name);
    await dialog.getByTestId('showcase-category-save').click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(rowOf(page, name)).toContainText('Visible', { timeout: 15_000 });

    // The server's own uniqueness check: a name the form cannot know is taken yet (made by "someone else", straight on the API).
    const other = `Live Taken ${stamp}`;
    const made = await page.request.post(`${API_URL}/admin/showcase/categories`, { data: { name: other, kind: 'person' } });
    expect(made.status()).toBe(201);
    await page.getByTestId('showcase-add-category').click();
    dialog = page.getByTestId('showcase-category-dialog');
    await dialog.getByRole('textbox', { name: 'Name' }).fill(other.toUpperCase());
    await dialog.getByTestId('showcase-category-save').click();
    await expect(dialog.getByTestId('showcase-category-problem')).toContainText('A category with this name already exists.', { timeout: 15_000 });
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    let menu = await openMenu(page, `Category actions for ${name}`);
    await menu.getByRole('menuitem', { name: 'Rename' }).click();
    await page.getByTestId('showcase-category-dialog').getByRole('textbox', { name: 'Name' }).fill(renamed);
    await page.getByTestId('showcase-category-save').click();
    await expect(rowOf(page, renamed)).toHaveCount(1, { timeout: 15_000 });

    menu = await openMenu(page, `Category actions for ${renamed}`);
    await menu.getByRole('menuitem', { name: 'Hide from the app' }).click();
    await expect(rowOf(page, renamed)).toContainText('Hidden', { timeout: 15_000 });

    for (const remove of [renamed, other]) {
      menu = await openMenu(page, `Category actions for ${remove}`);
      await menu.getByRole('menuitem', { name: 'Delete' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Delete category' }).click();
      await expect(rowOf(page, remove)).toHaveCount(0, { timeout: 15_000 });
    }
  });
});
