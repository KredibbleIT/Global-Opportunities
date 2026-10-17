/**
 * Network service: the ambassadors who amplify listings with their referral code, their amplification logs, and the
 * leaderboard built from them. One function per need; pages never touch the store, the seed or the API directly.
 *
 * Two modes (services/mock-mode.ts):
 * - Real mode (the default): every loader reads the API (/admin/ambassadors, /admin/ambassadors/:id/detail,
 *   /admin/leaderboard, /admin/network/summary) and every save waits for the API (saveAmbassador, recordShare), so an error
 *   reaches the page instead of being lost. After a save, notifyNetworkChanged() makes the open pages load again.
 * - Mock mode: everything lives in the shared in-memory mock store, so the list, the detail page, the form, the
 *   leaderboard, the "Active ambassadors" KPI and the scorecards see the same sample data. Mock writes never call the API.
 *
 * Rules kept here, not in the pages:
 * - The REFERRAL CODE is generated once, when the ambassador is created (GOD- and six letters or digits, unique), and no
 *   function here ever changes it: updateAmbassador takes no code, and keeps the one the ambassador has.
 * - Logging an amplification adds one entry to the log (today, the channel, an optional note) and so adds one share to
 *   this month's count, on the detail page and on the leaderboard.
 * - A share counts in the month of its date; a verified signup counts in the month it was verified. Past months are
 *   therefore snapshots: they are worked out from dated entries and never change.
 * - Leaderboard order: verified signups, then referred clicks, then shares logged (all highest first); a tie on all
 *   three is broken by name, so the order never jumps about.
 */
import { currentMonth } from "@/lib/kpi";
import { getMockCollection, setMockCollection, subscribeMockStore } from "@/lib/mock-store";
import { seekerAccounts } from "@/lib/mock-seekers";
import type { AmplificationLog, Ambassador, DatabaseRecord, MonthKey, SocialPlatform } from "@/lib/mock-entities";
import { todayIsoDate } from "@/lib/services/listings";
import {
  ApiError,
  createAmbassadorApi,
  getAmbassadorDetailApi,
  getAmbassadors,
  getLeaderboardApi,
  getNetworkSummaryApi,
  getSeekers,
  getStaff,
  logAmplificationApi,
  updateAmbassadorApi,
  uploadAmbassadorPhoto,
  type AmbassadorApiRecord,
  type AmbassadorWriteInput,
  type AmplificationLogApiRecord,
} from "@/lib/api";
import { fetchAll } from "@/lib/services/api-helpers";
import { isMockMode } from "@/lib/services/mock-mode";

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

// Real mode: saves do not go through the store, so they tell the open pages through these listeners instead.
const liveListeners = new Set<() => void>();

/** Tells every open Network page that the data changed (real mode: after a save, a share or an import). */
export const notifyNetworkChanged = (): void => liveListeners.forEach((listener) => listener());

/** Re-run a loader whenever the network changes: a store change (mock mode) or a saved change (real mode). */
export function subscribeNetwork(listener: () => void): () => void {
  const unsubscribeStore = subscribeMockStore(listener);
  liveListeners.add(listener);
  return () => {
    unsubscribeStore();
    liveListeners.delete(listener);
  };
}

/** The month ("YYYY-MM") of an ISO date or date-time. */
export const monthOf = (at: string): MonthKey => at.slice(0, 7);

// ---- pure maths (tested on their own) ---------------------------------------------------------------------------

export interface MonthStats {
  shares: number;
  clicks: number;
  signups: number;
}

/** One ambassador's activity in one month: shares logged, referred clicks, and verified signups attributed to them. */
export function ambassadorStats(
  ambassadorId: string,
  logs: readonly Pick<AmplificationLog, "ambassadorId" | "at" | "clicks">[],
  records: readonly Pick<DatabaseRecord, "ambassadorId" | "verified" | "verifiedAt">[],
  month: MonthKey,
): MonthStats {
  const mine = logs.filter((log) => log.ambassadorId === ambassadorId && monthOf(log.at) === month);
  return {
    shares: mine.length,
    clicks: mine.reduce((sum, log) => sum + log.clicks, 0),
    signups: records.filter((record) => record.ambassadorId === ambassadorId && record.verified && record.verifiedAt && monthOf(record.verifiedAt) === month).length,
  };
}

export interface NetworkSummaryData {
  /** Everyone in the network, applicants included. */
  size: number;
  /** Ambassadors whose status is Active. */
  active: number;
  /** Active ambassadors who logged at least one share in the month. */
  sharedActive: number;
  /** sharedActive / active (0 to 1), or null when there is no active ambassador (never a made-up 0). */
  activityRate: number | null;
}

/** The three numbers at the top of the Network page. The activity rate is for `month` (default: this month). */
export function networkSummary(
  ambassadors: readonly Pick<Ambassador, "id" | "status">[],
  logs: readonly Pick<AmplificationLog, "ambassadorId" | "at">[],
  month: MonthKey = currentMonth(),
): NetworkSummaryData {
  const active = ambassadors.filter((ambassador) => ambassador.status === "active");
  const shared = new Set(logs.filter((log) => monthOf(log.at) === month).map((log) => log.ambassadorId));
  const sharedActive = active.filter((ambassador) => shared.has(ambassador.id)).length;
  return { size: ambassadors.length, active: active.length, sharedActive, activityRate: active.length > 0 ? sharedActive / active.length : null };
}

export interface LeaderboardEntry extends MonthStats {
  ambassador: Ambassador;
}
export interface LeaderboardRow extends LeaderboardEntry {
  rank: number;
}

/** Orders entries by verified signups, then referred clicks, then shares logged (highest first), then by name; ranks them 1, 2, 3... */
export function rankAmbassadors(entries: readonly LeaderboardEntry[]): LeaderboardRow[] {
  return [...entries]
    .sort((a, b) => b.signups - a.signups || b.clicks - a.clicks || b.shares - a.shares || a.ambassador.name.localeCompare(b.ambassador.name))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

/** The leaderboard of one month: every ambassador who had joined by the end of it (applicants have not), ranked. */
export function buildLeaderboard(
  ambassadors: readonly Ambassador[],
  logs: readonly AmplificationLog[],
  records: readonly DatabaseRecord[],
  month: MonthKey,
): LeaderboardRow[] {
  const members = ambassadors.filter((ambassador) => ambassador.status !== "applicant" && monthOf(ambassador.joinedAt) <= month);
  return rankAmbassadors(members.map((ambassador) => ({ ambassador, ...ambassadorStats(ambassador.id, logs, records, month) })));
}

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0, O, 1, I
/** A referral code: "GOD-" and six letters or digits, never one already in `used`. `random` is a parameter so it can be tested. */
export function generateReferralCode(used: ReadonlySet<string>, random: () => number = Math.random): string {
  for (;;) {
    let code = "GOD-";
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
    if (!used.has(code)) return code;
  }
}

// ---- loaders ---------------------------------------------------------------------------------------------------------

const staffName = (id: string | undefined) => (id ? getMockCollection("staff").find((person) => person.id === id)?.name : undefined);

/** An API ambassador as the pages' Ambassador (the API already normalises tier and status). */
export function toAmbassador(record: AmbassadorApiRecord): Ambassador {
  return {
    id: record.id,
    name: record.name || record.fullName || "",
    email: record.email,
    referralCode: record.referralCode,
    campus: record.campus ?? "",
    country: record.country ?? "",
    city: record.city ?? "",
    phone: record.phone || undefined,
    whatsapp: record.whatsapp || undefined,
    region: record.region || undefined,
    photoUrl: record.photoUrl || record.profilePhoto || undefined,
    pictureSourceUrl: record.pictureSourceUrl || undefined,
    submittedAt: record.submittedAt || undefined,
    pictureImport: record.pictureImport ? { status: record.pictureImport.status, lastError: record.pictureImport.lastError } : undefined,
    memberType: record.memberType,
    description: record.description || undefined,
    roleTitle: record.roleTitle || undefined,
    assignedLeadId: record.assignedLeadId || undefined,
    trained: Boolean(record.trained),
    linkedSeekerId: record.linkedSeekerId || record.linkedUserId || undefined,
    tier: record.tier,
    status: record.status,
    joinedAt: record.joinedAt,
    dormantSince: record.dormantSince || undefined,
  };
}

/**
 * An API amplification as the pages' log entry. The channel is free text on the server; entries logged here are always
 * one of SOCIAL_PLATFORMS, and the detail page shows any other value as written.
 */
const toAmplificationLog = (record: AmplificationLogApiRecord): AmplificationLog => ({
  id: record.id,
  ambassadorId: record.ambassadorId,
  listingId: record.listingId || undefined,
  note: record.note || undefined,
  channel: record.channel as SocialPlatform,
  at: record.at,
  clicks: record.clicks ?? 0,
  applications: record.applications ?? 0,
});

/** An ambassador with the names the list shows. */
export interface AmbassadorRow extends Ambassador {
  leadName?: string;
}

/** Everyone in the network (real mode: every page of /admin/ambassadors). */
export async function loadAmbassadorRows(): Promise<AmbassadorRow[]> {
  if (!isMockMode()) {
    const records = await fetchAll((page, limit) => getAmbassadors({ page, limit }));
    return records.map((record) => ({ ...toAmbassador(record), leadName: record.leadName || undefined }));
  }
  const rows = getMockCollection("ambassadors").map((ambassador): AmbassadorRow => ({
    ...ambassador,
    leadName: staffName(ambassador.assignedLeadId),
  }));
  return afterDelay(rows);
}

export interface AmbassadorDetailData {
  ambassador: Ambassador;
  leadName?: string;
  linkedSeekerName?: string;
  /** Newest first. */
  logs: AmplificationLog[];
  /** This month's numbers. */
  stats: MonthStats;
}

/** One ambassador with this month's numbers and every logged share; undefined when there is no such ambassador. */
export async function loadAmbassador(id: string): Promise<AmbassadorDetailData | undefined> {
  if (!isMockMode()) {
    try {
      const detail = await getAmbassadorDetailApi(id, currentMonth());
      return {
        ambassador: toAmbassador(detail.ambassador),
        leadName: detail.leadName || undefined,
        linkedSeekerName: detail.linkedAccount?.name || undefined,
        logs: detail.logs.map(toAmplificationLog),
        stats: detail.stats,
      };
    } catch (error) {
      // Not a database id (400) or no such ambassador (404): the page shows "not found".
      if (error instanceof ApiError && (error.status === 400 || error.status === 404)) return undefined;
      throw error;
    }
  }
  const ambassador = getMockCollection("ambassadors").find((entry) => entry.id === id);
  if (!ambassador) return afterDelay(undefined);
  const logs = getMockCollection("amplificationLogs").filter((log) => log.ambassadorId === id).sort((a, b) => b.at.localeCompare(a.at));
  return afterDelay({
    ambassador,
    leadName: staffName(ambassador.assignedLeadId),
    linkedSeekerName: seekerAccounts.find((seeker) => seeker.id === ambassador.linkedSeekerId)?.name,
    logs,
    stats: ambassadorStats(id, getMockCollection("amplificationLogs"), getMockCollection("databaseRecords"), currentMonth()),
  });
}

/** The ranked leaderboard of one month (real mode: the server ranks it with the same rules). */
export async function loadLeaderboard(month: MonthKey): Promise<LeaderboardRow[]> {
  if (!isMockMode()) {
    const rows = await getLeaderboardApi(month);
    return rows.map((row) => ({ ambassador: toAmbassador(row.ambassador), shares: row.shares, clicks: row.clicks, signups: row.signups, rank: row.rank }));
  }
  return afterDelay(buildLeaderboard(getMockCollection("ambassadors"), getMockCollection("amplificationLogs"), getMockCollection("databaseRecords"), month));
}

/** Real mode only: this month's Network size, Active and Activity rate, counted by the server over everyone. */
export async function loadNetworkSummary(month: MonthKey = currentMonth()): Promise<NetworkSummaryData> {
  const { size, active, sharedActive, activityRate } = await getNetworkSummaryApi(month);
  return { size, active, sharedActive, activityRate };
}

export interface LeadOption {
  id: string;
  name: string;
  title?: string;
}
export interface SeekerOption {
  id: string;
  name: string;
  email: string;
}

/** People who can lead an ambassador: active team members (mock store). */
export function leadOptions(): LeadOption[] {
  return getMockCollection("staff")
    .filter((person) => person.status === "active")
    .map((person) => ({ id: person.id, name: person.name, title: person.title }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Seeker accounts an ambassador can be linked to (mock data). */
export const seekerOptions = (): SeekerOption[] => seekerAccounts.map(({ id, name, email }) => ({ id, name, email }));

/** The lead choices for the form. Real mode: active staff, by their user id (what the API stores as the lead). */
export async function loadLeadOptions(): Promise<LeadOption[]> {
  if (isMockMode()) return leadOptions();
  const staff = await fetchAll((page, limit) => getStaff({ page, limit }));
  return staff
    .filter((person) => person.status === "active" && person.userId)
    .map((person) => ({ id: person.userId, name: person.name, title: person.role }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The linked-account choices for the form. Real mode: seeker accounts, by their user id. */
export async function loadSeekerOptions(): Promise<SeekerOption[]> {
  if (isMockMode()) return seekerOptions();
  const seekers = await fetchAll((page, limit) => getSeekers({ page, limit }));
  return seekers
    .filter((seeker) => seeker.userId)
    .map((seeker) => ({ id: seeker.userId, name: seeker.fullName || seeker.name || seeker.email, email: seeker.email }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---- writes ----------------------------------------------------------------------------------------------------------

/** What the form edits. The id, the referral code and the dates are decided by the service, never by the form. */
export type AmbassadorFields = Omit<Ambassador, "id" | "referralCode" | "joinedAt" | "dormantSince" | "pictureImport">;

// The four functions below write the MOCK STORE only (mock mode and the rule tests). The pages call saveAmbassador and
// recordShare, which pick the store or the API.
const write = (ambassadors: Ambassador[]) => setMockCollection("ambassadors", ambassadors, { always: true });

/** Mock store: adds an ambassador with a new unique referral code and today as the joining date. */
export function createAmbassador(fields: AmbassadorFields): Ambassador {
  const existing = getMockCollection("ambassadors");
  const used = new Set(existing.map((ambassador) => ambassador.referralCode));
  const ambassador: Ambassador = {
    ...fields,
    id: `amb-new-${Date.now()}`,
    referralCode: generateReferralCode(used),
    joinedAt: todayIsoDate(),
    dormantSince: fields.status === "dormant" ? todayIsoDate() : undefined,
  };
  write([ambassador, ...existing]);
  return ambassador;
}

/** Mock store: saves the form. The referral code and the joining date are kept exactly as they were. */
export function updateAmbassador(id: string, fields: AmbassadorFields): Ambassador | undefined {
  const current = getMockCollection("ambassadors").find((ambassador) => ambassador.id === id);
  if (!current) return undefined;
  const next: Ambassador = {
    ...current,
    ...fields,
    referralCode: current.referralCode,
    joinedAt: current.joinedAt,
    // Going quiet is dated; coming back clears it.
    dormantSince: fields.status === "dormant" ? current.dormantSince ?? todayIsoDate() : undefined,
  };
  write(getMockCollection("ambassadors").map((ambassador) => (ambassador.id === id ? next : ambassador)));
  return next;
}

/** Mock store: removes an ambassador from the network. */
export function removeAmbassador(id: string) {
  write(getMockCollection("ambassadors").filter((ambassador) => ambassador.id !== id));
}

/** Mock store: logs one share by hand (today, the channel, an optional note). It counts toward this month's shares at once. */
export function logAmplification(ambassadorId: string, channel: SocialPlatform, note?: string): AmplificationLog {
  const log: AmplificationLog = {
    id: `amp-new-${Date.now()}`,
    ambassadorId,
    channel,
    at: todayIsoDate(),
    clicks: 0,
    applications: 0,
    note: note?.trim() || undefined,
  };
  setMockCollection("amplificationLogs", [log, ...getMockCollection("amplificationLogs")], { always: true });
  return log;
}

/** A picked photo arrives from FileDrop as a base64 data: URL; the upload route takes a file. */
function dataUrlToFile(dataUrl: string, baseName: string): File {
  const [header, base64 = ""] = dataUrl.split(",", 2);
  const type = /^data:([^;,]+)/.exec(header)?.[1] ?? "image/png";
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return new File([bytes], `${baseName}.${type.split("/")[1] ?? "png"}`, { type });
}

/**
 * Saves the form: creates an ambassador (no id) or updates one. Resolves with the saved ambassador, or rejects with the
 * API's message so the form can show it and stay open.
 *
 * Real mode: a newly picked photo is uploaded first and the stored https address is saved; the server generates the
 * referral code and the joining date and keeps both on every update; clearing a lead or a linked account sends null.
 */
export async function saveAmbassador(fields: AmbassadorFields, id?: string): Promise<Ambassador> {
  if (isMockMode()) {
    const saved = id ? updateAmbassador(id, fields) : createAmbassador(fields);
    if (!saved) throw new Error("This ambassador no longer exists.");
    return saved;
  }
  const photo = fields.photoUrl?.startsWith("data:")
    ? (await uploadAmbassadorPhoto(dataUrlToFile(fields.photoUrl, "ambassador-photo"))).url
    : fields.photoUrl;
  const body: AmbassadorWriteInput = {
    fullName: fields.name,
    email: fields.email,
    phone: fields.phone ?? "",
    whatsapp: fields.whatsapp ?? "",
    region: fields.region ?? "",
    // A changed Drive link makes the server copy that picture into our storage.
    pictureSourceUrl: fields.pictureSourceUrl ?? "",
    country: fields.country,
    city: fields.city,
    campus: fields.campus,
    memberType: fields.memberType,
    description: fields.description ?? "",
    roleTitle: fields.roleTitle ?? "",
    // "" on an update removes the photo; a new ambassador without one sends nothing.
    profilePhoto: photo ?? (id ? "" : undefined),
    tier: fields.tier,
    status: fields.status,
    trained: fields.trained,
    assignedLeadId: fields.assignedLeadId ?? null,
    linkedUserId: fields.linkedSeekerId ?? null,
  };
  const saved = id ? await updateAmbassadorApi(id, body) : await createAmbassadorApi(body);
  notifyNetworkChanged();
  return toAmbassador(saved);
}

/** Logs one share by hand. Real mode: waits for the API, so a failure reaches the caller. */
export async function recordShare(ambassadorId: string, channel: SocialPlatform, note?: string): Promise<void> {
  if (isMockMode()) {
    logAmplification(ambassadorId, channel, note);
    return;
  }
  await logAmplificationApi(ambassadorId, { channel, note: note?.trim() || undefined });
  notifyNetworkChanged();
}
