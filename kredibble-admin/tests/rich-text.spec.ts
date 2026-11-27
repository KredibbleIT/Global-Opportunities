/**
 * Formatted listing descriptions: the safe Markdown subset (src/lib/rich-text.ts), the toolbar of the listing form, and how the marks are shown.
 *
 *  - "Rich text (no browser)": the parser and the toolbar maths, the same cases as the app's tests.
 *  - "Rich text in the listing form (mock mode)": the toolbar buttons write the marks, the formatted result shows under the box as they type, a pasted script or javascript: link does
 *    nothing, and a saved draft shows its formatted description on the detail page.
 *
 * ALL DATA IS FAKE.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { MOCK_RUN, defaultBaseUrl } from './mode';
import { applyFormat, hasRichMarks, parseInline, parseRichText, previewText, safeHref, stripRichText } from '../src/lib/rich-text';
import { foldDetailsIntoDescription, hasSeparateDetails } from '../src/lib/listing-description';

const BASE_URL = defaultBaseUrl();

test.describe('GOD-T101: Who can apply and What it offers move into the Description (no browser)', () => {
  test('plain lines become a list under each heading, at the end of the description', () => {
    expect(foldDetailsIntoDescription('A paid summer fellowship.', 'Students\nAuthorised to work in the US', 'A salary\nA stipend')).toBe(
      'A paid summer fellowship.\n\n## Who can apply\n- Students\n- Authorised to work in the US\n\n## What it offers\n- A salary\n- A stipend',
    );
    // text that already has a list mark is formatted text: kept exactly as written, not listed again
    expect(foldDetailsIntoDescription('About.', undefined, 'A salary\n- A stipend')).toBe('About.\n\n## What it offers\nA salary\n- A stipend');
  });

  test('formatted text is kept as written, one line stays a line, and nothing to move leaves the description alone', () => {
    expect(foldDetailsIntoDescription('About it.', '', '**Tuition** and an allowance')).toBe('About it.\n\n## What it offers\n**Tuition** and an allowance');
    expect(foldDetailsIntoDescription('About it.', 'Anyone under 30')).toBe('About it.\n\n## Who can apply\nAnyone under 30');
    expect(foldDetailsIntoDescription('About it.', '  ', undefined)).toBe('About it.');
    expect(hasSeparateDetails('', ' ')).toBe(false);
    expect(hasSeparateDetails('x', undefined)).toBe(true);
  });
});

test.describe('Rich text (no browser)', () => {
  test('links only open for http, https and mailto', () => {
    expect(safeHref('https://example.com/a')).toBe('https://example.com/a');
    expect(safeHref('mailto:jobs@example.com')).toBe('mailto:jobs@example.com');
    for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html;base64,AAAA', 'file:///etc/passwd', '//example.com', 'example.com', '']) expect(safeHref(bad)).toBeNull();
    expect(parseInline('[click](javascript:alert(1))')).toEqual([{ kind: 'text', text: '[click](javascript:alert(1))' }]);
  });

  test('reads bold, italic, headings, lists and keeps stray marks and HTML as plain text', () => {
    expect(parseInline('a **b** *c*')).toHaveLength(4);
    expect(stripRichText('2 * 3 * 4 = 24')).toBe('2 * 3 * 4 = 24');
    expect(stripRichText('** not bold **')).toBe('** not bold **');
    expect(stripRichText('\\*literal\\*')).toBe('*literal*');
    const blocks = parseRichText('## Requirements\nA degree in **any** subject.\n\n- Teamwork\n- Writing\n\n1. Apply\n2. Wait');
    expect(blocks.map((block) => block.kind)).toEqual(['heading', 'paragraph', 'list', 'list']);
    expect(parseRichText('<script>alert(1)</script>')[0]).toEqual({ kind: 'paragraph', children: [{ kind: 'text', text: '<script>alert(1)</script>' }] });
    expect(parseRichText('#### too deep')[0].kind).toBe('paragraph');
  });

  test('a plain description has no marks and keeps its line breaks', () => {
    expect(hasRichMarks('Citizens of Ghana\nUnder 30 years old')).toBe(false);
    expect(hasRichMarks('**x**')).toBe(true);
    expect(stripRichText('Line one\nLine two\n\nNew paragraph')).toBe('Line one\nLine two\nNew paragraph');
    expect(previewText('## Hello\n**Apply** by [Friday](https://example.com)\n- one\n- two')).toBe('Hello Apply by Friday • one • two');
  });

  test('the toolbar wraps, unwraps and marks lines', () => {
    const bold = applyFormat('Join our team', { start: 5, end: 8 }, 'bold');
    expect(bold).toEqual({ value: 'Join **our** team', selection: { start: 7, end: 10 } });
    expect(applyFormat(bold.value, bold.selection, 'bold').value).toBe('Join our team');
    expect(applyFormat('', { start: 0, end: 0 }, 'italic').value).toBe('*italic text*');
    const link = applyFormat('Apply here', { start: 6, end: 10 }, 'link');
    expect(link.value).toBe('Apply [here](https://)');
    expect(link.value.slice(link.selection.start, link.selection.end)).toBe('https://');
    const on = applyFormat('one\ntwo\nthree', { start: 0, end: 13 }, 'bullets');
    expect(on.value).toBe('- one\n- two\n- three');
    expect(applyFormat(on.value, on.selection, 'bullets').value).toBe('one\ntwo\nthree');
    expect(applyFormat('one\ntwo', { start: 0, end: 7 }, 'numbers').value).toBe('1. one\n2. two');
    expect(applyFormat('Intro\nBody', { start: 8, end: 8 }, 'heading').value).toBe('Intro\n## Body');
  });
});

test.describe('Rich text in the listing form (mock mode)', () => {
  test.skip(!MOCK_RUN, 'the listing form runs on sample data: see npm run test:e2e:mock');
  test.use({ viewport: { width: 1440, height: 900 } });

  // The form has three editors (description, who can apply, what it offers): these tests use the first, the description.
  const editorOf = (page: Page) => page.getByTestId('rich-text-editor').first();

  // The description box is an editable area, not a textarea: its value is its text (the marks are in it, hidden).
  const textOf = (box: Locator) => box.evaluate((element) => element.textContent);

  // Types into an editable area the way a person does, with Enter for a new line (fill() would drop the line breaks).
  const write = async (box: Locator, text: string) => {
    await box.click();
    await box.press('Control+a');
    await box.press('Delete');
    const lines = text.split('\n');
    for (const [index, line] of lines.entries()) {
      if (index > 0) await box.press('Enter');
      if (line) await box.pressSequentially(line);
    }
  };

  const open = async (page: Page) => {
    await page.goto(`${BASE_URL}/opportunities/new`, { timeout: 30_000 });
    await page.getByTestId('sidebar-toggle').waitFor();
    await page.waitForTimeout(500);
    return page.getByLabel('Description', { exact: true });
  };

  test('the toolbar writes the marks into the description, and pressing it again takes them off', async ({ page }) => {
    const box = await open(page);
    await expect(editorOf(page).getByRole('toolbar', { name: 'Text formatting' })).toBeVisible();
    await box.fill('Join our team');
    await box.selectText();
    await editorOf(page).getByTestId('format-bold').click();
    await expect.poll(() => textOf(box)).toBe('**Join our team**');
    await editorOf(page).getByTestId('format-bold').click();
    await expect.poll(() => textOf(box)).toBe('Join our team');

    await box.selectText();
    await editorOf(page).getByTestId('format-italic').click();
    await expect.poll(() => textOf(box)).toBe('*Join our team*');

    await write(box, 'one\ntwo');
    await box.selectText();
    await editorOf(page).getByTestId('format-bullets').click();
    await expect.poll(() => textOf(box)).toBe('- one\n- two');
    await editorOf(page).getByTestId('format-numbers').click();
    await expect.poll(() => textOf(box)).toBe('1. one\n2. two');

    await box.fill('Overview');
    await box.selectText();
    await editorOf(page).getByTestId('format-heading').click();
    await expect.poll(() => textOf(box)).toBe('## Overview');

    await box.fill('Apply here');
    await box.selectText();
    await editorOf(page).getByTestId('format-link').click();
    await expect.poll(() => textOf(box)).toBe('[Apply here](https://)');
  });

  test('Ctrl+B and Ctrl+I work in the box', async ({ page }) => {
    const box = await open(page);
    await box.fill('Deadline');
    await box.selectText();
    await box.press('Control+b');
    await expect.poll(() => textOf(box)).toBe('**Deadline**');
    await box.press('Control+b');
    await box.press('Control+i');
    await expect.poll(() => textOf(box)).toBe('*Deadline*');
  });

  test('formatting shows on the text as it is typed: no Preview, and the marks are not visible', async ({ page }) => {
    const box = await open(page);
    await expect(page.getByRole('button', { name: 'Preview', exact: true })).toHaveCount(0);
    await write(box, '## Requirements\nA degree in **any** subject, see [the guide](https://example.org/guide).\n\n- Teamwork\n- Writing');
    await expect(box.locator('strong')).toHaveText('any');
    await expect(box.locator('strong')).toHaveCSS('font-weight', /^([6-9]00|bold)$/);
    // the ** and ## are in the text but have no size, so they take no room and cannot be seen
    const sizes = await box.evaluate((element) => Array.from(element.querySelectorAll('span')).filter((node) => /^(\*\*|## |\[)$/.test(node.textContent ?? '')).map((node) => getComputedStyle(node).fontSize));
    expect(sizes.length).toBeGreaterThanOrEqual(4);
    for (const size of sizes) expect(size).toBe('0px');
    await expect(box.getByText('the guide', { exact: true })).toBeVisible();
    // pressing Bold on the toolbar formats the selected words at once
    await box.fill('Join our team');
    await box.selectText();
    await editorOf(page).getByTestId('format-bold').click();
    await expect(box.locator('strong')).toHaveText('Join our team');
    await expect.poll(() => textOf(box)).toBe('**Join our team**');
  });

  test('pasted HTML and a javascript: link do nothing: they stay as plain text', async ({ page }) => {
    const box = await open(page);
    await box.fill('<script>window.__pwned = 1</script> <img src=x onerror="window.__pwned = 2"> [click me](javascript:window.__pwned=3)');
    await expect(box).toContainText('<script>window.__pwned = 1</script>');
    await expect(box.locator('script, img')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  });

  // GOD-T101: Who can apply and What it offers are headings inside the Description now, not boxes of their own.
  test('a saved listing shows its description, with its Who can apply and What it offers sections, formatted', async ({ page }) => {
    const box = await open(page);
    await page.getByLabel('Title', { exact: true }).fill('Formatted Listing Test');
    await write(box, '## About\nA **great** chance.\n\n- First\n- Second\n\n## Who can apply\nCitizens of Ghana\n\n## What it offers\n**Tuition** and a [monthly allowance](https://example.org/allowance)');
    await expect(page.getByLabel('Who can apply')).toHaveCount(0);
    await expect(page.getByLabel('What it offers')).toHaveCount(0);
    await page.getByLabel('Offering organisation').fill('Test Organisation');
    await page.getByRole('combobox', { name: 'Opportunity type' }).click();
    await page.getByRole('option', { name: 'Fellowship' }).click();
    await page.getByRole('combobox', { name: 'Country' }).click();
    await page.getByRole('option', { name: 'Ghana' }).click();
    await page.getByLabel('Application deadline').fill('2099-12-31');
    await page.getByLabel('Official application link').fill('https://example.org/apply');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page).toHaveURL(/\/opportunities\/lst-new-/, { timeout: 15_000 });

    const description = page.getByTestId('listing-description');
    await expect(description.getByRole('heading', { name: 'About' })).toBeVisible();
    await expect(description.getByRole('heading', { name: 'Who can apply' })).toBeVisible();
    await expect(description.getByRole('heading', { name: 'What it offers' })).toBeVisible();
    await expect(description.locator('strong')).toHaveText(['great', 'Tuition']);
    await expect(description.locator('ul li')).toHaveCount(2);
    await expect(description).toContainText('Citizens of Ghana');
    await expect(description.getByRole('link', { name: 'monthly allowance' })).toHaveAttribute('href', 'https://example.org/allowance');
    // nothing is shown twice: the old separate sections stay empty
    await expect(page.getByTestId('listing-eligibility')).toHaveCount(0);
    await expect(page.getByTestId('listing-benefits')).toHaveCount(0);
  });
});
