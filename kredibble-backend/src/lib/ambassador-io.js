/**
 * BE-029: ambassador CSV import and export, the pure rules (no Express, no
 * database), so each rule can be tested on its own.
 *
 * This is the server's copy of kredibble-admin/src/lib/ambassador-io.ts and
 * kredibble-admin/src/lib/csv.ts. The admin previews a file with those rules;
 * the server runs the SAME rules again on the uploaded file and only trusts its
 * own result. When a rule changes in one place, change it in the other — the
 * shared fixtures in kredibble-admin/tests/fixtures/ambassadors-*.csv are the
 * test vectors for both.
 *
 * IMPORT: parseCsv -> mapHeaders -> readRows -> analyseImport -> planImport.
 * EXPORT: resolveExportColumns -> buildExportCsv.
 */

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** A bio longer than this gets a warning (listing cards cut it off). */
export const BIO_WARN_CHARS = 400;
/** A bio longer than this is an error: the row is not imported. */
export const BIO_MAX_CHARS = 1000;

// Server-only bounds (the admin form's own limits, see schemas/admin.js
// ambassadorCreateSchema). A file must not be able to store more than the
// form can.
const NAME_MAX_CHARS = 200;
const EMAIL_MAX_CHARS = 254;
const PLACE_MAX_CHARS = 100;
const LINK_MAX_CHARS = 1000;

/** The template columns, in order. An exported file uses exactly these headers. */
export const TEMPLATE_HEADERS = [
  'fullName', 'email', 'phone', 'whatsapp', 'country', 'region', 'city',
  'pictureUrl', 'pictureSourceUrl', 'bio', 'submittedAt', 'status',
];

/** Columns that hold contact details: exported only on an explicit opt-in. */
export const SENSITIVE_COLUMNS = ['email', 'phone', 'whatsapp'];

/** The columns the admin's picker has ticked by default. */
export const DEFAULT_EXPORT_COLUMNS = ['fullName', 'country', 'region', 'city', 'bio', 'submittedAt', 'status'];

/** Header text (lowercase, letters and digits only) -> field. */
const HEADER_ALIASES = {
  fullname: 'fullName',
  name: 'fullName',
  email: 'email',
  emailaddress: 'email',
  phone: 'phone',
  phonenumber: 'phone',
  mobile: 'phone',
  phoneandwhatsappnumber: 'phoneCombined',
  phoneandwhatsapp: 'phoneCombined',
  phonewhatsapp: 'phoneCombined',
  whatsapp: 'whatsapp',
  whatsappnumber: 'whatsapp',
  country: 'country',
  region: 'region',
  city: 'city',
  pictureurl: 'pictureUrl',
  picturesourceurl: 'pictureSourceUrl',
  picture: 'picture',
  photo: 'picture',
  bio: 'bio',
  biography: 'bio',
  timestamp: 'submittedAt',
  submittedat: 'submittedAt',
  status: 'status',
};

// ---------------------------------------------------------------------------
// CSV reading and writing (RFC 4180, same rules as the admin's lib/csv.ts)
// ---------------------------------------------------------------------------

const BOM = '\uFEFF';

/**
 * Parses CSV text into rows of cells. Quoted fields may hold commas, quotes
 * (doubled) and line breaks; rows end with CRLF, LF or a lone CR; a leading
 * byte-order mark is ignored; blank lines are dropped.
 *
 * @param {string} input
 * @returns {string[][]}
 */
export function parseCsv(input) {
  const text = input.startsWith(BOM) ? input.slice(1) : input;
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let quoteSeen = false;
  let afterCr = false;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    if (!(row.length === 1 && row[0] === '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (afterCr) {
      afterCr = false;
      if (ch === '\n') continue;
    }
    if (inQuotes) {
      if (quoteSeen) {
        quoteSeen = false;
        if (ch === '"') {
          field += '"';
          continue;
        }
        inQuotes = false;
      } else if (ch === '"') {
        quoteSeen = true;
        continue;
      } else {
        field += ch;
        continue;
      }
    }
    if (ch === '"' && field === '') inQuotes = true;
    else if (ch === ',') endField();
    else if (ch === '\n') endRow();
    else if (ch === '\r') {
      endRow();
      afterCr = true;
    } else field += ch;
  }
  if (field !== '' || row.length > 0 || quoteSeen) endRow();
  return rows;
}

/**
 * Spreadsheet formula-injection guard: a cell starting with =, +, -, @, tab
 * or carriage return gets a single quote in front, so Excel and Sheets show it
 * as text and never run it.
 *
 * @param {string} value
 * @returns {string}
 */
export function escapeFormula(value) {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/**
 * One cell, ready for a CSV line: formula-safe, and quoted when it holds a
 * comma, quote or line break.
 *
 * @param {string} value
 * @returns {string}
 */
export function csvCell(value) {
  const safe = escapeFormula(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * Rows of cells to CSV text with a UTF-8 byte-order mark (so Excel reads
 * accented names correctly), CRLF line breaks and no trailing break.
 *
 * @param {string[][]} rows
 * @returns {string}
 */
export function toCsvWithBom(rows) {
  return BOM + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

const headerKey = (text) => String(text).toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Matches the file's header row to fields, ignoring case, spaces and
 * punctuation. The sign-up form sheet's headers ("Timestamp", "Phone and
 * WhatsApp number", "Biograph...") are understood too.
 *
 * @param {string[]} header
 * @returns {{ columns: (string|null)[], ignored: string[], missing: string[] }}
 */
export function mapHeaders(header) {
  const columns = header.map((text) => {
    const key = headerKey(text);
    if (HEADER_ALIASES[key]) return HEADER_ALIASES[key];
    if (key.startsWith('biograph')) return 'bio';
    return null;
  });
  const ignored = header.filter((text, index) => columns[index] === null && text.trim() !== '');
  const present = new Set(columns);
  const missing = ['fullName', 'email']
    .filter((field) => !present.has(field))
    .map((field) => (field === 'fullName' ? 'Full name' : 'Email'));
  return { columns, ignored, missing };
}

// ---------------------------------------------------------------------------
// Field rules
// ---------------------------------------------------------------------------

/**
 * Trims and collapses runs of whitespace ("Ama   Mensah " -> "Ama Mensah").
 *
 * @param {string} value
 * @returns {string}
 */
export const cleanText = (value) => String(value).replace(/\s+/g, ' ').trim();

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Lowercases and trims an email. An email with spaces inside is an error with
 * the reason, never silently fixed.
 *
 * @param {string} raw
 * @returns {{ value: string, error?: string }}
 */
export function checkEmail(raw) {
  const value = raw.trim().toLowerCase();
  if (value === '') return { value, error: 'Email is missing' };
  if (/\s/.test(value)) return { value, error: 'Email contains spaces (not fixed automatically; correct it in the file)' };
  if (!EMAIL_SHAPE.test(value)) return { value, error: 'Email is not a valid address' };
  if (value.length > EMAIL_MAX_CHARS) return { value, error: `Email is longer than ${EMAIL_MAX_CHARS} characters` };
  return { value };
}

const LOCAL_PHONE = /^0\d{9}$/;

const localPhone = (digits) => {
  if (digits.length === 12 && digits.startsWith('233')) return { value: `0${digits.slice(3)}`, converted: true };
  if (digits.length === 13 && digits.startsWith('2330')) return { value: digits.slice(3), converted: true };
  if (digits.length === 14 && digits.startsWith('00233')) return { value: `0${digits.slice(5)}`, converted: true };
  return { value: digits, converted: false };
};

/**
 * Reads a phone cell that may hold one number or two (phone, then WhatsApp),
 * separated or stuck together. +233 / 233 / 00233 become a leading 0. The
 * result is always text, so a leading 0 can never be lost; anything that is
 * still not 10 digits starting with 0 is kept with a warning.
 *
 * @param {string} raw
 * @param {string} [fieldName]
 * @returns {{ numbers: string[], issues: { level: string, field: string, message: string }[] }}
 */
export function normalisePhones(raw, fieldName = 'Phone') {
  const issues = [];
  const text = raw.replace(/^\s*(phone|tel|mobile|whatsapp)\s*[:-]?\s*/i, '').trim();
  if (text === '') return { numbers: [], issues };

  const parts = text.split(/\s*(?:[/,;&|]|\band\b|\bor\b|\r?\n)\s*/i).filter((part) => part.trim() !== '');
  let digitRuns = parts.map((part) => part.replace(/\D/g, '')).filter((digits) => digits !== '');

  if (digitRuns.length === 1) {
    const d = digitRuns[0];
    let split = null;
    if (d.length === 20) split = [d.slice(0, 10), d.slice(10)];
    else if (d.length === 24 && d.startsWith('233') && d.slice(12).startsWith('233')) split = [d.slice(0, 12), d.slice(12)];
    else if (d.length === 22 && d.startsWith('233') && d.slice(12).startsWith('0')) split = [d.slice(0, 12), d.slice(12)];
    else if (d.length === 22 && d.slice(10).startsWith('233')) split = [d.slice(0, 10), d.slice(10)];
    if (split) {
      digitRuns = split;
      issues.push({ level: 'info', field: fieldName, message: 'Two numbers were stuck together: the first is the phone, the second the WhatsApp number' });
    }
  } else if (digitRuns.length >= 2) {
    issues.push({ level: 'info', field: fieldName, message: 'Two numbers found: the first is the phone, the second the WhatsApp number' });
  }
  if (digitRuns.length > 2) {
    issues.push({ level: 'warning', field: fieldName, message: `${digitRuns.length} numbers found; only the first two were kept` });
    digitRuns = digitRuns.slice(0, 2);
  }

  const numbers = digitRuns.map((digits) => {
    const { value, converted } = localPhone(digits);
    if (converted) issues.push({ level: 'info', field: fieldName, message: `Converted the +233 format to the local format (${value})` });
    if (!LOCAL_PHONE.test(value)) {
      issues.push({ level: 'warning', field: fieldName, message: `"${value}" does not look like a 10-digit number starting with 0 (${value.length} digits)` });
    }
    return value;
  });
  return { numbers, issues };
}

/** The sixteen regions of Ghana. */
const REGIONS = [
  'Greater Accra', 'Ashanti', 'Central', 'Eastern', 'Northern', 'Western', 'Western North', 'Volta', 'Oti', 'Bono', 'Bono East',
  'Ahafo', 'Savannah', 'North East', 'Upper East', 'Upper West',
];

/** Towns and city areas the desk expects. A city that mentions none of them (or a region) gets a warning. */
const KNOWN_PLACES = [
  'accra', 'tema', 'kumasi', 'tamale', 'takoradi', 'sekondi', 'cape coast', 'koforidua', 'sunyani', 'ho', 'wa', 'bolgatanga',
  'techiman', 'obuasi', 'tarkwa', 'winneba', 'kasoa', 'madina', 'spintex', 'dansoman', 'adenta', 'ashaiman', 'teshie', 'nungua',
  'legon', 'osu', 'east legon', 'dome', 'kpone', 'dawhenya', 'prampram', 'ada', 'aflao', 'hohoe', 'keta', 'nkawkaw', 'konongo',
  'mampong', 'ejisu', 'bekwai', 'berekum', 'dormaa', 'goaso', 'damongo', 'yendi', 'savelugu', 'navrongo', 'bawku', 'nalerigu',
  'dambai', 'sefwi wiawso', 'axim', 'elmina', 'saltpond', 'mankessim', 'assin fosu', 'swedru', 'nsawam', 'suhum', 'akim oda',
  'kade', 'asamankese', 'somanya', 'akosombo', 'sogakope', 'anloga', 'kpando', 'lashibi', 'tesano', 'labadi', 'kaneshie',
];

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PLACE_PATTERN = new RegExp(`(^|[^a-z])(${KNOWN_PLACES.map(escapeRegex).join('|')})([^a-z]|$)`);
const REGION_PATTERN = new RegExp(REGIONS.map((region) => escapeRegex(region.toLowerCase())).join('|'));

/**
 * City is free text and is never rewritten. Only two things are read from it:
 * a region, when the person wrote one with the word "Region", and whether it
 * mentions a place we know.
 *
 * @param {string} raw
 * @returns {{ city: string, region: string, recognised: boolean }}
 */
export function classifyCity(raw) {
  const city = cleanText(raw);
  let region = '';
  const match = /([A-Za-z][A-Za-z ]*?)\s+region\b/i.exec(city);
  if (match) {
    const named = cleanText(match[1]).toLowerCase();
    region = REGIONS.find((candidate) => candidate.toLowerCase() === named) ?? '';
    if (!region) region = REGIONS.filter((candidate) => named.endsWith(candidate.toLowerCase())).sort((a, b) => b.length - a.length)[0] ?? '';
  }
  const lower = city.toLowerCase();
  const recognised = city !== '' && (PLACE_PATTERN.test(lower) || REGION_PATTERN.test(lower));
  return { city, region, recognised };
}

export const DRIVE_LINK = /^https?:\/\/(drive|docs)\.google\.com\//i;
const WEB_URL = /^https?:\/\/\S+$/i;
const looksLikeUrl = (value) => WEB_URL.test(value.trim());

/**
 * Reads the form's timestamp ("2026/10/08 3:45:12 PM GMT", "10/8/2026
 * 15:45:12", ISO). Dates without a zone are taken as UTC.
 *
 * @param {string} raw
 * @returns {{ iso: string, ms: number, note?: string } | null}
 */
export function parseSubmittedAt(raw) {
  const text = raw.trim();
  if (text === '') return null;
  const time = (h, m, s, ap) => {
    let hour = Number(h ?? 0);
    if (ap) {
      const pm = ap.toLowerCase() === 'pm';
      if (hour === 12) hour = pm ? 12 : 0;
      else if (pm) hour += 12;
    }
    return { hour, minute: Number(m ?? 0), second: Number(s ?? 0) };
  };
  const build = (y, mo, d, t, note) => {
    const ms = Date.UTC(y, mo - 1, d, t.hour, t.minute, t.second);
    const check = new Date(ms);
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || t.hour > 23 || t.minute > 59 || t.second > 59) return null;
    return { iso: check.toISOString(), ms, note };
  };

  const ymd = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(AM|PM)?)?\s*(?:GMT|UTC|Z)?$/i.exec(text);
  if (ymd) return build(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]), time(ymd[4], ymd[5], ymd[6], ymd[7]));

  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?\s*(?:GMT|UTC|Z)?$/i.exec(text);
  if (dmy) {
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    const t = time(dmy[4], dmy[5], dmy[6], dmy[7]);
    if (a > 12) return build(Number(dmy[3]), b, a, t);
    if (b > 12) return build(Number(dmy[3]), a, b, t);
    return build(Number(dmy[3]), a, b, t, "Read as month/day/year (the sheet's default)");
  }
  return null;
}

// ---------------------------------------------------------------------------
// Reading rows
// ---------------------------------------------------------------------------

/**
 * Turns the table below the header row into rows with a clean record and a
 * list of issues (error, warning or info). The file's status column is never
 * read: new people get the status chosen in the wizard, and a file can never
 * change the status of someone who already exists.
 *
 * @param {string[][]} dataRows
 * @param {{ columns: (string|null)[] }} mapping
 * @param {number} [firstLine] - file line number of the first data row
 * @returns {object[]}
 */
export function readRows(dataRows, mapping, firstLine = 2) {
  const cell = (row, field) => {
    for (let index = 0; index < mapping.columns.length; index++) {
      if (mapping.columns[index] === field && (row[index] ?? '').trim() !== '') return row[index] ?? '';
    }
    return '';
  };

  return dataRows.map((row, index) => {
    const issues = [];
    const warn = (field, message) => issues.push({ level: 'warning', field, message });
    const fail = (field, message) => issues.push({ level: 'error', field, message });

    const fullName = cleanText(cell(row, 'fullName'));
    if (fullName === '') fail('Full name', 'Full name is missing');
    else if (fullName.length > NAME_MAX_CHARS) fail('Full name', `Full name is longer than ${NAME_MAX_CHARS} characters`);

    const email = checkEmail(cell(row, 'email'));
    if (email.error) fail('Email', email.error);

    // The template's own columns win over the form sheet's combined column.
    const phoneCol = cell(row, 'phone');
    const whatsappCol = cell(row, 'whatsapp');
    const phones = normalisePhones(phoneCol !== '' ? phoneCol : cell(row, 'phoneCombined'), 'Phone');
    issues.push(...phones.issues);
    const phone = phones.numbers[0] ?? '';
    let whatsapp = phones.numbers[1] ?? '';
    if (whatsappCol !== '') {
      const w = normalisePhones(whatsappCol, 'WhatsApp');
      issues.push(...w.issues);
      whatsapp = w.numbers[0] ?? whatsapp;
    }

    const country = cleanText(cell(row, 'country'));
    if (country === '') warn('Country', 'Country is missing');
    const place = classifyCity(cell(row, 'city'));
    const region = cleanText(cell(row, 'region')) || place.region;
    if (place.city === '') warn('City', 'City is missing');
    else if (!place.recognised) warn('City', `City not recognised, kept as typed: "${place.city}"`);
    for (const [label, value] of [['Country', country], ['Region', region], ['City', place.city]]) {
      if (value.length > PLACE_MAX_CHARS) fail(label, `${label} is longer than ${PLACE_MAX_CHARS} characters`);
    }

    // A Drive link is the SOURCE, not an image: pictureUrl stays empty until
    // the picture job copies the file into our storage.
    let pictureUrl = '';
    let pictureSourceUrl = cleanText(cell(row, 'pictureSourceUrl') || cell(row, 'picture'));
    const givenUrl = cleanText(cell(row, 'pictureUrl'));
    if (givenUrl !== '') {
      if (DRIVE_LINK.test(givenUrl)) {
        pictureSourceUrl = pictureSourceUrl || givenUrl;
        issues.push({ level: 'info', field: 'Picture', message: 'A Google Drive link was in the picture URL column and moved to the source link' });
      } else if (looksLikeUrl(givenUrl)) pictureUrl = givenUrl;
      else warn('Picture', 'Picture URL is not a web address and was ignored');
    }
    if (pictureSourceUrl !== '' && !looksLikeUrl(pictureSourceUrl)) warn('Picture', 'The picture link is not a web address');
    if (pictureSourceUrl !== '' && !DRIVE_LINK.test(pictureSourceUrl) && looksLikeUrl(pictureSourceUrl)) {
      issues.push({ level: 'info', field: 'Picture', message: 'The picture link is not a Google Drive link; it is kept as the source link' });
    }
    if (pictureUrl.length > LINK_MAX_CHARS || pictureSourceUrl.length > LINK_MAX_CHARS) {
      fail('Picture', `The picture link is longer than ${LINK_MAX_CHARS} characters`);
    }

    // Bio: never edited, line breaks kept.
    const bio = cell(row, 'bio');
    if (bio.length > BIO_MAX_CHARS) fail('Biography', `Biography is ${bio.length} characters; the limit is ${BIO_MAX_CHARS}`);
    else if (bio.length > BIO_WARN_CHARS) warn('Biography', `Biography is ${bio.length} characters; listing cards cut it off after ${BIO_WARN_CHARS}`);

    const rawStamp = cell(row, 'submittedAt');
    const stamp = parseSubmittedAt(rawStamp);
    if (rawStamp !== '' && !stamp) warn('Submitted at', `Could not read the date "${rawStamp}"; the newest row wins when the same email repeats`);
    if (stamp?.note) issues.push({ level: 'info', field: 'Submitted at', message: stamp.note });

    return {
      rowNumber: firstLine + index,
      record: {
        fullName, email: email.value, phone, whatsapp, country, region, city: place.city,
        pictureUrl, pictureSourceUrl, bio, submittedAt: stamp?.iso ?? '',
      },
      issues,
      emailKey: email.value,
      timestamp: stamp?.ms ?? null,
      exists: false,
    };
  });
}

/**
 * Whether a row has an error (never imported), only warnings, or nothing.
 *
 * @param {{ issues: { level: string }[] }} row
 * @returns {'error'|'warning'|'valid'}
 */
export const rowOutcome = (row) => (
  row.issues.some((issue) => issue.level === 'error') ? 'error'
    : row.issues.some((issue) => issue.level === 'warning') ? 'warning' : 'valid'
);

// ---------------------------------------------------------------------------
// Merging and matching
// ---------------------------------------------------------------------------

/**
 * The same email submitted several times: the LATEST submission by timestamp
 * is kept and older ones are marked `mergedInto` the winner's line. A row with
 * no readable timestamp counts as the oldest; on a tie the later line wins.
 * Rows whose email is already in the system are marked `exists`.
 *
 * @param {object[]} rows - from readRows
 * @param {Set<string>} existingEmails - lowercase emails already stored
 * @returns {{ rows: object[], counts: { total: number, valid: number, warnings: number, errors: number, merged: number, exists: number } }}
 */
export function analyseImport(rows, existingEmails) {
  const marked = rows.map((row) => ({ ...row, mergedInto: undefined, exists: false }));
  const groups = new Map();
  for (const row of marked) {
    if (row.emailKey === '') continue;
    const list = groups.get(row.emailKey) ?? [];
    list.push(row);
    groups.set(row.emailKey, list);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const winner = [...list].sort((a, b) => (b.timestamp ?? -Infinity) - (a.timestamp ?? -Infinity) || b.rowNumber - a.rowNumber)[0];
    for (const row of list) if (row !== winner) row.mergedInto = winner.rowNumber;
  }

  const counts = { total: marked.length, valid: 0, warnings: 0, errors: 0, merged: 0, exists: 0 };
  for (const row of marked) {
    if (row.mergedInto !== undefined) {
      counts.merged++;
      continue;
    }
    const outcome = rowOutcome(row);
    if (outcome === 'error') {
      counts.errors++;
      continue;
    }
    if (outcome === 'warning') counts.warnings++;
    else counts.valid++;
    if (row.emailKey !== '' && existingEmails.has(row.emailKey)) {
      row.exists = true;
      counts.exists++;
    }
  }
  return { rows: marked, counts };
}

/**
 * Sorts the analysed rows into what the import will do. Rows with an error
 * never reach `creates` or `updates`; existing people are updated or skipped
 * per `choice`.
 *
 * @param {{ rows: object[] }} preview - from analyseImport
 * @param {'skip'|'update'} choice
 * @returns {{ creates: object[], updates: object[], skipped: number, errorRows: { row: number, email: string, reason: string }[] }}
 */
export function planImport(preview, choice) {
  const creates = [];
  const updates = [];
  const errorRows = [];
  let skipped = 0;
  for (const row of preview.rows) {
    if (row.mergedInto !== undefined) continue;
    if (rowOutcome(row) === 'error') {
      const reason = row.issues.filter((issue) => issue.level === 'error').map((issue) => issue.message).join('; ');
      errorRows.push({ row: row.rowNumber, email: row.record.email, reason });
      continue;
    }
    if (!row.exists) creates.push(row);
    else if (choice === 'update') updates.push(row);
    else skipped++;
  }
  return { creates, updates, skipped, errorRows };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * The CSV status: pending = not yet working as an ambassador (applicant,
 * onboarding); active = working (active, dormant).
 *
 * @param {string} status
 * @returns {'pending'|'active'}
 */
export const statusToCsv = (status) => (status === 'applicant' || status === 'onboarding' ? 'pending' : 'active');

/**
 * Excel turns a bare 0257349584 into the number 257349584 when a CSV is
 * opened by double-click. A value with spaces is text, so the leading 0
 * survives: "025 734 9584". The importer strips non-digits, so the file
 * imports back unchanged.
 *
 * @param {string|undefined} value
 * @returns {string}
 */
export function formatPhoneForExcel(value) {
  const v = (value ?? '').trim();
  if (!/^\d{7,}$/.test(v)) return v;
  if (v.length === 10) return `${v.slice(0, 3)} ${v.slice(3, 6)} ${v.slice(6)}`;
  return v.replace(/(\d{3})(?=\d)/g, '$1 ');
}

/**
 * The columns an export will actually contain, in template order. Unknown
 * names are dropped, and sensitive columns are dropped unless the caller
 * opted in — whatever the column list says.
 *
 * @param {string[]|undefined} requested
 * @param {boolean} includeSensitive
 * @returns {string[]}
 */
export function resolveExportColumns(requested, includeSensitive) {
  const wanted = new Set(requested?.length ? requested : DEFAULT_EXPORT_COLUMNS);
  return TEMPLATE_HEADERS.filter((key) => wanted.has(key) && (includeSensitive || !SENSITIVE_COLUMNS.includes(key)));
}

const isoOf = (value) => (value instanceof Date ? value.toISOString() : String(value ?? ''));

const cellFor = (ambassador, key) => {
  switch (key) {
    case 'fullName': return ambassador.fullName ?? '';
    case 'email': return ambassador.email ?? '';
    case 'phone': return formatPhoneForExcel(ambassador.phone);
    case 'whatsapp': return formatPhoneForExcel(ambassador.whatsapp);
    case 'country': return ambassador.country ?? '';
    case 'region': return ambassador.region ?? '';
    case 'city': return ambassador.city ?? '';
    // Only a real web address: never a data: or blob: value.
    case 'pictureUrl': return /^https?:\/\//i.test(ambassador.profilePhoto ?? '') ? ambassador.profilePhoto : '';
    case 'pictureSourceUrl': return ambassador.pictureSourceUrl ?? '';
    case 'bio': return ambassador.description ?? '';
    case 'submittedAt': return ambassador.submittedAt ? isoOf(ambassador.submittedAt) : (ambassador.joinedAt ?? '');
    case 'status': return statusToCsv(ambassador.status);
    default: return '';
  }
};

/**
 * The export file (with a byte-order mark) for stored ambassadors and the
 * resolved columns. Every cell goes through the formula guard.
 *
 * @param {object[]} ambassadors - lean Ambassador documents
 * @param {string[]} columns - from resolveExportColumns
 * @returns {string}
 */
export function buildExportCsv(ambassadors, columns) {
  return toCsvWithBom([[...columns], ...ambassadors.map((ambassador) => columns.map((key) => cellFor(ambassador, key)))]);
}
