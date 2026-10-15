/**
 * Ambassador import and export: the pure rules (no React, no store), so every rule can be tested on its own.
 *
 * IMPORT. A CSV (the template, or the original sign-up form sheet) goes through four stages:
 *   1. mapHeaders: header names are matched to fields, ignoring case, spaces and punctuation. The form sheet's headers
 *      ("Timestamp", "Full Name", "Phone and WhatsApp number", "Picture", "Biograph...") are understood too.
 *   2. readRows: each data row becomes an ImportRow with a clean record and a list of issues (error, warning or info).
 *      Nothing is silently "fixed" except harmless whitespace and phone formatting, and every change that is not
 *      harmless is reported.
 *   3. analyseImport: the same person submitting twice is merged (the latest submission wins), and rows whose email is
 *      already in the system are flagged.
 *   4. applyImport: builds the new list of ambassadors. Rows with an error never reach it.
 *
 * The seven known problems of the real sign-up sheet are handled here; see the notes on `normalisePhones`,
 * `classifyCity`, `readRows` (email, picture, bio) and `analyseImport` (duplicates).
 *
 * EXPORT. `buildExportCsv` writes the template headers (so a file can be imported again). Phone numbers are written with
 * spaces ("025 734 9584") because Excel keeps a value with spaces as text, so the leading 0 survives a double-click open;
 * the importer strips non-digits, so the file still round-trips. Every text cell goes through escapeFormula.
 */
import { csvWithBom, toCsv } from "@/lib/csv";
import type { Ambassador, AmbassadorStatus } from "@/lib/mock-entities";

// ---------------------------------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------------------------------

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** A bio longer than this gets a warning (listing cards cut it off). */
export const BIO_WARN_CHARS = 400;
/** A bio longer than this is an error: the row is not imported. */
export const BIO_MAX_CHARS = 1000;

/** The template columns, in order. An exported file uses exactly these headers. */
export const TEMPLATE_HEADERS = [
  "fullName",
  "email",
  "phone",
  "whatsapp",
  "country",
  "region",
  "city",
  "pictureUrl",
  "pictureSourceUrl",
  "bio",
  "submittedAt",
  "status",
] as const;
export type ImportField = (typeof TEMPLATE_HEADERS)[number];

/** A column the importer understands: a template field, or one of two columns that only the sign-up form sheet has. */
export type SourceField = ImportField | "phoneCombined" | "picture";

/** Header text (lowercase, letters and digits only) -> field. */
const HEADER_ALIASES: Record<string, SourceField> = {
  fullname: "fullName",
  name: "fullName",
  email: "email",
  emailaddress: "email",
  phone: "phone",
  phonenumber: "phone",
  mobile: "phone",
  phoneandwhatsappnumber: "phoneCombined",
  phoneandwhatsapp: "phoneCombined",
  phonewhatsapp: "phoneCombined",
  whatsapp: "whatsapp",
  whatsappnumber: "whatsapp",
  country: "country",
  region: "region",
  city: "city",
  pictureurl: "pictureUrl",
  picturesourceurl: "pictureSourceUrl",
  picture: "picture",
  photo: "picture",
  bio: "bio",
  biography: "bio",
  timestamp: "submittedAt",
  submittedat: "submittedAt",
  status: "status",
};

export const ALL_EXPORT_COLUMNS: readonly { key: ImportField; label: string; sensitive: boolean; defaultOn: boolean; note?: string }[] = [
  { key: "fullName", label: "Full name", sensitive: false, defaultOn: true },
  { key: "email", label: "Email", sensitive: true, defaultOn: false, note: "Needed to import this file again" },
  { key: "phone", label: "Phone", sensitive: true, defaultOn: false },
  { key: "whatsapp", label: "WhatsApp", sensitive: true, defaultOn: false },
  { key: "country", label: "Country", sensitive: false, defaultOn: true },
  { key: "region", label: "Region", sensitive: false, defaultOn: true },
  { key: "city", label: "City", sensitive: false, defaultOn: true },
  { key: "pictureUrl", label: "Picture URL (our storage)", sensitive: false, defaultOn: false },
  { key: "pictureSourceUrl", label: "Picture source link (Google Drive)", sensitive: false, defaultOn: false },
  { key: "bio", label: "Biography", sensitive: false, defaultOn: true },
  { key: "submittedAt", label: "Submitted at", sensitive: false, defaultOn: true },
  { key: "status", label: "Status", sensitive: false, defaultOn: true },
];

// ---------------------------------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------------------------------

export type IssueLevel = "error" | "warning" | "info";
export interface RowIssue {
  level: IssueLevel;
  field?: string;
  message: string;
}

/** One row of the file, cleaned. Every value is text (a phone number is never a number). */
export interface ImportRecord {
  fullName: string;
  email: string;
  phone: string;
  whatsapp: string;
  country: string;
  region: string;
  city: string;
  pictureUrl: string;
  pictureSourceUrl: string;
  bio: string;
  /** ISO date-time, or "" when the file had none or it could not be read. */
  submittedAt: string;
}

export interface ImportRow {
  /** The row's line number in the file (the header is line 1, so the first person is line 2). */
  rowNumber: number;
  record: ImportRecord;
  issues: RowIssue[];
  /** The lowercase, trimmed email, or "" when there is none. The unique key. */
  emailKey: string;
  /** Milliseconds of submittedAt, or null. */
  timestamp: number | null;
  /** Set on an OLDER submission of the same person: the line number of the newer one that replaces it. */
  mergedInto?: number;
  /** The email is already in the system. */
  exists: boolean;
}

export type RowOutcome = "valid" | "warning" | "error";
export const rowOutcome = (row: ImportRow): RowOutcome =>
  row.issues.some((issue) => issue.level === "error") ? "error" : row.issues.some((issue) => issue.level === "warning") ? "warning" : "valid";

export interface HeaderMapping {
  /** For each column of the file, the field it fills, or null when it is not understood. */
  columns: (SourceField | null)[];
  /** Header texts that were not understood (ignored). */
  ignored: string[];
  /** Required fields no column fills (the file cannot be imported without them). */
  missing: string[];
}

export interface ImportPreview {
  rows: ImportRow[];
  counts: {
    total: number;
    /** After merging: rows with no issue at all. */
    valid: number;
    warnings: number;
    errors: number;
    /** Older submissions replaced by a newer one of the same person. */
    merged: number;
    /** Rows (after merging, without errors) whose email is already in the system. */
    exists: number;
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------------------------------------------------

const headerKey = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Matches the file's header row to fields. */
export function mapHeaders(header: readonly string[]): HeaderMapping {
  const columns = header.map((text): SourceField | null => {
    const key = headerKey(text);
    if (HEADER_ALIASES[key]) return HEADER_ALIASES[key];
    if (key.startsWith("biograph")) return "bio"; // the sheet's header is cut off ("Biograph...")
    return null;
  });
  const ignored = header.filter((_, index) => columns[index] === null && header[index].trim() !== "");
  const present = new Set(columns);
  const missing = (["fullName", "email"] as const).filter((field) => !present.has(field)).map((field) => (field === "fullName" ? "Full name" : "Email"));
  return { columns, ignored, missing };
}

// ---------------------------------------------------------------------------------------------------------------------
// Field rules
// ---------------------------------------------------------------------------------------------------------------------

/** Trims and collapses runs of whitespace ("Ama   Mensah " -> "Ama Mensah"). Issue 2. */
export const cleanText = (value: string): string => value.replace(/\s+/g, " ").trim();

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Issue 3: an email with spaces inside it is an error with the reason, never silently fixed. Spaces around it are trimmed.
 * Returns the lowercase value and an error message, if any.
 */
export function checkEmail(raw: string): { value: string; error?: string } {
  const value = raw.trim().toLowerCase();
  if (value === "") return { value, error: "Email is missing" };
  if (/\s/.test(value)) return { value, error: "Email contains spaces (not fixed automatically; correct it in the file)" };
  if (!EMAIL_SHAPE.test(value)) return { value, error: "Email is not a valid address" };
  return { value };
}

const LOCAL_PHONE = /^0\d{9}$/;

/** One run of digits -> the local format: +233 / 233 / 00233 become a leading 0. */
function localPhone(digits: string): { value: string; converted: boolean } {
  if (digits.length === 12 && digits.startsWith("233")) return { value: `0${digits.slice(3)}`, converted: true };
  if (digits.length === 13 && digits.startsWith("2330")) return { value: digits.slice(3), converted: true };
  if (digits.length === 14 && digits.startsWith("00233")) return { value: `0${digits.slice(5)}`, converted: true };
  return { value: digits, converted: false };
}

export interface PhoneResult {
  /** The numbers found, in order, as TEXT in local format ("0257349584"). */
  numbers: string[];
  issues: RowIssue[];
}

/**
 * Issue 4. Reads a phone cell that may hold one number or two stuck together.
 * - A "Phone:" prefix, spaces, dashes and brackets are dropped; only digits are kept.
 * - Two numbers separated by "/", ",", ";", "&", "and", "or" or a line break are split on the separator.
 * - Two numbers stuck together (20 digits, or 24 with +233 on both, or 10 + 12 / 12 + 10) are split by length.
 * - +233 / (+233) / 233 / 00233 become a leading 0.
 * - Anything that still is not 10 digits starting with 0 is kept as typed (digits only) and gets a WARNING. Never numeric:
 *   the result is always text, so the leading 0 cannot be lost.
 */
export function normalisePhones(raw: string, fieldName = "Phone"): PhoneResult {
  const issues: RowIssue[] = [];
  const text = raw.replace(/^\s*(phone|tel|mobile|whatsapp)\s*[:\-]?\s*/i, "").trim();
  if (text === "") return { numbers: [], issues };

  const parts = text.split(/\s*(?:[/,;&|]|\band\b|\bor\b|\r?\n)\s*/i).filter((part) => part.trim() !== "");
  let digitRuns = parts.map((part) => part.replace(/\D/g, "")).filter((digits) => digits !== "");

  if (digitRuns.length === 1) {
    const d = digitRuns[0];
    let split: string[] | null = null;
    if (d.length === 20) split = [d.slice(0, 10), d.slice(10)];
    else if (d.length === 24 && d.startsWith("233") && d.slice(12).startsWith("233")) split = [d.slice(0, 12), d.slice(12)];
    else if (d.length === 22 && d.startsWith("233") && d.slice(12).startsWith("0")) split = [d.slice(0, 12), d.slice(12)];
    else if (d.length === 22 && d.slice(10).startsWith("233")) split = [d.slice(0, 10), d.slice(10)];
    if (split) {
      digitRuns = split;
      issues.push({ level: "info", field: fieldName, message: "Two numbers were stuck together: the first is the phone, the second the WhatsApp number" });
    }
  } else if (digitRuns.length >= 2) {
    issues.push({ level: "info", field: fieldName, message: "Two numbers found: the first is the phone, the second the WhatsApp number" });
  }
  if (digitRuns.length > 2) {
    issues.push({ level: "warning", field: fieldName, message: `${digitRuns.length} numbers found; only the first two were kept` });
    digitRuns = digitRuns.slice(0, 2);
  }

  const numbers = digitRuns.map((digits) => {
    const { value, converted } = localPhone(digits);
    if (converted) issues.push({ level: "info", field: fieldName, message: `Converted the +233 format to the local format (${value})` });
    if (!LOCAL_PHONE.test(value)) {
      issues.push({ level: "warning", field: fieldName, message: `"${value}" does not look like a 10-digit number starting with 0 (${value.length} digits)` });
    }
    return value;
  });
  return { numbers, issues };
}

/** The sixteen regions of Ghana. */
const REGIONS = [
  "Greater Accra", "Ashanti", "Central", "Eastern", "Northern", "Western", "Western North", "Volta", "Oti", "Bono", "Bono East",
  "Ahafo", "Savannah", "North East", "Upper East", "Upper West",
];

/** Towns and city areas the desk expects. A city that mentions none of them (or a region) gets a warning. */
const KNOWN_PLACES = [
  "accra", "tema", "kumasi", "tamale", "takoradi", "sekondi", "cape coast", "koforidua", "sunyani", "ho", "wa", "bolgatanga",
  "techiman", "obuasi", "tarkwa", "winneba", "kasoa", "madina", "spintex", "dansoman", "adenta", "ashaiman", "teshie", "nungua",
  "legon", "osu", "east legon", "dome", "kpone", "dawhenya", "prampram", "ada", "aflao", "hohoe", "keta", "nkawkaw", "konongo",
  "mampong", "ejisu", "bekwai", "berekum", "dormaa", "goaso", "damongo", "yendi", "savelugu", "navrongo", "bawku", "nalerigu",
  "dambai", "sefwi wiawso", "axim", "elmina", "saltpond", "mankessim", "assin fosu", "swedru", "nsawam", "suhum", "akim oda",
  "kade", "asamankese", "somanya", "akosombo", "sogakope", "anloga", "kpando", "lashibi", "tesano", "labadi", "kaneshie",
];

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// One pattern for every known place, built once (a 5,000-row file must not build 70 patterns per row).
const PLACE_PATTERN = new RegExp(`(^|[^a-z])(${KNOWN_PLACES.map(escapeRegex).join("|")})([^a-z]|$)`);
const REGION_PATTERN = new RegExp(REGIONS.map((region) => escapeRegex(region.toLowerCase())).join("|"));

/**
 * Issue 5. City is free text, so it is NEVER rewritten. Only two things are read from it:
 * - a region, when the person wrote one with the word "Region" ("Greater Accra Region", "Northern Region(Tamale)");
 *   a region is never guessed from a city name;
 * - whether it mentions a place we know. If not, the caller adds a warning.
 */
export function classifyCity(raw: string): { city: string; region: string; recognised: boolean } {
  const city = cleanText(raw);
  let region = "";
  const match = /([A-Za-z][A-Za-z ]*?)\s+region\b/i.exec(city);
  if (match) {
    const named = cleanText(match[1]).toLowerCase();
    region = REGIONS.find((candidate) => candidate.toLowerCase() === named) ?? "";
    // "Accra (Dansoman) in Greater Accra Region": the words just before "Region" may carry extra words, so look for a region name inside them.
    if (!region) region = REGIONS.filter((candidate) => named.endsWith(candidate.toLowerCase())).sort((a, b) => b.length - a.length)[0] ?? "";
  }
  const lower = city.toLowerCase();
  const recognised =
    city !== "" &&
    (PLACE_PATTERN.test(lower) || REGION_PATTERN.test(lower));
  return { city, region, recognised };
}

const DRIVE_LINK = /^https?:\/\/(drive|docs)\.google\.com\//i;
const WEB_URL = /^https?:\/\/\S+$/i;

/** Reads the form's timestamp ("2026/10/08 3:45:12 PM GMT", "10/8/2026 15:45:12", ISO). Dates without a zone are taken as UTC. */
export function parseSubmittedAt(raw: string): { iso: string; ms: number; note?: string } | null {
  const text = raw.trim();
  if (text === "") return null;
  const time = (h?: string, m?: string, s?: string, ap?: string) => {
    let hour = Number(h ?? 0);
    if (ap) {
      const pm = ap.toLowerCase() === "pm";
      if (hour === 12) hour = pm ? 12 : 0;
      else if (pm) hour += 12;
    }
    return { hour, minute: Number(m ?? 0), second: Number(s ?? 0) };
  };
  const build = (y: number, mo: number, d: number, t: { hour: number; minute: number; second: number }, note?: string) => {
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
    if (a > 12) return build(Number(dmy[3]), b, a, t); // day first
    if (b > 12) return build(Number(dmy[3]), a, b, t); // month first
    return build(Number(dmy[3]), a, b, t, "Read as month/day/year (the sheet's default)");
  }
  return null;
}

const looksLikeUrl = (value: string) => WEB_URL.test(value.trim());

// ---------------------------------------------------------------------------------------------------------------------
// Reading rows
// ---------------------------------------------------------------------------------------------------------------------

/** Turns the table below the header row into ImportRows. `firstLine` is the file line number of the first data row. */
export function readRows(dataRows: readonly (readonly string[])[], mapping: HeaderMapping, firstLine = 2): ImportRow[] {
  const cell = (row: readonly string[], field: SourceField): string => {
    for (let index = 0; index < mapping.columns.length; index++) {
      if (mapping.columns[index] === field && (row[index] ?? "").trim() !== "") return row[index] ?? "";
    }
    return "";
  };

  return dataRows.map((row, index): ImportRow => {
    const issues: RowIssue[] = [];
    const warn = (field: string, message: string) => issues.push({ level: "warning", field, message });
    const fail = (field: string, message: string) => issues.push({ level: "error", field, message });

    // Name (issue 2): whitespace only. Never reworded.
    const fullName = cleanText(cell(row, "fullName"));
    if (fullName === "") fail("Full name", "Full name is missing");

    // Email (issue 3)
    const email = checkEmail(cell(row, "email"));
    if (email.error) fail("Email", email.error);

    // Phone and WhatsApp (issue 4). The template's own columns win over the form sheet's combined column.
    let phone = "";
    let whatsapp = "";
    const phoneCol = cell(row, "phone");
    const whatsappCol = cell(row, "whatsapp");
    const combined = cell(row, "phoneCombined");
    const phoneSource = phoneCol !== "" ? phoneCol : combined;
    const phones = normalisePhones(phoneSource, "Phone");
    issues.push(...phones.issues);
    phone = phones.numbers[0] ?? "";
    whatsapp = phones.numbers[1] ?? "";
    if (whatsappCol !== "") {
      const w = normalisePhones(whatsappCol, "WhatsApp");
      issues.push(...w.issues);
      whatsapp = w.numbers[0] ?? whatsapp;
    }

    // Country, region and city (issue 5)
    const country = cleanText(cell(row, "country"));
    if (country === "") warn("Country", "Country is missing");
    const place = classifyCity(cell(row, "city"));
    const regionCol = cleanText(cell(row, "region"));
    const region = regionCol || place.region;
    if (place.city === "") warn("City", "City is missing");
    else if (!place.recognised) warn("City", `City not recognised, kept as typed: "${place.city}"`);

    // Picture (issue 6): a Drive link is the SOURCE, not an image. pictureUrl stays empty until a backend job copies the file.
    let pictureUrl = "";
    let pictureSourceUrl = cleanText(cell(row, "pictureSourceUrl") || cell(row, "picture"));
    const givenUrl = cleanText(cell(row, "pictureUrl"));
    if (givenUrl !== "") {
      if (DRIVE_LINK.test(givenUrl)) {
        pictureSourceUrl = pictureSourceUrl || givenUrl;
        issues.push({ level: "info", field: "Picture", message: "A Google Drive link was in the picture URL column and moved to the source link" });
      } else if (looksLikeUrl(givenUrl)) pictureUrl = givenUrl;
      else warn("Picture", "Picture URL is not a web address and was ignored");
    }
    if (pictureSourceUrl !== "" && !looksLikeUrl(pictureSourceUrl)) {
      warn("Picture", "The picture link is not a web address");
    }
    if (pictureSourceUrl !== "" && !DRIVE_LINK.test(pictureSourceUrl) && looksLikeUrl(pictureSourceUrl)) {
      issues.push({ level: "info", field: "Picture", message: "The picture link is not a Google Drive link; it is kept as the source link" });
    }

    // Bio (issue 7): never edited, line breaks kept.
    const bio = cell(row, "bio");
    const bioLength = bio.length;
    if (bioLength > BIO_MAX_CHARS) fail("Biography", `Biography is ${bioLength} characters; the limit is ${BIO_MAX_CHARS}`);
    else if (bioLength > BIO_WARN_CHARS) warn("Biography", `Biography is ${bioLength} characters; listing cards cut it off after ${BIO_WARN_CHARS}`);

    // Timestamp
    const stamp = parseSubmittedAt(cell(row, "submittedAt"));
    if (cell(row, "submittedAt") !== "" && !stamp) warn("Submitted at", `Could not read the date "${cell(row, "submittedAt")}"; the newest row wins when the same email repeats`);
    if (stamp?.note) issues.push({ level: "info", field: "Submitted at", message: stamp.note });

    // Status: a "status" column in the file is deliberately NOT read. People who are imported are already ambassadors, so the
    // status comes from the choice in the wizard (ImportStatus), and a file can never change the status of someone who exists.

    return {
      rowNumber: firstLine + index,
      record: { fullName, email: email.value, phone, whatsapp, country, region, city: place.city, pictureUrl, pictureSourceUrl, bio, submittedAt: stamp?.iso ?? "" },
      issues,
      emailKey: email.value,
      timestamp: stamp?.ms ?? null,
      exists: false,
    };
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Merging and matching
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Issue 1. The same email (trimmed, lowercase) submitted several times: the LATEST submission by timestamp is kept and the
 * older ones are marked as merged. A row with no readable timestamp counts as the oldest; on a tie the later line wins.
 * Then rows whose email is already in the system (`existing` maps email -> ambassador id) are marked.
 */
export function analyseImport(rows: ImportRow[], existing: ReadonlyMap<string, string>): ImportPreview {
  const groups = new Map<string, ImportRow[]>();
  for (const row of rows) {
    if (row.emailKey === "") continue;
    const list = groups.get(row.emailKey) ?? [];
    list.push(row);
    groups.set(row.emailKey, list);
  }

  const marked = rows.map((row): ImportRow => ({ ...row, mergedInto: undefined, exists: false }));
  const byLine = new Map(marked.map((row) => [row.rowNumber, row]));
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const winner = [...list].sort((a, b) => (b.timestamp ?? -Infinity) - (a.timestamp ?? -Infinity) || b.rowNumber - a.rowNumber)[0];
    for (const row of list) if (row !== winner) byLine.get(row.rowNumber)!.mergedInto = winner.rowNumber;
  }

  let valid = 0;
  let warnings = 0;
  let errors = 0;
  let merged = 0;
  let exists = 0;
  for (const row of marked) {
    if (row.mergedInto !== undefined) {
      merged++;
      continue;
    }
    const outcome = rowOutcome(row);
    if (outcome === "error") errors++;
    else {
      if (outcome === "warning") warnings++;
      else valid++;
      if (row.emailKey !== "" && existing.has(row.emailKey)) {
        row.exists = true;
        exists++;
      }
    }
  }
  return { rows: marked, counts: { total: marked.length, valid, warnings, errors, merged, exists } };
}

// ---------------------------------------------------------------------------------------------------------------------
// Applying
// ---------------------------------------------------------------------------------------------------------------------

export type ExistingChoice = "skip" | "update";

/** The status NEW people get. Active is the default: they are already ambassadors. Pending (stored as "applicant") is the other choice. */
export type ImportStatus = "active" | "pending";
export const DEFAULT_IMPORT_STATUS: ImportStatus = "active";
export const IMPORT_STATUS_LABEL: Record<ImportStatus, string> = { active: "Active", pending: "Pending" };

export interface ImportResult {
  next: Ambassador[];
  /** The status the new people were created with. */
  status: ImportStatus;
  created: number;
  updated: number;
  /** Existing people left alone because Skip was chosen. */
  skipped: number;
  /** Rows with an error (never imported). */
  failed: number;
  merged: number;
}

const toAmbassadorStatus = (status: ImportStatus): AmbassadorStatus => (status === "active" ? "active" : "applicant");

/** The new list of ambassadors after the import. Pure: `makeId` and `makeCode` are passed in. */
export function applyImport(
  preview: ImportPreview,
  current: readonly Ambassador[],
  choice: ExistingChoice,
  newStatus: ImportStatus,
  makeId: (index: number) => string,
  makeCode: (used: ReadonlySet<string>) => string,
  today: string,
): ImportResult {
  const byEmail = new Map(current.map((ambassador) => [ambassador.email.trim().toLowerCase(), ambassador]));
  const used = new Set(current.map((ambassador) => ambassador.referralCode));
  const updates = new Map<string, Ambassador>();
  const created: Ambassador[] = [];
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let counter = 0;

  for (const row of preview.rows) {
    if (row.mergedInto !== undefined) continue;
    if (rowOutcome(row) === "error") {
      failed++;
      continue;
    }
    const r = row.record;
    const found = byEmail.get(row.emailKey);
    if (found) {
      if (choice === "skip") {
        skipped++;
        continue;
      }
      // Update: only what the file actually has. The id, referral code, tier, status, training and joining date are kept.
      updates.set(found.id, {
        ...found,
        name: r.fullName || found.name,
        phone: r.phone || found.phone,
        whatsapp: r.whatsapp || found.whatsapp,
        country: r.country || found.country,
        city: r.city || found.city,
        region: r.region || found.region,
        photoUrl: r.pictureUrl || found.photoUrl,
        pictureSourceUrl: r.pictureSourceUrl || found.pictureSourceUrl,
        description: r.bio || found.description,
        submittedAt: r.submittedAt || found.submittedAt,
        // The status is never touched: a file cannot change the status of someone who already exists.
      });
      updated++;
      continue;
    }
    const code = makeCode(used);
    used.add(code);
    created.push({
      id: makeId(counter++),
      name: r.fullName,
      email: r.email,
      referralCode: code,
      campus: "Not provided",
      country: r.country,
      city: r.city,
      phone: r.phone || undefined,
      whatsapp: r.whatsapp || undefined,
      region: r.region || undefined,
      photoUrl: r.pictureUrl || undefined,
      pictureSourceUrl: r.pictureSourceUrl || undefined,
      submittedAt: r.submittedAt || undefined,
      memberType: "student",
      description: r.bio || undefined,
      trained: false,
      tier: "ambassador",
      status: toAmbassadorStatus(newStatus),
      joinedAt: r.submittedAt ? r.submittedAt.slice(0, 10) : today,
    });
  }

  const next = [...created, ...current.map((ambassador) => updates.get(ambassador.id) ?? ambassador)];
  return { next, status: newStatus, created: created.length, updated, skipped, failed, merged: preview.counts.merged };
}

/** The error report: one line per row that failed (line number, email, reason). */
export function buildErrorReportCsv(preview: ImportPreview): string {
  const lines: string[][] = [["row", "email", "reason"]];
  for (const row of preview.rows) {
    if (row.mergedInto !== undefined) continue;
    const reasons = row.issues.filter((issue) => issue.level === "error").map((issue) => issue.message);
    if (reasons.length > 0) lines.push([String(row.rowNumber), row.record.email, reasons.join("; ")]);
  }
  return csvWithBom(toCsv(lines));
}

// ---------------------------------------------------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------------------------------------------------

/** pending = not yet working as an ambassador (applicant, onboarding); active = working (active, dormant). */
export const statusToCsv = (status: AmbassadorStatus): "pending" | "active" => (status === "applicant" || status === "onboarding" ? "pending" : "active");

/**
 * How leading zeros survive Excel. Excel turns a bare 0257349584 into the number 257349584 when a CSV is opened by a
 * double-click. A value with spaces is not a number, so Excel keeps it as text: "025 734 9584". Groups are 3-3-4 for a
 * 10-digit number and groups of 3 otherwise. The importer removes non-digits, so the file imports back unchanged.
 * Values that are not plain digits, or have fewer than 7, are left as they are.
 */
export function formatPhoneForExcel(value: string | undefined): string {
  const v = (value ?? "").trim();
  if (!/^\d{7,}$/.test(v)) return v;
  if (v.length === 10) return `${v.slice(0, 3)} ${v.slice(3, 6)} ${v.slice(6)}`;
  return v.replace(/(\d{3})(?=\d)/g, "$1 ");
}

const cellFor = (ambassador: Ambassador, key: ImportField): string => {
  switch (key) {
    case "fullName":
      return ambassador.name;
    case "email":
      return ambassador.email;
    case "phone":
      return formatPhoneForExcel(ambassador.phone);
    case "whatsapp":
      return formatPhoneForExcel(ambassador.whatsapp);
    case "country":
      return ambassador.country;
    case "region":
      return ambassador.region ?? "";
    case "city":
      return ambassador.city;
    case "pictureUrl":
      // A picked image in the browser is a temporary blob: or data: address, which means nothing outside this tab.
      return ambassador.photoUrl && !/^(blob|data):/.test(ambassador.photoUrl) ? ambassador.photoUrl : "";
    case "pictureSourceUrl":
      return ambassador.pictureSourceUrl ?? "";
    case "bio":
      return ambassador.description ?? "";
    case "submittedAt":
      return ambassador.submittedAt ?? ambassador.joinedAt;
    case "status":
      return statusToCsv(ambassador.status);
  }
};

/** The CSV file text (with a byte-order mark) for the chosen ambassadors and columns, in template order. */
export function buildExportCsv(ambassadors: readonly Ambassador[], columns: readonly ImportField[]): string {
  const keys = TEMPLATE_HEADERS.filter((key) => columns.includes(key));
  const rows = [[...keys], ...ambassadors.map((ambassador) => keys.map((key) => cellFor(ambassador, key)))];
  return csvWithBom(toCsv(rows));
}

/** ambassadors-YYYY-MM-DD.csv */
export const exportFilename = (isoDate: string): string => `ambassadors-${isoDate}.csv`;

/** The downloadable template: the headers and two examples (fake data). The status column is left empty: imports ignore it. */
export function templateCsv(): string {
  return csvWithBom(
    toCsv([
      [...TEMPLATE_HEADERS],
      ["Ama Example", "ama.example@example.com", "0200000001", "0200000002", "Ghana", "Greater Accra", "Accra", "", "https://drive.google.com/open?id=EXAMPLE1", "A short biography of the ambassador.", "2026-10-01T09:30:00.000Z", ""],
      ["Kofi Sample", "kofi.sample@example.com", "0200000003", "", "Ghana", "", "Kumasi", "", "", "Studies at an example university and loves sharing opportunities.", "2026-10-02T14:05:00.000Z", ""],
    ]),
  );
}
