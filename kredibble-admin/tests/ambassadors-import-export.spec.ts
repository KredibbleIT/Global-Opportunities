/**
 * Ambassadors: CSV import and export.
 *
 * Two kinds of test:
 *  - "rules" tests need no browser: they call the pure functions in src/lib/csv.ts and src/lib/ambassador-io.ts directly
 *    (parser, formula-injection guard, phone / city / email / date rules, duplicate merge, export file text, a 5,000-row run);
 *  - "UI" tests drive the Network page in MOCK MODE (npm run test:e2e:mock): export files, the four-step import wizard, the
 *    problem rows, merging, skip versus update, the error report, the history, keyboard focus and the permission gate.
 *
 * Status rule: imported people are created ACTIVE by default (the wizard offers Active or Pending), the file's status column is
 * ignored, and a person who already exists keeps their status.
 *
 * ALL DATA IS FAKE (tests/fixtures/*.csv use example.com emails, 0200000xxx numbers and "Test Person" names). Never put real
 * ambassador data in this repo.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MOCK_RUN, defaultBaseUrl } from './mode';
import { csvCell, escapeFormula, parseCsv, toCsv } from '../src/lib/csv';
import {
  TEMPLATE_HEADERS, analyseImport, buildErrorReportCsv, buildExportCsv, checkEmail, classifyCity, cleanText, exportFilename, formatPhoneForExcel,
  mapHeaders, normalisePhones, parseSubmittedAt, readRows, rowOutcome, templateCsv, BIO_MAX_CHARS, BIO_WARN_CHARS,
} from '../src/lib/ambassador-io';
import type { Ambassador } from '../src/lib/mock-entities';

const BASE_URL = defaultBaseUrl();
const FIXTURE = path.join(__dirname, 'fixtures', 'ambassadors-problem-rows.csv');
const UPDATE_FIXTURE = path.join(__dirname, 'fixtures', 'ambassadors-update.csv');
const STATUS_COLUMN_FIXTURE = path.join(__dirname, 'fixtures', 'ambassadors-status-column.csv');
const BOM = '﻿';

// ---------------------------------------------------------------------------------------------------------------------
// Rules (no browser)
// ---------------------------------------------------------------------------------------------------------------------
test.describe('Ambassador CSV rules: parser and writer', () => {
  test('parses quotes, doubled quotes, commas and line breaks inside quotes, CRLF, LF, a BOM and blank lines', async () => {
    const text = `${BOM}a,b,c\r\n1,"two, with comma","three ""quoted""\nover two lines"\n\n4,5,6`;
    expect(await parseCsv(text)).toEqual([
      ['a', 'b', 'c'],
      ['1', 'two, with comma', 'three "quoted"\nover two lines'],
      ['4', '5', '6'],
    ]);
  });

  test('a lone CR ends a row, an empty quoted field stays empty, and a missing final line break is fine', async () => {
    expect(await parseCsv('a,b\r1,""\r2,3')).toEqual([['a', 'b'], ['1', ''], ['2', '3']]);
  });

  test('gives the browser a turn between chunks and reports progress up to 1', async () => {
    const seen: number[] = [];
    const rows = await parseCsv('a,b\n1,2\n3,4\n5,6\n', { chunkChars: 4, onProgress: (f) => seen.push(f) });
    expect(rows).toHaveLength(4);
    expect(seen.length).toBeGreaterThan(2);
    expect(seen[seen.length - 1]).toBe(1);
  });

  test('formula injection: a cell starting with = + - @ (or a tab or CR) gets a single quote', () => {
    for (const bad of ['=SUM(1,1)', '+1', '-1', '@cmd', '\tx', '\rx']) expect(escapeFormula(bad)).toBe(`'${bad}`);
    expect(escapeFormula('safe')).toBe('safe');
    expect(escapeFormula('a=b')).toBe('a=b');
    expect(csvCell('=SUM(1,1)')).toBe(`"'=SUM(1,1)"`); // quoted because of the comma, and escaped
  });

  test('toCsv uses CRLF and quotes what needs it', () => {
    expect(toCsv([['a', 'b,c'], ['"q"', 'x\ny']])).toBe('a,"b,c"\r\n"""q""","x\ny"');
  });
});

test.describe('Ambassador CSV rules: the seven known problems', () => {
  test('1. duplicate emails: trimmed and lowercase match, the latest submission by timestamp wins, older ones are counted as merged', () => {
    const header = mapHeaders(['Timestamp', 'Full Name', 'Email']);
    const rows = readRows(
      [
        ['2026/10/01 8:00:00 AM GMT', 'Old', 'dup@example.com'],
        ['2026/10/02 8:00:00 AM GMT', 'New', '  DUP@Example.com '],
        ['2026/09/30 8:00:00 AM GMT', 'Oldest', 'dup@example.com'],
        ['2026/10/01 8:00:00 AM GMT', 'Other', 'other@example.com'],
      ],
      header,
    );
    const preview = analyseImport(rows, new Map());
    expect(preview.counts.merged).toBe(2);
    expect(preview.rows.map((r) => r.mergedInto)).toEqual([3, undefined, 3, undefined]);
    expect(preview.counts.valid + preview.counts.warnings).toBe(2); // the two survivors (a missing phone is only a warning)
    expect(preview.counts.errors).toBe(0);
  });

  test('1b. a row with no readable timestamp counts as the oldest', () => {
    const rows = readRows([['', 'No date', 'x@example.com'], ['2026/10/02 8:00:00 AM GMT', 'Dated', 'x@example.com']], mapHeaders(['Timestamp', 'Full Name', 'Email']));
    const preview = analyseImport(rows, new Map());
    expect(preview.rows[0].mergedInto).toBe(3);
  });

  test('2. names: trailing and double spaces are trimmed and collapsed', () => {
    expect(cleanText('  Ama   Mensah  ')).toBe('Ama Mensah');
    expect(cleanText('Ama  Mensah')).toBe('Ama Mensah');
  });

  test('3. an email with spaces is an ERROR with the reason, never silently fixed', () => {
    const bad = checkEmail('juliet boundzie @gmail.com');
    expect(bad.error).toMatch(/spaces/i);
    expect(checkEmail('  OK@Example.com ')).toEqual({ value: 'ok@example.com' });
    expect(checkEmail('nope').error).toMatch(/not a valid/i);
    expect(checkEmail('').error).toMatch(/missing/i);
  });

  test('4. phones: prefix, +233, (+233), two numbers stuck together, two numbers split by a separator, odd lengths', () => {
    expect(normalisePhones('Phone: 0257349584').numbers).toEqual(['0257349584']);
    expect(normalisePhones('+233 25 734 9584').numbers).toEqual(['0257349584']);
    expect(normalisePhones('(+233) 257349584').numbers).toEqual(['0257349584']);
    expect(normalisePhones('0257349584 0201234567'.replace(' ', '')).numbers).toEqual(['0257349584', '0201234567']); // 20 digits
    expect(normalisePhones('0257349584 / 0201234567').numbers).toEqual(['0257349584', '0201234567']);
    expect(normalisePhones('233257349584233201234567').numbers).toEqual(['0257349584', '0201234567']); // 24 digits, +233 on both
    const odd = normalisePhones('020000001212'); // 12 digits, not +233
    expect(odd.numbers).toEqual(['020000001212']);
    expect(odd.issues.some((i) => i.level === 'warning')).toBe(true);
    expect(normalisePhones('12345').issues.some((i) => i.level === 'warning')).toBe(true);
    // leading zeros are kept because the result is always text
    expect(typeof normalisePhones('0257349584').numbers[0]).toBe('string');
    expect(normalisePhones('0257349584').numbers[0].startsWith('0')).toBe(true);
  });

  test('5. city: kept as typed, a region only when written, unrecognised cities are flagged, nothing is guessed', () => {
    expect(classifyCity('Greater Accra Region')).toEqual({ city: 'Greater Accra Region', region: 'Greater Accra', recognised: true });
    expect(classifyCity('Northern Region(Tamale)')).toMatchObject({ city: 'Northern Region(Tamale)', region: 'Northern', recognised: true });
    expect(classifyCity('Accra (Dansoman)')).toMatchObject({ city: 'Accra (Dansoman)', region: '', recognised: true }); // no region invented
    expect(classifyCity('Dawhenya near Tema Comm.25')).toMatchObject({ region: '', recognised: true });
    expect(classifyCity('Somewhereville')).toMatchObject({ city: 'Somewhereville', region: '', recognised: false });
    expect(classifyCity('  Accra   ').city).toBe('Accra');
  });

  test('6. a Drive link is the SOURCE: pictureUrl stays empty and a note says a backend job is needed', () => {
    const mapping = mapHeaders(['Full Name', 'Email', 'Picture']);
    const [row] = readRows([['A B', 'a@example.com', 'https://drive.google.com/open?id=FAKE']], mapping);
    expect(row.record.pictureSourceUrl).toBe('https://drive.google.com/open?id=FAKE');
    expect(row.record.pictureUrl).toBe('');
  });

  test('7. bios are never edited; soft warning above 400 characters, hard error above 1000', () => {
    const mapping = mapHeaders(['Full Name', 'Email', 'Biography']);
    const make = (length: number) => readRows([['A', 'a@example.com', 'x'.repeat(length)]], mapping)[0];
    const bioIssue = (length: number) => make(length).issues.find((i) => i.message.startsWith('Biography'));
    expect(bioIssue(BIO_WARN_CHARS)).toBeUndefined();
    expect(bioIssue(BIO_WARN_CHARS + 1)?.level).toBe('warning');
    expect(bioIssue(BIO_MAX_CHARS)?.level).toBe('warning');
    expect(bioIssue(BIO_MAX_CHARS + 1)?.level).toBe('error');
    expect(rowOutcome(make(BIO_MAX_CHARS + 1))).toBe('error');
    const withBreaks = 'line one\n\n  line  two ';
    expect(readRows([['A', 'a@example.com', withBreaks]], mapping)[0].record.bio).toBe(withBreaks); // untouched, spaces and breaks included
  });
});

test.describe('Ambassador CSV rules: dates, headers, export text and a large file', () => {
  test('reads the form timestamp, ISO dates and month/day ambiguity', () => {
    expect(parseSubmittedAt('2026/10/08 3:45:12 PM GMT')?.iso).toBe('2026-10-08T15:45:12.000Z');
    expect(parseSubmittedAt('2026/10/08 12:05:00 AM GMT')?.iso).toBe('2026-10-08T00:05:00.000Z');
    expect(parseSubmittedAt('2026-10-08T09:30:00.000Z')?.iso).toBe('2026-10-08T09:30:00.000Z');
    expect(parseSubmittedAt('13/10/2026 09:00:00')?.iso).toBe('2026-10-13T09:00:00.000Z'); // day first
    expect(parseSubmittedAt('10/13/2026 09:00:00')?.iso).toBe('2026-10-13T09:00:00.000Z'); // month first
    expect(parseSubmittedAt('10/8/2026 09:00:00')?.note).toMatch(/month\/day/i);
    expect(parseSubmittedAt('not a date')).toBeNull();
    expect(parseSubmittedAt('2026/02/31 10:00:00')).toBeNull();
  });

  test('understands the template headers and the original sign-up form headers', () => {
    const form = mapHeaders(['Timestamp', 'Full Name', 'Email', 'Phone and WhatsApp number', 'Country', 'City', 'Picture', 'Biograph']);
    expect(form.columns).toEqual(['submittedAt', 'fullName', 'email', 'phoneCombined', 'country', 'city', 'picture', 'bio']);
    expect(form.missing).toEqual([]);
    expect(mapHeaders([...TEMPLATE_HEADERS]).ignored).toEqual([]);
    expect(mapHeaders(['Name', 'Colour']).missing).toEqual(['Email']);
    expect(mapHeaders(['Name', 'Colour']).ignored).toEqual(['Colour']);
  });

  const person = (over: Partial<Ambassador> = {}): Ambassador => ({
    id: 'a1', name: 'Test Person', email: 'test@example.com', referralCode: 'GOD-AAAAAA', campus: 'Not provided', country: 'Ghana', city: 'Accra',
    memberType: 'student', trained: false, tier: 'ambassador', status: 'applicant', joinedAt: '2026-10-01', ...over,
  });

  test('export: BOM, template headers in template order, text phones that keep the leading 0, formula-safe cells, status mapping', () => {
    const text = buildExportCsv(
      [person({ phone: '0257349584', whatsapp: '0201234567', name: '=HYPERLINK("x")', description: 'a, "b"\nc', status: 'active' }), person({ id: 'a2', email: 'b@example.com', status: 'onboarding' })],
      [...TEMPLATE_HEADERS],
    );
    expect(text.startsWith(BOM)).toBe(true);
    const lines = text.slice(1).split('\r\n');
    expect(lines[0]).toBe(TEMPLATE_HEADERS.join(','));
    expect(text).toContain('025 734 9584'); // spaces keep Excel from turning it into a number
    expect(text).toContain('020 123 4567');
    expect(text).not.toContain('="0'); // the ="0257..." trick is NOT used
    expect(text).toContain(`"'=HYPERLINK(""x"")"`); // single quote in front, quotes doubled
    expect(text).toContain('"a, ""b""\nc"');
    expect(text).toMatch(/,pending\r?$/m); // onboarding is written as pending
    expect(text).toMatch(/,active\r\n/); // active stays active
    expect(exportFilename('2026-10-11')).toBe('ambassadors-2026-10-11.csv');
  });

  test('export columns: only the ticked ones, always in template order', () => {
    const text = buildExportCsv([person()], ['status', 'fullName']);
    expect(text.slice(1).split('\r\n')[0]).toBe('fullName,status');
  });

  test('an exported file can be imported again: same people, same phone numbers, nothing lost', async () => {
    const original = person({ phone: '0257349584', whatsapp: '0201234567', region: 'Ashanti', city: 'Kumasi', description: 'Line one\nLine two', status: 'active', submittedAt: '2026-10-02T09:00:00.000Z' });
    const text = buildExportCsv([original], [...TEMPLATE_HEADERS]);
    const table = await parseCsv(text);
    const rows = readRows(table.slice(1), mapHeaders(table[0]));
    expect(rows).toHaveLength(1);
    expect(rows[0].record).toMatchObject({
      fullName: 'Test Person', email: 'test@example.com', phone: '0257349584', whatsapp: '0201234567', region: 'Ashanti', city: 'Kumasi',
      bio: 'Line one\nLine two', submittedAt: '2026-10-02T09:00:00.000Z',
    });
    expect(rows[0].record).not.toHaveProperty('status'); // the importer never reads a status column
    expect(rowOutcome(rows[0])).toBe('valid');
  });

  test('formatPhoneForExcel groups digits and leaves anything else alone', () => {
    expect(formatPhoneForExcel('0257349584')).toBe('025 734 9584');
    expect(formatPhoneForExcel('233257349584')).toBe('233 257 349 584');
    expect(formatPhoneForExcel('+233 25')).toBe('+233 25');
    expect(formatPhoneForExcel(undefined)).toBe('');
  });

  test('the template has the headers and two fake example rows, and is itself importable', async () => {
    const table = await parseCsv(templateCsv());
    expect(table[0]).toEqual([...TEMPLATE_HEADERS]);
    expect(table).toHaveLength(3);
    const preview = analyseImport(readRows(table.slice(1), mapHeaders(table[0])), new Map());
    expect(preview.counts).toMatchObject({ total: 2, errors: 0, merged: 0 });
  });

  test('the error report lists line number, email and reason for each failed row only', () => {
    const mapping = mapHeaders(['Full Name', 'Email']);
    const preview = analyseImport(readRows([['A', 'ok@example.com'], ['B', 'bad address@example.com']], mapping), new Map());
    const lines = buildErrorReportCsv(preview).slice(1).split('\r\n');
    expect(lines[0]).toBe('row,email,reason');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/^3,/);
  });

  test('5,000 rows: parsed in chunks and analysed without freezing (well under a few seconds)', async () => {
    const lines = ['Timestamp,Full Name,Email,Phone and WhatsApp number,Country,City,Picture,Biography'];
    for (let i = 0; i < 5000; i++) {
      lines.push(`2026/10/01 9:00:00 AM GMT,Test Person ${i},test.${i % 4700}@example.com,02${String(i).padStart(8, '0')},Ghana,Accra,https://drive.google.com/open?id=FAKE${i},"Fake bio, with a comma ${i}"`);
    }
    const text = lines.join('\r\n');
    const start = Date.now();
    const table = await parseCsv(text);
    const preview = analyseImport(readRows(table.slice(1), mapHeaders(table[0])), new Map());
    const elapsed = Date.now() - start;
    expect(table).toHaveLength(5001);
    expect(preview.counts.total).toBe(5000);
    expect(preview.counts.merged).toBe(300); // 5,000 rows over 4,700 emails
    expect(elapsed).toBeLessThan(5000);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// UI (mock mode)
// ---------------------------------------------------------------------------------------------------------------------
const asRoles = (context: BrowserContext, roles: string) => context.addCookies([{ name: 'god_dev_roles', value: roles, url: BASE_URL }]);

const openNetwork = async (page: Page, context: BrowserContext, roles = 'super_admin') => {
  await asRoles(context, roles);
  await page.goto(`${BASE_URL}/network`, { timeout: 30_000 });
  await expect(page.getByTestId('page-title')).toHaveText('Network');
  await expect(page.locator('main tbody tr').first()).toBeVisible();
};

const startImport = async (page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }) => {
  await page.getByTestId('import-open').click();
  const dialog = page.getByTestId('import-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('import-file-input').setInputFiles(file);
  await expect(dialog.getByTestId('import-counts')).toBeVisible({ timeout: 20_000 });
  return dialog;
};

/** { Valid: 11, Warnings: 3, ... } from the preview tiles. */
const readCounts = async (page: Page): Promise<Record<string, number>> =>
  page.getByTestId('import-counts').evaluate((el) =>
    Object.fromEntries(
      [...el.children].map((tile) => {
        const lines = (tile as HTMLElement).innerText.split('\n').map((t) => t.trim()).filter(Boolean);
        return [lines[1], Number(lines[0].replace(/,/g, ''))];
      }),
    ),
  );

const runImport = async (page: Page, file: string, choice?: 'Skip' | 'Update', status?: 'Active' | 'Pending') => {
  const dialog = await startImport(page, file);
  await dialog.getByTestId('import-continue').click();
  if (choice) await dialog.getByRole('radio', { name: new RegExp(`^${choice}`) }).click();
  if (status) await dialog.getByTestId('status-choice').getByRole('radio', { name: status }).click();
  await dialog.getByTestId('import-confirm').click();
  await expect(dialog.getByTestId('import-result')).toBeVisible();
  return dialog;
};

const resultCounts = async (page: Page): Promise<Record<string, number>> =>
  page.getByTestId('import-result').evaluate((el) => {
    const grid = el.querySelector('div.grid')!;
    return Object.fromEntries(
      [...grid.children].map((tile) => {
        const lines = (tile as HTMLElement).innerText.split('\n').map((t) => t.trim()).filter(Boolean);
        return [lines[1], Number(lines[0].replace(/,/g, ''))];
      }),
    );
  });

const exportAll = async (page: Page, item: RegExp, { allColumns = true }: { allColumns?: boolean } = {}) => {
  await page.getByRole('button', { name: /^Export/ }).click();
  await page.getByRole('menuitem', { name: item }).click();
  const dialog = page.getByTestId('export-dialog');
  await expect(dialog).toBeVisible();
  if (allColumns) await dialog.getByRole('button', { name: 'Select all' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByTestId('export-download').click()]);
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'amb-')), download.suggestedFilename());
  await download.saveAs(file);
  return { name: download.suggestedFilename(), text: readFileSync(file, 'utf8'), file };
};

test.describe('Ambassadors: export (mock mode)', () => {
  test.skip(!MOCK_RUN, 'the Ambassadors list runs on sample data: see npm run test:e2e:mock');
  test.use({ viewport: { width: 1440, height: 900 } });

  test('Export all: filename, BOM, template headers, UTF-8, sensitive columns marked in the picker', async ({ page, context }) => {
    await openNetwork(page, context);
    await page.getByRole('button', { name: /^Export/ }).click();
    await page.getByRole('menuitem', { name: 'Export all' }).click();
    const dialog = page.getByTestId('export-dialog');
    // the sensitive columns are marked with a word, and are off by default
    for (const key of ['email', 'phone', 'whatsapp']) await expect(dialog.getByTestId(`sensitive-${key}`)).toContainText('Sensitive');
    await expect(dialog.getByRole('checkbox', { name: 'Email' })).not.toBeChecked();
    await expect(dialog.getByRole('checkbox', { name: 'Full name' })).toBeChecked();
    await dialog.getByRole('button', { name: 'Select all' }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByTestId('export-download').click()]);
    expect(download.suggestedFilename()).toMatch(/^ambassadors-\d{4}-\d{2}-\d{2}\.csv$/);
    const text = readFileSync((await download.path())!, 'utf8');
    expect(text.startsWith(BOM)).toBe(true);
    expect(text.slice(1).split('\r\n')[0]).toBe(TEMPLATE_HEADERS.join(','));
    await expect(page.getByText(/Exported \d+ ambassadors? to ambassadors-/)).toBeVisible();
  });

  test('Export selected is disabled until a row is ticked, then exports only that row', async ({ page, context }) => {
    await openNetwork(page, context);
    await page.getByRole('button', { name: /^Export/ }).click();
    await expect(page.getByRole('menuitem', { name: 'Export selected' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await page.getByRole('checkbox', { name: /^Select /, exact: false }).nth(1).check(); // first row (0 is "select all")
    await expect(page.getByTestId('selection-note')).toContainText('1 selected');
    const out = await exportAll(page, /^Export selected \(1\)/);
    expect(out.text.slice(1).trim().split(/\r\n/).length).toBeGreaterThanOrEqual(2); // header + the row (a bio may add lines inside quotes)
    expect((await parseCsv(out.text)).length).toBe(2);
  });

  test('Export filtered results follows the filters, and a leading zero, a formula and a line break survive', async ({ page, context }) => {
    await openNetwork(page, context);
    await runImport(page, FIXTURE);
    await page.getByTestId('import-done').click();
    await page.getByLabel('Search ambassadors').fill('Test Person');
    await expect(page.getByTestId('selection-note')).toHaveCount(0);
    await expect(page.locator('main tbody tr').first()).toContainText('Test Person');
    const out = await exportAll(page, /^Export filtered results/);
    expect(out.name).toMatch(/^ambassadors-/);
    const table = await parseCsv(out.text);
    expect(table).toHaveLength(14); // header + 13 people whose name matches 'Test Person' (the formula-name person does not match the search)
    expect(out.text).toContain('020 000 0005'); // leading zero kept, as text
    expect(out.text).not.toMatch(/="0\d/); // never the ="0..." trick
    expect(out.text).toContain('""quotes""'); // quotes inside a bio doubled
    expect(out.text).toContain('test.two@example.com'); // lowercase
    expect(out.text).toContain('NEW biography of person two.');
    expect(out.text).not.toContain('OLD biography');
    // a name that starts with = is written with a single quote in front (formula guard)
    await page.getByLabel('Search ambassadors').fill('Injection');
    const guarded = await exportAll(page, /^Export filtered results/);
    expect(guarded.text).toContain(`"'=SUM(1,1) Injection Test"`);
    await page.getByLabel('Search ambassadors').fill('Test Person');
    // the exported file can be imported again: every row is now "already exists"
    const again = await startImport(page, out.file);
    const counts = await readCounts(page);
    expect(counts['Already exist']).toBe(13);
    expect(counts['Errors']).toBe(0);
    await again.getByRole('button', { name: 'Close Import ambassadors' }).click();
  });

  test('the column picker: Clear disables the download with a reason; Cancel and Esc close and restore focus to the button', async ({ page, context }) => {
    await openNetwork(page, context);
    const trigger = page.getByRole('button', { name: /^Export/ });
    await trigger.click();
    await page.getByRole('menuitem', { name: 'Export all' }).click();
    const dialog = page.getByTestId('export-dialog');
    await dialog.getByRole('button', { name: 'Clear' }).click();
    await expect(dialog.getByTestId('export-download')).toBeDisabled();
    await expect(dialog.getByText('Choose at least one column.')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});

test.describe('Ambassadors: import wizard (mock mode)', () => {
  test.skip(!MOCK_RUN, 'the Ambassadors list runs on sample data: see npm run test:e2e:mock');
  test.use({ viewport: { width: 1440, height: 900 } });

  test('happy path: the downloaded template imports, two people are created and show in the list at once', async ({ page, context }) => {
    await openNetwork(page, context);
    await page.getByTestId('import-open').click();
    const dialog = page.getByTestId('import-dialog');
    const [template] = await Promise.all([page.waitForEvent('download'), dialog.getByTestId('download-template').click()]);
    expect(template.suggestedFilename()).toBe('ambassadors-template.csv');
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'amb-')), 'template.csv');
    await template.saveAs(file);
    expect(readFileSync(file, 'utf8').slice(1).split('\r\n')[0]).toBe(TEMPLATE_HEADERS.join(','));
    await dialog.getByTestId('import-file-input').setInputFiles(file);
    await expect(dialog.getByTestId('import-counts')).toBeVisible();
    expect(await readCounts(page)).toMatchObject({ Valid: 2, Warnings: 0, Errors: 0, 'Duplicates merged': 0, 'Already exist': 0 });
    await dialog.getByTestId('import-continue').click();
    await expect(dialog.getByTestId('import-summary')).toContainText('2 new ambassadors will be created');
    await dialog.getByTestId('import-confirm').click();
    await expect(dialog.getByTestId('import-result')).toBeVisible();
    expect(await resultCounts(page)).toMatchObject({ Created: 2, Updated: 0, Skipped: 0, Failed: 0 });
    await expect(dialog.getByTestId('import-announcement')).toContainText('2 created');
    await dialog.getByTestId('import-done').click();
    await page.getByLabel('Search ambassadors').fill('Ama Example');
    await expect(page.locator('main tbody tr').filter({ hasText: 'Ama Example' })).toHaveCount(1);
  });

  test('the problem file: counts, statuses and the exact reason for each of the seven problems', async ({ page, context }) => {
    await openNetwork(page, context);
    const dialog = await startImport(page, FIXTURE);
    expect(await readCounts(page)).toEqual({ Valid: 11, Warnings: 3, Errors: 2, 'Duplicates merged': 1, 'Already exist': 0 });
    await expect(dialog.getByText('ambassadors-problem-rows.csv: 17 rows read.')).toBeVisible();

    const rows = dialog.getByTestId('table-row');

    // errors
    await dialog.getByRole('radio', { name: /^Errors/ }).click();
    await expect(rows).toHaveCount(2);
    await expect(dialog.getByText(/Email contains spaces/)).toBeVisible(); // 3: not silently fixed
    await expect(dialog.getByText(/Biography is 1100 characters; the limit is 1000/)).toBeVisible(); // 7: hard error
    for (const line of await rows.all()) await expect(line.getByText('Error', { exact: true }).first()).toBeVisible(); // a word, not only a colour

    // warnings
    await dialog.getByRole('radio', { name: /^Warnings/ }).click();
    await expect(rows).toHaveCount(3);
    await expect(dialog.getByText(/does not look like a 10-digit number/)).toBeVisible(); // 4: odd phone
    await expect(dialog.getByText(/City not recognised, kept as typed: "Somewhereville"/)).toBeVisible(); // 5: unrecognised city
    await expect(dialog.getByText(/Biography is 450 characters; listing cards cut it off after 400/)).toBeVisible(); // 7: soft warning

    // merged duplicate
    await dialog.getByRole('radio', { name: /^Merged/ }).click();
    await expect(rows).toHaveCount(1);
    await expect(dialog.getByText('Replaced by line 4')).toBeVisible(); // 1: the older submission is replaced by the newer one

    // valid, with notes about what was converted (4: +233 and stuck-together numbers)
    await dialog.getByRole('radio', { name: /^Valid/ }).click();
    await expect(rows).toHaveCount(8); // page size 8
    await expect(dialog.getByText(/Converted the \+233 format/).first()).toBeVisible();
    await expect(dialog.getByText(/Two numbers were stuck together/)).toBeVisible();
    await expect(dialog.getByText(/Two numbers found/)).toBeVisible();

    // 6: the picture note is shown in the UI
    await expect(dialog.getByTestId('picture-note')).toContainText('Anyone with the link');
  });

  test('importing the problem file creates 14 people, merges the duplicate, and keeps names clean, +233 numbers local, regions and the newest bio', async ({ page, context }) => {
    await openNetwork(page, context);
    await runImport(page, FIXTURE);
    expect(await resultCounts(page)).toEqual({ Created: 14, Updated: 0, Skipped: 0, Failed: 2, 'Duplicates merged': 1 });
    await page.getByTestId('import-done').click();
    await page.getByLabel('Search ambassadors').fill('Test Person Three'); // the name had extra spaces in the file
    await expect(page.locator('main tbody tr').filter({ hasText: 'Test Person Three' })).toHaveCount(1);
    await page.getByLabel('Search ambassadors').fill('Test Person Two');
    await expect(page.locator('main tbody tr')).toHaveCount(1); // the two submissions are one person
    const out = await exportAll(page, /^Export filtered results/);
    expect(out.text).toContain('NEW biography of person two.');
    expect(out.text).not.toContain('OLD biography');
  });

  test('Skip leaves an existing person alone; Update fills in what the file has and keeps the referral code', async ({ page, context }) => {
    await openNetwork(page, context);
    await runImport(page, FIXTURE);
    await page.getByTestId('import-done').click();
    await page.getByLabel('Search ambassadors').fill('Test Person One');
    const row = page.locator('main tbody tr').filter({ hasText: 'Test Person One' });
    await expect(row).toHaveCount(1);
    const before = await exportAll(page, /^Export filtered results/);

    // Skip is the default: the one existing person is skipped and nothing changes
    await runImport(page, UPDATE_FIXTURE);
    expect(await resultCounts(page)).toEqual({ Created: 0, Updated: 0, Skipped: 1, Failed: 0, 'Duplicates merged': 0 });
    await page.getByTestId('import-done').click();
    await expect(row).toHaveCount(1);
    await expect(page.locator('main tbody tr').filter({ hasText: 'Updated' })).toHaveCount(0);

    // Update: the name, bio and city change; the person is still one row (the status rules have their own tests below)
    await runImport(page, UPDATE_FIXTURE, 'Update');
    expect(await resultCounts(page)).toEqual({ Created: 0, Updated: 1, Skipped: 0, Failed: 0, 'Duplicates merged': 0 });
    await page.getByTestId('import-done').click();
    await page.getByLabel('Search ambassadors').fill('Test Person One Updated');
    await expect(page.locator('main tbody tr')).toHaveCount(1);
    const after = await exportAll(page, /^Export filtered results/);
    expect(before.text).toContain('Short fake bio.');
    expect(after.text).toContain('UPDATED biography for person one.');
    expect(after.text).toContain('020 000 0099');
  });

  test('the error report downloads with the line number, email and reason of each failed row', async ({ page, context }) => {
    await openNetwork(page, context);
    await runImport(page, FIXTURE);
    const dialog = page.getByTestId('import-dialog');
    const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByTestId('download-error-report').click()]);
    const text = readFileSync((await download.path())!, 'utf8');
    expect(text.startsWith(BOM)).toBe(true);
    const table = await parseCsv(text);
    expect(table[0]).toEqual(['row', 'email', 'reason']);
    expect(table).toHaveLength(3);
    expect(table.map((r) => r[0]).slice(1)).toEqual(['6', '16']);
    expect(table[1][2]).toMatch(/spaces/i);
    expect(table[2][2]).toMatch(/1000/);
  });

  test('bad files end as a calm message in step 1: wrong type, empty, too big, no email column, no rows', async ({ page, context }) => {
    await openNetwork(page, context);
    await page.getByTestId('import-open').click();
    const dialog = page.getByTestId('import-dialog');
    const input = dialog.getByTestId('import-file-input');
    await input.setInputFiles({ name: 'people.xlsx', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from('x') });
    await expect(dialog.getByTestId('import-error')).toContainText('not a .csv');
    await input.setInputFiles({ name: 'empty.csv', mimeType: 'text/csv', buffer: Buffer.alloc(0) });
    await expect(dialog.getByTestId('import-error')).toContainText('empty');
    await input.setInputFiles({ name: 'big.csv', mimeType: 'text/csv', buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 97) });
    await expect(dialog.getByTestId('import-error')).toContainText('The limit is 5 MB');
    await input.setInputFiles({ name: 'noemail.csv', mimeType: 'text/csv', buffer: Buffer.from('Full Name,City\nA,Accra\n') });
    await expect(dialog.getByTestId('import-error')).toContainText('no Email column');
    await input.setInputFiles({ name: 'norows.csv', mimeType: 'text/csv', buffer: Buffer.from('Full Name,Email\n') });
    await expect(dialog.getByTestId('import-error')).toContainText('no people below');
    // an all-error file cannot continue
    await input.setInputFiles({ name: 'allbad.csv', mimeType: 'text/csv', buffer: Buffer.from('Full Name,Email\nA,not-an-email\n') });
    await expect(dialog.getByTestId('import-counts')).toBeVisible();
    await expect(dialog.getByTestId('import-continue')).toBeDisabled();
    await expect(dialog.getByText('No row can be imported')).toBeVisible();
  });

  test('a 5,000-row file previews without freezing the page', async ({ page, context }) => {
    await openNetwork(page, context);
    const lines = ['Timestamp,Full Name,Email,Phone and WhatsApp number,Country,City,Picture,Biography'];
    for (let i = 0; i < 5000; i++) lines.push(`2026/10/01 9:00:00 AM GMT,Test Person ${i},big.${i}@example.com,02${String(i).padStart(8, '0')},Ghana,Accra,https://drive.google.com/open?id=F${i},Fake bio`);
    const started = Date.now();
    await startImport(page, { name: 'big.csv', mimeType: 'text/csv', buffer: Buffer.from(lines.join('\r\n')) });
    expect((await readCounts(page)).Valid).toBe(5000);
    expect(Date.now() - started).toBeLessThan(20_000);
    // the page still answers while the dialog is open
    await page.getByRole('radio', { name: /^Valid/ }).click();
    await expect(page.getByTestId('import-dialog').getByTestId('table-row').first()).toBeVisible();
  });
});

test.describe('Ambassadors: status of imported people (mock mode)', () => {
  test.skip(!MOCK_RUN, 'the Ambassadors list runs on sample data: see npm run test:e2e:mock');
  test.use({ viewport: { width: 1440, height: 900 } });

  const statusesOf = (text: string, table: string[][]) => {
    const column = table[0].indexOf('status');
    return table.slice(1).map((row) => row[column]);
  };

  test('the default is Active: preselected and visible in the preview, the options step, the result and the exported file', async ({ page, context }) => {
    await openNetwork(page, context);
    const dialog = await startImport(page, FIXTURE);
    await expect(dialog.getByTestId('preview-status-note')).toContainText('created as Active');
    await expect(dialog.getByTestId('table-row').first().getByTestId('row-becomes')).toHaveText('Will be created as Active');
    await dialog.getByTestId('import-continue').click();
    const choice = dialog.getByTestId('status-choice');
    await expect(choice).toBeVisible();
    await expect(choice.getByRole('radio', { name: 'Active' })).toHaveAttribute('aria-checked', 'true');
    await expect(choice.getByRole('radio', { name: 'Pending' })).toHaveAttribute('aria-checked', 'false');
    await expect(dialog.getByTestId('import-summary')).toContainText('14 new ambassadors will be created as Active');
    await dialog.getByTestId('import-confirm').click();
    await expect(dialog.getByTestId('result-status')).toContainText('created as Active');
    await expect(dialog.getByTestId('import-announcement')).toContainText('14 created as Active');
    await dialog.getByTestId('import-done').click();
    await page.getByLabel('Search ambassadors').fill('Test Person');
    const out = await exportAll(page, /^Export filtered results/);
    const table = await parseCsv(out.text);
    const statuses = statusesOf(out.text, table);
    expect(statuses).toHaveLength(13);
    expect(new Set(statuses)).toEqual(new Set(['active']));
    // the list shows the Active badge too
    await expect(page.locator('main tbody tr').first()).toContainText('Active');
  });

  test('switching to Pending changes the preview note, the row captions, the summary, the result and the file', async ({ page, context }) => {
    await openNetwork(page, context);
    const dialog = await startImport(page, FIXTURE);
    await dialog.getByTestId('import-continue').click();
    await dialog.getByTestId('status-choice').getByRole('radio', { name: 'Pending' }).click();
    await expect(dialog.getByTestId('import-summary')).toContainText('14 new ambassadors will be created as Pending');
    await dialog.getByRole('button', { name: 'Back' }).click();
    await expect(dialog.getByTestId('preview-status-note')).toContainText('created as Pending');
    await expect(dialog.getByTestId('table-row').first().getByTestId('row-becomes')).toHaveText('Will be created as Pending');
    await dialog.getByTestId('import-continue').click();
    await expect(dialog.getByTestId('status-choice').getByRole('radio', { name: 'Pending' })).toHaveAttribute('aria-checked', 'true'); // the choice survives Back
    await dialog.getByTestId('import-confirm').click();
    await expect(dialog.getByTestId('result-status')).toContainText('created as Pending');
    await dialog.getByTestId('import-done').click();
    await page.getByLabel('Search ambassadors').fill('Test Person');
    const out = await exportAll(page, /^Export filtered results/);
    expect(new Set(statusesOf(out.text, await parseCsv(out.text)))).toEqual(new Set(['pending']));
  });

  test('a status column in the file is ignored: pending, active and even an invalid value all become the chosen status, with no error', async ({ page, context }) => {
    await openNetwork(page, context);
    const dialog = await startImport(page, STATUS_COLUMN_FIXTURE);
    expect(await readCounts(page)).toMatchObject({ Valid: 3, Errors: 0 }); // "banana" was an error in the old version
    await expect(dialog.getByTestId('preview-status-note')).toContainText('The Status column in the file is ignored');
    await dialog.getByTestId('import-continue').click();
    await dialog.getByTestId('import-confirm').click();
    await expect(dialog.getByTestId('import-result')).toBeVisible();
    await dialog.getByTestId('import-done').click();
    await page.getByLabel('Search ambassadors').fill('Column Test');
    const out = await exportAll(page, /^Export filtered results/);
    expect(statusesOf(out.text, await parseCsv(out.text))).toEqual(['active', 'active', 'active']);
  });

  test('an update never changes the status of someone who already exists, whatever the file or the wizard says', async ({ page, context }) => {
    await openNetwork(page, context);
    // Test Person One is created as Pending...
    await runImport(page, FIXTURE, undefined, 'Pending');
    await page.getByTestId('import-done').click();
    await page.getByLabel('Search ambassadors').fill('Test Person One');
    const before = await parseCsv((await exportAll(page, /^Export filtered results/)).text);
    expect(statusesOf('', before)).toEqual(['pending']);
    // ...then the update file (status column "active") is applied with Update and Active chosen
    const dialog = await runImport(page, UPDATE_FIXTURE, 'Update', 'Active');
    await expect(dialog.getByTestId('result-status')).toContainText('Existing ambassadors kept their status');
    expect(await resultCounts(page)).toMatchObject({ Created: 0, Updated: 1 });
    await page.getByTestId('import-done').click();
    await page.getByLabel('Search ambassadors').fill('Test Person One Updated');
    const after = await parseCsv((await exportAll(page, /^Export filtered results/)).text);
    expect(after[1][after[0].indexOf('fullName')]).toBe('Test Person One Updated'); // the update did apply
    expect(statusesOf('', after)).toEqual(['pending']); // but the status did not move
    // and the preview said so for that row
    const again = await startImport(page, UPDATE_FIXTURE);
    await expect(again.getByTestId('table-row').first().getByTestId('row-becomes')).toHaveText('Keeps their current status');
  });

  test('the audit log records the status chosen', async ({ page, context }) => {
    await openNetwork(page, context);
    await runImport(page, FIXTURE, undefined, 'Pending');
    await page.getByTestId('import-done').click();
    await page.getByTestId('history-open').click();
    const entry = page.getByTestId('history-dialog').getByTestId('history-entry').first();
    await expect(entry).toContainText('14 created as pending');
    await expect(entry).toContainText('statusForNewAmbassadors');
    await expect(entry).toContainText('pending');
  });
});

test.describe('Ambassadors: phone details (434px, mock mode)', () => {
  test.skip(!MOCK_RUN, 'the Ambassadors list runs on sample data: see npm run test:e2e:mock');
  test.use({ viewport: { width: 434, height: 900 } });

  const intersects = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

  test('a toast never covers the buttons of the import wizard or of the export dialog', async ({ page, context }) => {
    await openNetwork(page, context);
    const dialog = await startImport(page, FIXTURE);
    await dialog.getByTestId('import-continue').click();
    await dialog.getByTestId('import-confirm').click();
    await expect(dialog.getByTestId('import-result')).toBeVisible();
    // the "Imported 14 ambassadors" toast is on screen while the result step shows its buttons
    const toast = page.getByTestId('toast').filter({ hasText: /Imported 14 ambassadors/ });
    await expect(toast).toBeVisible();
    const toastBox = (await toast.boundingBox())!;
    for (const id of ['import-done', 'download-error-report']) {
      const box = await dialog.getByTestId(id).boundingBox();
      expect(box, id).not.toBeNull();
      expect(intersects(toastBox, box!), `${id} is covered by the toast`).toBe(false);
    }
    // and it sits a clear gap above the footer (in production the toast's normal offset is smaller than the footer, so this gap is what
    // keeps it off the buttons there; the dev-only 72px offset alone would hide the problem)
    const footerBox = (await dialog.getByTestId('dialog-footer').boundingBox())!;
    expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(footerBox.y - 8);
    // the toast stays inside the viewport and does not push the page sideways
    expect(toastBox.x).toBeGreaterThanOrEqual(0);
    expect(toastBox.x + toastBox.width).toBeLessThanOrEqual(434);
    await dialog.getByTestId('import-done').click();

    // export dialog opened while a toast may still be showing: Cancel and Download stay clear
    await page.getByRole('button', { name: /^Export/ }).click();
    await page.getByRole('menuitem', { name: 'Export all' }).click();
    const picker = page.getByTestId('export-dialog');
    await expect(picker).toBeVisible();
    const live = page.getByTestId('toast').first();
    if (await live.count()) {
      const live1 = (await live.boundingBox())!;
      for (const name of ['Cancel', 'Download CSV']) {
        const box = (await picker.getByRole('button', { name }).boundingBox())!;
        expect(intersects(live1, box), `${name} is covered by the toast`).toBe(false);
      }
    }
  });

  test('the preview tabs show that they scroll (fade and arrow) and the active tab scrolls into view', async ({ page, context }) => {
    await openNetwork(page, context);
    const dialog = await startImport(page, FIXTURE);
    const group = dialog.getByRole('radiogroup', { name: 'Filter rows by status' });
    const measure = () =>
      group.evaluate((el) => ({ left: el.scrollLeft, width: el.clientWidth, full: el.scrollWidth }));
    const first = await measure();
    expect(first.full).toBeGreaterThan(first.width); // the strip really is wider than the phone
    // more tabs are hidden on the right: the end fade (with its arrow) shows, the start fade does not
    await expect(dialog.getByTestId('segmented-fade-end')).toHaveCSS('opacity', '1');
    await expect(dialog.getByTestId('segmented-fade-start')).toHaveCSS('opacity', '0');
    // choosing the last tab scrolls it fully into view, and the start fade now shows
    // a plain click event, because Playwright's own click() would scroll the tab into view and hide a missing feature
    await group.getByRole('radio', { name: /^Already exist/ }).dispatchEvent('click');
    await expect.poll(async () => (await measure()).left).toBeGreaterThan(0);
    const last = group.getByRole('radio', { name: /^Already exist/ });
    await expect.poll(async () => {
      const tab = (await last.boundingBox())!;
      const strip = (await group.boundingBox())!;
      return tab.x >= strip.x - 1 && tab.x + tab.width <= strip.x + strip.width + 1;
    }).toBe(true);
    await expect(dialog.getByTestId('segmented-fade-start')).toHaveCSS('opacity', '1');
    // keyboard: Home selects the first tab and scrolls back
    await last.press('Home');
    await expect.poll(async () => (await measure()).left).toBe(0);
  });

  test('phones stay text: an export with phones and WhatsApp numbers imports back with Update and exports the same file again', async ({ page, context }) => {
    await openNetwork(page, context);
    await runImport(page, FIXTURE);
    await page.getByTestId('import-done').click();
    await page.getByLabel('Search ambassadors').fill('Test Person');
    const first = await exportAll(page, /^Export filtered results/);
    expect(first.text).toContain('020 000 0008,020 000 0009'); // two numbers split into phone and WhatsApp, with leading zeros
    expect(first.text).not.toMatch(/(^|,)0?\d{9,10}(,|\r)/m); // no bare number that Excel could turn into a number
    // import the exported file again, choosing Update: nothing changes
    const dialog = await runImport(page, first.file, 'Update');
    expect(await resultCounts(page)).toMatchObject({ Created: 0, Updated: 13, Failed: 0 });
    await dialog.getByTestId('import-done').click();
    const second = await exportAll(page, /^Export filtered results/);
    expect(second.text).toBe(first.text);
  });
});

test.describe('Ambassadors: access, history and accessibility (mock mode)', () => {
  test.skip(!MOCK_RUN, 'the Ambassadors list runs on sample data: see npm run test:e2e:mock');
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const roles of ['moderator', 'country_lead', 'database_officer', 'partnerships_officer']) {
    test(`${roles}: no Export, no Import, no History and no checkboxes (the page itself still opens where the role may view it)`, async ({ page, context }) => {
      await asRoles(context, roles);
      await page.goto(`${BASE_URL}/network`, { timeout: 30_000 });
      if (roles === 'moderator') {
        // a moderator has no access to the Network page at all
        await expect(page.getByTestId('import-open')).toHaveCount(0);
        return;
      }
      await expect(page.getByTestId('page-title')).toHaveText('Network');
      await expect(page.getByRole('button', { name: /^Export/ })).toHaveCount(0);
      await expect(page.getByTestId('import-open')).toHaveCount(0);
      await expect(page.getByTestId('history-open')).toHaveCount(0);
      await expect(page.getByRole('checkbox')).toHaveCount(0);
    });
  }

  for (const roles of ['super_admin', 'desk_lead']) {
    test(`${roles}: has Export, Import and History`, async ({ page, context }) => {
      await openNetwork(page, context, roles);
      await expect(page.getByRole('button', { name: /^Export/ })).toBeVisible();
      await expect(page.getByTestId('import-open')).toBeVisible();
      await expect(page.getByTestId('history-open')).toBeVisible();
    });
  }

  test('the permissions appear on the Roles matrix as two extra rows, edit for the two all-access roles only', async ({ page, context }) => {
    await asRoles(context, 'super_admin');
    await page.goto(`${BASE_URL}/team?tab=roles`, { timeout: 30_000 });
    for (const label of ['Ambassadors: export', 'Ambassadors: import']) {
      const row = page.locator('tbody tr').filter({ has: page.getByRole('rowheader', { name: label }) });
      await expect(row).toHaveCount(1);
      await expect(row.locator('td[data-level="edit"]')).toHaveCount(2); // super_admin and desk_lead
    }
  });

  test('history: an import and an export are recorded with who, the counts and the filters used', async ({ page, context }) => {
    await openNetwork(page, context);
    await runImport(page, FIXTURE);
    await page.getByTestId('import-done').click();
    await page.getByLabel('Search ambassadors').fill('Test Person');
    await exportAll(page, /^Export filtered results/, { allColumns: false });
    await page.getByTestId('history-open').click();
    const history = page.getByTestId('history-dialog');
    const entries = history.getByTestId('history-entry');
    await expect(entries).toHaveCount(2);
    await expect(entries.nth(0)).toContainText('Exported');
    await expect(entries.nth(0)).toContainText('filterSearch');
    await expect(entries.nth(0)).toContainText('test person'); // the search text is stored as typed, lowercased
    await expect(entries.nth(0)).toContainText('Super Admin'); // who: the role used
    await expect(entries.nth(1)).toContainText('Imported ambassadors-problem-rows.csv');
    await expect(entries.nth(1)).toContainText('14 created');
    await expect(entries.nth(1)).toContainText('2 failed');
  });

  test('the wizard: labelled file input, announced steps, focus moves to the title on each step and is trapped, Esc restores focus', async ({ page, context }) => {
    await openNetwork(page, context);
    const opener = page.getByTestId('import-open');
    await opener.focus();
    await opener.press('Enter');
    const dialog = page.getByTestId('import-dialog');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog.getByLabel('CSV file to import')).toHaveCount(1); // the input has a real label
    await expect(dialog.locator('[aria-current="step"]')).toContainText('Upload');
    // focus is inside the dialog, and Tab never leaves it
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await dialog.getByTestId('import-file-input').setInputFiles(FIXTURE);
    await expect(dialog.getByTestId('import-counts')).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByRole('heading', { name: 'Import ambassadors' })).toBeFocused(); // a new step: focus on the title
    await expect(dialog.getByTestId('import-announcement')).toContainText('Step 2 of 4: Preview');
    await expect(dialog.locator('[aria-current="step"]')).toContainText('Preview');
    await dialog.getByTestId('import-continue').click();
    await expect(dialog.getByTestId('import-announcement')).toContainText('Step 3 of 4: Options');
    // status is never colour alone
    await dialog.getByRole('button', { name: 'Back' }).click();
    await expect(dialog.getByTestId('table-row').first().getByText(/Valid|Warning|Error|Replaced/).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('phones (434px): the wizard and the picker fit, nothing is wider than the viewport, and there are no console errors', async ({ page, context }) => {
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) problems.push(message.text());
    });
    await page.setViewportSize({ width: 434, height: 900 });
    await openNetwork(page, context);
    const dialog = await startImport(page, FIXTURE);
    for (const selector of [dialog]) {
      const box = await selector.boundingBox();
      expect(box!.width).toBeLessThanOrEqual(434);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await dialog.getByRole('button', { name: 'Close Import ambassadors' }).click();
    await page.getByRole('button', { name: /^Export/ }).click();
    await page.getByRole('menuitem', { name: 'Export all' }).click();
    const picker = page.getByTestId('export-dialog');
    expect((await picker.boundingBox())!.width).toBeLessThanOrEqual(434);
    expect(problems).toEqual([]);
  });
});

// Keep the helper names used above in one place so a change to the files is a one-line edit.
void writeFileSync;
