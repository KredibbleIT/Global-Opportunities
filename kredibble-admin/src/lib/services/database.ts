/**
 * Database service: the beneficiary records kept by the desk (/database). One function per need; pages never touch the
 * store, the seed or the API directly. Two modes (services/mock-mode.ts):
 * - Real mode (the default): the records (every page of /admin/beneficiaries, with the ambassador, opportunity and "added
 *   by" names the server fills in), one record, and the pace gauge (/admin/beneficiaries/pace, the same rules on the server)
 *   come from the API; a failure is an error, never a silent switch to the sample data. saveRecord, verifyRecordSaved and
 *   undoVerifySaved wait for the API; the server refuses a duplicate (409) and the form shows which record it duplicates.
 *   After a change, notifyDatabaseChanged() reloads open pages.
 * - Mock mode: everything lives in the shared in-memory mock store, so the list, the detail page, the form, the pace gauge,
 *   the sidebar pill and the "Beneficiaries verified" KPI (lib/kpi.ts counts verified records by the month of verifiedAt)
 *   always agree. Mock writes never call the API.
 *
 * Rules kept here, not in the pages:
 * - PACE: the value, the target, the pro-rated pace and the status come from kpiValue / kpiTarget / kpiStatus (the same
 *   functions the Overview and the Scorecard use). The gauge's geometry is worked out here too, so a component never does maths.
 * - VERIFY sets verified and verifiedAt = today (the record counts in this month); UNDO puts back exactly what was there.
 * - DEDUPE (a record is a duplicate of another): first by EMAIL (trimmed, case-insensitive), then by PHONE (the digits, without
 *   spaces, dashes, dots or brackets, without a leading + or 00 or the national 0, and without the country's calling code
 *   when it is written in front). Email is checked first: when both match, the email is what is reported.
 * - Who may follow the "Linked" links: only a role that can view that page (see recordLinkAccess).
 */
import { COUNTRY_DIAL_CODES } from "@/config/countries";
import { KPI_STATUS_LABELS } from "@/lib/status-map";
import { currentMonth, kpiStatus, kpiTarget, kpiThresholds, kpiValue, monthProgress, storeData, type KpiStatus } from "@/lib/kpi";
import { getMockCollection, setMockCollection, subscribeMockStore } from "@/lib/mock-store";
import { RECORD_SOURCES, RECORD_SOURCE_LABELS, type DatabaseRecord, type KpiThresholds, type MonthKey, type RecordSource } from "@/lib/mock-entities";
import { currentStaffMember, todayIsoDate } from "@/lib/services/listings";
import type { AccessLevel, Screen } from "@/config/permissions";
import { isMockMode } from "./mock-mode";
import {
  ApiError,
  getAdminUser,
  getAmbassadors,
  getBeneficiaries,
  getBeneficiariesPaceApi,
  getBeneficiaryById,
  getOpportunitiesPage,
  createBeneficiaryApi,
  verifyBeneficiaryApi,
  undoVerifyBeneficiaryApi,
  type BeneficiaryApiRecord,
} from "@/lib/api";
import { fetchAll } from "./api-helpers";

const MOCK_DELAY_MS = 300;
// The first load of a page takes a moment (a skeleton shows). Every later read is instant, so a change is on screen at once.
let loadedOnce = false;
const afterDelay = <T>(value: T) => {
  if (loadedOnce) return Promise.resolve(value);
  return new Promise<T>((resolve) =>
    setTimeout(() => {
      loadedOnce = true;
      resolve(value);
    }, MOCK_DELAY_MS),
  );
};

// Real mode: changes do not go through the store, so they tell the open pages through these listeners instead.
const liveListeners = new Set<() => void>();

/** Tells every open Database page that the data changed (real mode: after an add, a verify or an undo). */
export const notifyDatabaseChanged = (): void => liveListeners.forEach((listener) => listener());

/** Re-run a loader whenever the records change: a store change (mock mode) or a saved change (real mode). */
export function subscribeDatabase(listener: () => void): () => void {
  const unsubscribeStore = subscribeMockStore(listener);
  liveListeners.add(listener);
  return () => {
    unsubscribeStore();
    liveListeners.delete(listener);
  };
}

// ---- pure rules (tested on their own) -------------------------------------------------------------------------------

/** An email as compared for duplicates: trimmed and lower case. */
export const normalizeEmail = (email: string | undefined): string => (email ?? "").trim().toLowerCase();

/**
 * A phone number as compared for duplicates: the international digits (the country's calling code, then the number).
 * Spaces, dashes, dots and brackets are dropped; a leading "+" or "00" is the international prefix and is dropped; a single
 * leading "0" is the national prefix and is replaced by the country's calling code; a number with no prefix at all gets the
 * calling code unless it already starts with it. So "+233 24-555-1007", "00233245551007", "0245551007" and "233 245 551 007"
 * are all "233245551007" for Ghana, while the same local number in Nigeria is a different one. Without a known country a
 * local number is compared as written. Returns "" when there is nothing to compare.
 */
export function normalizePhone(phone: string | undefined, country?: string): string {
  const raw = (phone ?? "").trim();
  if (!raw) return "";
  let digits = raw.replace(/\D+/g, "");
  if (!digits) return "";
  if (raw.startsWith("+")) return digits;
  if (digits.startsWith("00")) return digits.slice(2);
  const dial = country ? COUNTRY_DIAL_CODES[country] : undefined;
  if (digits.startsWith("0")) digits = digits.slice(1);
  else if (dial && digits.startsWith(dial) && digits.length - dial.length >= 6) return digits;
  return dial ? dial + digits : digits;
}

export type DuplicateField = "email" | "phone";
export interface Duplicate {
  field: DuplicateField;
  record: DatabaseRecord;
}

/** The record this one would duplicate: by email first, then by phone. `ignoreId` leaves one record out (itself). */
export function findDuplicate(
  candidate: { email: string; phone?: string; country?: string },
  records: readonly DatabaseRecord[],
  ignoreId?: string,
): Duplicate | null {
  const others = records.filter((record) => record.id !== ignoreId);
  const email = normalizeEmail(candidate.email);
  if (email) {
    const sameEmail = others.find((record) => normalizeEmail(record.email) === email);
    if (sameEmail) return { field: "email", record: sameEmail };
  }
  const phone = normalizePhone(candidate.phone, candidate.country);
  if (phone) {
    const samePhone = others.find((record) => normalizePhone(record.phone, record.country) === phone);
    if (samePhone) return { field: "phone", record: samePhone };
  }
  return null;
}

/** The wording shown under the field of a duplicate. */
export const DUPLICATE_MESSAGES: Record<DuplicateField, string> = {
  email: "A record with this email already exists",
  phone: "A record with this phone number already exists",
};

/** Which of the "Linked" links a viewer may follow: only to pages their role can view. */
export function recordLinkAccess(can: (screen: Screen, level: AccessLevel) => boolean): { ambassador: boolean; opportunity: boolean } {
  return { ambassador: can("network", "view"), opportunity: can("opportunities_queue", "view") };
}

// ---- the pace gauge -----------------------------------------------------------------------------------------------

export type PaceStatus = "on_pace" | "behind" | "far_behind";
const PACE_STATUS: Record<KpiStatus, PaceStatus> = { green: "on_pace", amber: "behind", red: "far_behind" };
/** The status in words, for sentences and the meter's text value. */
export const PACE_WORDS: Record<PaceStatus, string> = {
  on_pace: KPI_STATUS_LABELS.green.toLowerCase(),
  behind: KPI_STATUS_LABELS.amber.toLowerCase(),
  far_behind: KPI_STATUS_LABELS.red.toLowerCase(),
};

export interface RecordsPace {
  month: MonthKey;
  /** Records verified in the month (kpiValue "beneficiaries_verified"). */
  verified: number;
  /** The month's target (kpiTarget). 0 when none is set. */
  target: number;
  /** The target pro-rated to how far into the month it is (exact), and rounded for words. */
  pace: number;
  paceRounded: number;
  /** From kpiStatus: the pro-rated pace judged against the thresholds. */
  status: PaceStatus;
  /** The meter's text value: "9 of 15 verified, pro-rated pace 11, behind". */
  text: string;
  /** What the three zones mean, from the thresholds in the store: the tooltip of the zone words. */
  hint: string;
  /** The bar: the scale's top, the three zones (percent of the bar), and where the marker and the pace tick sit (0 to 100). */
  gauge: {
    /** The meter's top (aria-valuemax): the scale, or the verified count when that is past the end of the scale. */
    max: number;
    zones: { key: PaceStatus; percent: number }[];
    markerAt: number;
    paceAt: number;
    /** When more is verified than the bar can show (twice the pace), the marker is pinned to the right end: "4.4" times the pace. */
    capped: string | null;
  };
}

const percent = (ratio: number) => `${Math.round(ratio * 100)}%`;

/** This month's verification pace. `today` and `data` are for the tests. */
export function recordsPace(today: Date = new Date(), data = storeData(), thresholdsOverride?: KpiThresholds): RecordsPace {
  const month = currentMonth(today);
  // The thresholds that apply in this month (Settings dates them), unless a test gives some.
  const thresholds = thresholdsOverride ?? kpiThresholds(month, data);
  const verified = kpiValue("beneficiaries_verified", month, data);
  const target = kpiTarget("beneficiaries_verified", data);
  const { dayOfMonth, daysInMonth } = monthProgress(month, today);
  const pace = (target * dayOfMonth) / daysInMonth;
  const paceRounded = Math.round(pace);
  const status = PACE_STATUS[kpiStatus(verified, target, dayOfMonth, daysInMonth, thresholds)];
  // The bar runs from 0 to twice the pro-rated pace (or further, when more has been verified), so every zone is wide enough for
  // its word: far behind is below amber x pace, behind is up to green x pace, and on pace is from there.
  const scale = Math.max(Math.ceil(pace * 2), 1);
  const redEnd = Math.min(100, ((thresholds.amber * pace) / scale) * 100);
  const amberEnd = Math.min(100, ((thresholds.green * pace) / scale) * 100);
  return {
    month,
    verified,
    target,
    pace,
    paceRounded,
    status,
    text: `${verified} of ${target} verified, pro-rated pace ${paceRounded}, ${PACE_WORDS[status]}`,
    hint: `Far behind: below ${percent(thresholds.amber)} of the pro-rated pace. Behind: ${percent(thresholds.amber)} to ${percent(thresholds.green)}. On pace: ${percent(thresholds.green)} and above.`,
    gauge: {
      max: Math.max(scale, verified),
      zones: [
        { key: "far_behind", percent: redEnd },
        { key: "behind", percent: Math.max(0, amberEnd - redEnd) },
        { key: "on_pace", percent: Math.max(0, 100 - amberEnd) },
      ],
      markerAt: Math.min(100, (verified / scale) * 100),
      paceAt: Math.min(100, (pace / scale) * 100),
      capped: pace > 0 && verified > scale ? (verified / pace).toFixed(1) : null,
    },
  };
}

// ---- counts ----------------------------------------------------------------------------------------------------------

export interface SourceCount {
  source: RecordSource;
  label: string;
  count: number;
}

/** How many records came from each source (all of them, whatever the filters say), in the order of RECORD_SOURCES. */
export function sourceBreakdown(records: readonly Pick<DatabaseRecord, "source">[]): SourceCount[] {
  return RECORD_SOURCES.map((source) => ({ source, label: RECORD_SOURCE_LABELS[source], count: records.filter((record) => record.source === source).length }));
}

export const pendingRecordCount = (records: readonly Pick<DatabaseRecord, "verified">[]): number => records.filter((record) => !record.verified).length;

// ---- reads ---------------------------------------------------------------------------------------------------------

/** A record with the names the list shows. */
export interface RecordRow extends DatabaseRecord {
  ambassadorName?: string;
  listingTitle?: string;
  addedByName?: string;
}

export const withNames = (record: DatabaseRecord): RecordRow => ({
  ...record,
  ambassadorName: record.ambassadorId ? getMockCollection("ambassadors").find((a) => a.id === record.ambassadorId)?.name : undefined,
  listingTitle: record.listingId ? getMockCollection("listings").find((l) => l.id === record.listingId)?.title : undefined,
  addedByName: record.addedById ? getMockCollection("staff").find((s) => s.id === record.addedById)?.name : undefined,
});

/** The records with their names, newest first (the list works on this so every change shows in the render it happens in). */
export const toRecordRows = (records: readonly DatabaseRecord[]): RecordRow[] =>
  [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).map(withNames);

/** An API record as the pages' RecordRow, with the names the server filled in. */
export const toRecordRow = (b: BeneficiaryApiRecord): RecordRow => ({
  id: b.id,
  name: b.name || b.fullName || "",
  email: b.email,
  phone: b.phone || undefined,
  country: b.country,
  institution: b.institution,
  source: (b.source as RecordSource) || "organic",
  verified: Boolean(b.verified),
  createdAt: b.createdAt,
  addedById: b.addedById || b.addedBy || undefined,
  verifiedAt: b.verifiedAt || undefined,
  ambassadorId: b.ambassadorId || undefined,
  listingId: b.listingId || b.opportunityId || undefined,
  ambassadorName: b.ambassadorName || undefined,
  listingTitle: b.listingTitle || undefined,
  addedByName: b.addedByName || undefined,
});

/** Every record, newest first. Real mode: every page from the API; a failure is an error the page shows. */
export async function loadRecordRows(): Promise<RecordRow[]> {
  if (!isMockMode()) {
    const records = await fetchAll((page, limit) => getBeneficiaries({ page, limit }));
    return records.map(toRecordRow).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  }
  return afterDelay(toRecordRows(getMockCollection("databaseRecords")));
}

/** One record, or undefined. Real mode: a bad id (400) or no such record (404) is undefined; other failures are errors. */
export async function loadRecord(id: string): Promise<RecordRow | undefined> {
  if (!isMockMode()) {
    try {
      return toRecordRow(await getBeneficiaryById(id));
    } catch (error) {
      if (error instanceof ApiError && (error.status === 400 || error.status === 404)) return undefined;
      throw error;
    }
  }
  const record = getMockCollection("databaseRecords").find((entry) => entry.id === id);
  return afterDelay(record ? withNames(record) : undefined);
}

/** Real mode only: this month's verification pace, worked out by the server with the same rules as recordsPace(). */
export async function loadRecordsPace(): Promise<RecordsPace> {
  return getBeneficiariesPaceApi(currentMonth());
}

/** The ambassador choices for the form. Real mode: active, dormant and onboarding ambassadors from the API. */
export async function loadAmbassadorOptions(): Promise<{ id: string; name: string; campus: string }[]> {
  if (isMockMode()) return ambassadorOptions();
  const records = await fetchAll((page, limit) => getAmbassadors({ page, limit }));
  return records
    .filter((a) => a.status === "active" || a.status === "dormant" || a.status === "onboarding")
    .map((a) => ({ id: a.id, name: a.name || a.fullName || "", campus: a.campus ?? "" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The opportunity choices for the form. Real mode: the published opportunities from the API. */
export async function loadRecordOpportunityOptions(): Promise<{ id: string; title: string; organisation: string }[]> {
  if (isMockMode()) return opportunityOptions();
  const records = await fetchAll((page, limit) => getOpportunitiesPage({ status: "published", page, limit }));
  return records
    .map((record) => ({ id: record.id, title: record.title, organisation: record.organisation || record.company || "" }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** Mock store: ambassadors a record can be linked to. */
export const ambassadorOptions = (): { id: string; name: string; campus: string }[] =>
  getMockCollection("ambassadors")
    .filter((a) => a.status === "active" || a.status === "dormant" || a.status === "onboarding")
    .map((a) => ({ id: a.id, name: a.name, campus: a.campus }))
    .sort((a, b) => a.name.localeCompare(b.name));

/** Mock store: opportunities a record can be linked to (published ones). */
export const opportunityOptions = (): { id: string; title: string; organisation: string }[] =>
  getMockCollection("listings")
    .filter((l) => l.status === "published")
    .map((l) => ({ id: l.id, title: l.title, organisation: l.organisation }))
    .sort((a, b) => a.title.localeCompare(b.title));

/**
 * The person adding a record: the signed-in admin (real mode; the server records it from the session), or the mock desk
 * member (mock mode); undefined when none is known.
 */
export const currentRecorder = (): { id: string; name: string } | undefined => {
  if (!isMockMode()) {
    const me = getAdminUser();
    return me ? { id: me.id, name: me.name } : undefined;
  }
  const person = currentStaffMember();
  return person ? { id: person.id, name: person.name } : undefined;
};

// ---- writes ----------------------------------------------------------------------------------------------------------

const write = (records: DatabaseRecord[]) => setMockCollection("databaseRecords", records, { always: true });

/** What the form edits. The id, the dates and who added it are decided here, never by the form. */
export interface RecordFields {
  name: string;
  email: string;
  phone?: string;
  country: string;
  institution: string;
  source: RecordSource;
  verified: boolean;
  ambassadorId?: string;
  listingId?: string;
}

export type CreateResult = { ok: true; record: DatabaseRecord } | { ok: false; duplicate: Duplicate };

/** Mock store: adds a record, unless it duplicates one (email first, then phone): then nothing is written and the duplicate is returned. */
export function createRecord(fields: RecordFields): CreateResult {
  const existing = getMockCollection("databaseRecords");
  const duplicate = findDuplicate(fields, existing);
  if (duplicate) return { ok: false, duplicate };
  const today = todayIsoDate();
  const record: DatabaseRecord = {
    ...fields,
    name: fields.name.trim(),
    email: fields.email.trim(),
    phone: fields.phone?.trim() || undefined,
    institution: fields.institution.trim(),
    // A linked ambassador only makes sense for a referral.
    ambassadorId: fields.source === "ambassador" ? fields.ambassadorId : undefined,
    id: `rec-new-${Date.now()}-${existing.length}`,
    createdAt: today,
    // The mock store's own desk member (in real mode the server records who added it from the session).
    addedById: currentStaffMember()?.id,
    verifiedAt: fields.verified ? today : undefined,
  };
  write([record, ...existing]);
  return { ok: true, record };
}

/** The duplicate the server reported in a 409, or null when the error is something else. */
const duplicateFrom = (error: unknown): Duplicate | null => {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const details = error.details as { field?: string; duplicate?: BeneficiaryApiRecord } | undefined;
  if (!details?.duplicate || (details.field !== "email" && details.field !== "phone")) return null;
  return { field: details.field, record: toRecordRow(details.duplicate) };
};

/**
 * Adds a record. A duplicate (email first, then phone) is not an error: it resolves with the duplicate, and nothing is
 * written. Real mode: the server decides (who added it and when come from the session) and other failures reject with its
 * message.
 */
export async function saveRecord(fields: RecordFields): Promise<CreateResult> {
  if (isMockMode()) return createRecord(fields);
  try {
    const saved = await createBeneficiaryApi({
      name: fields.name.trim(),
      fullName: fields.name.trim(),
      email: fields.email.trim(),
      phone: fields.phone?.trim() || undefined,
      country: fields.country,
      institution: fields.institution.trim(),
      source: fields.source,
      verified: fields.verified,
      // A linked ambassador only makes sense for a referral.
      ambassadorId: fields.source === "ambassador" ? fields.ambassadorId : undefined,
      listingId: fields.listingId,
    });
    notifyDatabaseChanged();
    return { ok: true, record: toRecordRow(saved) };
  } catch (error) {
    const duplicate = duplicateFrom(error);
    if (duplicate) return { ok: false, duplicate };
    throw error;
  }
}

/** What a record looked like before it was verified (kept by the Undo). */
export interface VerifyUndo {
  id: string;
  verified: boolean;
  verifiedAt?: string;
}

/** Mock store: marks a record verified today. It counts in this month at once, everywhere. Returns what to give to undoVerify, or undefined. */
export function verifyRecord(id: string): VerifyUndo | undefined {
  const records = getMockCollection("databaseRecords");
  const current = records.find((record) => record.id === id);
  if (!current || current.verified) return undefined;
  write(records.map((record) => (record.id === id ? { ...record, verified: true, verifiedAt: todayIsoDate() } : record)));
  return { id, verified: current.verified, verifiedAt: current.verifiedAt };
}

/** Mock store: puts a record back exactly as it was before verifyRecord. */
export function undoVerify(undo: VerifyUndo): void {
  write(getMockCollection("databaseRecords").map((record) => (record.id === undo.id ? { ...record, verified: undo.verified, verifiedAt: undo.verifiedAt } : record)));
}

/**
 * Verifies a record that is not verified yet. Resolves with what to give to undoVerifySaved, or undefined when it already
 * is. Real mode: waits for the API (a record can only be verified from unverified, so the undo is "unverified, no date").
 */
export async function verifyRecordSaved(record: Pick<DatabaseRecord, "id" | "verified">): Promise<VerifyUndo | undefined> {
  if (isMockMode()) return verifyRecord(record.id);
  if (record.verified) return undefined;
  await verifyBeneficiaryApi(record.id);
  notifyDatabaseChanged();
  return { id: record.id, verified: false, verifiedAt: undefined };
}

/** Puts a record back as it was before verifyRecordSaved. Real mode: waits for the API. */
export async function undoVerifySaved(undo: VerifyUndo): Promise<void> {
  if (isMockMode()) {
    undoVerify(undo);
    return;
  }
  await undoVerifyBeneficiaryApi(undo.id, { verified: undo.verified, verifiedAt: undo.verifiedAt });
  notifyDatabaseChanged();
}
