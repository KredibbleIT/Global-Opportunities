/**
 * Partners service: the six-stage partner pipeline. One function per need; pages never touch the store, the seed or the
 * API directly. Two modes (services/mock-mode.ts):
 * - Real mode (the default): the loaders read /admin/partners (and the partner's programs, the owners, this month's
 *   "Partners onboarded" target), and every change (savePartner, movePartnerTo, deletePartner) waits for the API, so an
 *   error reaches the page instead of being lost. The server records each move in the stage history (who and when).
 *   After a change, notifyPartnersChanged() makes open pages load again.
 * - Mock mode: everything lives in the shared in-memory mock store, so the board, the detail page, the form, the
 *   "Partners onboarded" KPI and the scorecards see the same sample partners. Mock writes never call the API.
 *
 * Rules kept here, not in the pages:
 * - "Closed" is NEVER stored by the pages: a partner is closed exactly when its stage is Onboard or Renew
 *   (isPartnerClosed). Moving a card into one of those stages closes it, moving it out re-opens it, and a move says which
 *   happened.
 * - Every move appends a history entry { stage, at, from }, so the date and the from-to of each step are kept, and the
 *   current stage is always the last entry.
 * - Removing a partner clears it from the programs that were linked to it (no program points at a missing partner; the
 *   server does the same).
 */
import { getMockCollection, setMockCollection, subscribeMockStore } from "@/lib/mock-store";
import {
  isPartnerClosed,
  partnerClosedAt,
  PARTNER_STAGES,
  type Partner,
  type PartnerStage,
  type PartnerStageEntry,
  type PartnerType,
  type Program,
} from "@/lib/mock-entities";
import { OPEN_STAGES, type StageMove } from "@/lib/pipeline-health";
import { currentMonth, kpiTarget } from "@/lib/kpi";
import { todayIsoDate } from "@/lib/services/listings";
import {
  ApiError,
  createPartnerApi,
  deletePartnerApi,
  getAdminUser,
  getPartnerById,
  getPartners,
  getPrograms,
  getStaff,
  getTargets,
  movePartnerApi,
  updatePartnerApi,
  type PartnerApiRecord,
  type PartnerWriteInput,
} from "@/lib/api";
import { fetchAll } from "@/lib/services/api-helpers";
import { isMockMode } from "@/lib/services/mock-mode";
import { toProgramRow } from "@/lib/services/programs";

const MOCK_DELAY_MS = 300;
// The first load of a page takes a moment (a skeleton shows). Every later read is instant: a card that was just moved
// must be in its new column at once, not 300ms later.
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

/** Tells every open Partners page that the data changed (real mode: after a save, a move or a removal). */
export const notifyPartnersChanged = (): void => liveListeners.forEach((listener) => listener());

/** Re-run a loader whenever partners change: a store change (mock mode) or a saved change (real mode). */
export function subscribePartners(listener: () => void): () => void {
  const unsubscribeStore = subscribeMockStore(listener);
  liveListeners.add(listener);
  return () => {
    unsubscribeStore();
    liveListeners.delete(listener);
  };
}

/** A partner with the names the board and the detail page show. */
export interface PartnerRow extends Partner {
  ownerName?: string;
  closed: boolean;
}

/** The detail page's partner: the row plus the programs linked to it. */
export interface PartnerDetailRow extends PartnerRow {
  programs: Program[];
}

const withNames = (partner: Partner): PartnerRow => ({
  ...partner,
  ownerName: getMockCollection("staff").find((person) => person.id === partner.ownerId)?.name,
  closed: isPartnerClosed(partner),
});

/** Older records spell some stages and types differently ("MOU", "NGO", "media"). */
const toStage = (value: string | undefined): PartnerStage => {
  const stage = String(value ?? "prospect").toLowerCase();
  return (PARTNER_STAGES as readonly string[]).includes(stage) ? (stage as PartnerStage) : "prospect";
};
const toPartnerType = (value: string): PartnerType => {
  const type = value.toLowerCase();
  if (type === "media" || type === "tech") return "media_tech";
  return type as PartnerType;
};

/** An API partner as the pages' PartnerRow. */
export function toPartnerRow(record: PartnerApiRecord): PartnerRow {
  const partner: Partner = {
    id: record.id,
    name: record.name || record.organizationName,
    country: record.country ?? "",
    sector: record.sector ?? "",
    type: toPartnerType(record.type || record.partnerType || "corporate"),
    ownerId: record.ownerId || record.assignedOwnerId || "",
    contactName: record.contactName ?? "",
    contactEmail: record.contactEmail || undefined,
    contactPhone: record.contactPhone || undefined,
    provides: record.provides ?? "",
    sourcedVia: record.sourcedVia || record.sourcedBy || undefined,
    notes: record.notes || undefined,
    stage: toStage(record.stage),
    stageHistory: (record.stageHistory ?? []).map(
      (entry): PartnerStageEntry => ({ stage: toStage(entry.stage), at: entry.at, from: entry.from ? toStage(entry.from) : undefined }),
    ),
  };
  return { ...partner, ownerName: record.ownerName || undefined, closed: isPartnerClosed(partner) };
}

/** Every partner, for the board. */
export async function loadPartnerRows(): Promise<PartnerRow[]> {
  if (!isMockMode()) {
    const records = await fetchAll((page, limit) => getPartners({ page, limit }));
    return records.map(toPartnerRow);
  }
  return afterDelay(getMockCollection("partners").map(withNames));
}

/** One partner with its linked programs, or undefined. Real mode: a bad id (400) or no such partner (404) is undefined. */
export async function loadPartner(id: string): Promise<PartnerDetailRow | undefined> {
  if (!isMockMode()) {
    let record: PartnerApiRecord;
    try {
      record = await getPartnerById(id);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 400 || error.status === 404)) return undefined;
      throw error;
    }
    // The programs list has no partner filter; there are few programs, so they are matched here.
    const programs = await fetchAll((page, limit) => getPrograms({ page, limit }));
    return { ...toPartnerRow(record), programs: programs.map(toProgramRow).filter((program) => program.partnerId === id) };
  }
  const partner = getMockCollection("partners").find((entry) => entry.id === id);
  return afterDelay(partner ? { ...withNames(partner), programs: programsOfPartner(partner.id) } : undefined);
}

/** Mock store: the programs linked to a partner. */
export const programsOfPartner = (partnerId: string): Program[] => getMockCollection("programs").filter((program) => program.partnerId === partnerId);

export interface OwnerOption {
  id: string;
  name: string;
  title?: string;
}

/** People who can own a partner: active team members (mock store). */
export function partnerOwnerOptions(): OwnerOption[] {
  return getMockCollection("staff")
    .filter((person) => person.status === "active")
    .map((person) => ({ id: person.id, name: person.name, title: person.title }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The owner choices for the form. Real mode: active staff, by their user id (what the API stores as the owner), plus the
 * signed-in admin when they have no staff record (the CLI-made root admin), so they can own what they add.
 */
export async function loadPartnerOwnerOptions(): Promise<OwnerOption[]> {
  if (isMockMode()) return partnerOwnerOptions();
  const staff = await fetchAll((page, limit) => getStaff({ page, limit }));
  const options: OwnerOption[] = staff
    .filter((person) => person.status === "active" && person.userId)
    .map((person) => ({ id: person.userId, name: person.name, title: person.role }));
  const me = getAdminUser();
  if (me?.id && !options.some((option) => option.id === me.id)) options.push({ id: me.id, name: me.name });
  return options.sort((a, b) => a.name.localeCompare(b.name));
}

/** Who a new partner belongs to unless the form says otherwise: the signed-in person (real mode) or the mock desk member. */
export const defaultOwnerId = (owners: readonly OwnerOption[], mockDefault: string | undefined): string =>
  (isMockMode() ? mockDefault : getAdminUser()?.id) ?? owners[0]?.id ?? "";

/** Every stage move of every partner, oldest first: what pipelineHealth learns the close rate from. */
export function flattenMoves(partners: readonly Pick<Partner, "id" | "stageHistory">[]): StageMove[] {
  return partners
    .flatMap((partner) => partner.stageHistory.map((entry): StageMove => ({ partnerId: partner.id, from: entry.from, to: entry.stage, at: entry.at })))
    .sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * The numbers every partner summary shows: deals still open (Prospect to Proposal, plus MOU), partners that moved into
 * Onboard or Renew this calendar month and are still closed, and how many partners are closed in total (in Onboard or Renew now).
 */
export function partnerSummary(
  partners: readonly Pick<Partner, "stage" | "stageHistory">[],
  today: Date = new Date(),
): { open: number; closedThisMonth: number; closedTotal: number } {
  const month = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`; // the UTC month, like the seed
  return {
    open: partners.filter((partner) => OPEN_STAGES.includes(partner.stage)).length,
    closedThisMonth: partners.filter((partner) => partnerClosedAt(partner)?.startsWith(month)).length,
    closedTotal: partners.filter(isPartnerClosed).length,
  };
}

/** Mock store: this month's "Partners onboarded" target (the monthly target stored for that KPI; Settings edits it). */
export const nextMonthPartnersTarget = (): number => kpiTarget("partners_onboarded");

/** This month's "Partners onboarded" target. Real mode: the target in force from /admin/targets (0 when none is set). */
export async function loadPartnersTarget(): Promise<number> {
  if (isMockMode()) return nextMonthPartnersTarget();
  const targets = await getTargets(currentMonth());
  return targets.find((target) => target.kpi === "partners_onboarded")?.value ?? 0;
}

/** The fields a person fills in on the form. The id, the stage and the history are decided by the service. */
export type PartnerFields = Omit<Partner, "id" | "stage" | "stageHistory">;

// The four functions below write the MOCK STORE only (mock mode and the rule tests). The pages call savePartner,
// movePartnerTo and deletePartner, which pick the store or the API.
const write = (partners: Partner[]) => setMockCollection("partners", partners, { always: true });

/** Mock store: adds a partner at Prospect, with the first history entry. */
export function createPartner(fields: PartnerFields): Partner {
  const entry: PartnerStageEntry = { stage: "prospect", at: todayIsoDate() };
  const partner: Partner = { ...fields, id: `ptn-new-${Date.now()}`, stage: "prospect", stageHistory: [entry] };
  write([partner, ...getMockCollection("partners")]);
  return partner;
}

/** Mock store: saves the form over a partner (the stage and the history are not touched). */
export function updatePartner(id: string, fields: PartnerFields): Partner | undefined {
  const current = getMockCollection("partners").find((partner) => partner.id === id);
  if (!current) return undefined;
  const next: Partner = { ...current, ...fields };
  write(getMockCollection("partners").map((partner) => (partner.id === id ? next : partner)));
  return next;
}

/** What a move did to the "closed" state of the deal. */
export type ClosedChange = "closed" | "reopened" | null;

export interface MoveResult {
  partner: Partner;
  from: PartnerStage;
  to: PartnerStage;
  closedChange: ClosedChange;
}

/** Mock store: moves a partner to another stage. Closed follows the stage by itself (see the file header). Undefined when nothing moved. */
export function movePartner(id: string, to: PartnerStage): MoveResult | undefined {
  const current = getMockCollection("partners").find((partner) => partner.id === id);
  if (!current || current.stage === to) return undefined;
  const wasClosed = isPartnerClosed(current);
  const next: Partner = { ...current, stage: to, stageHistory: [...current.stageHistory, { stage: to, at: todayIsoDate(), from: current.stage }] };
  write(getMockCollection("partners").map((partner) => (partner.id === id ? next : partner)));
  const nowClosed = isPartnerClosed(next);
  return { partner: next, from: current.stage, to, closedChange: wasClosed === nowClosed ? null : nowClosed ? "closed" : "reopened" };
}

/** Mock store: removes a partner and clears it from the programs linked to it. */
export function removePartner(id: string) {
  write(getMockCollection("partners").filter((partner) => partner.id !== id));
  const programs = getMockCollection("programs");
  if (programs.some((program) => program.partnerId === id)) {
    setMockCollection("programs", programs.map((program) => (program.partnerId === id ? { ...program, partnerId: undefined } : program)), { always: true });
  }
}

/**
 * Saves the form: creates a partner at Prospect (no id) or updates one (its stage and history stay). Resolves with the
 * saved partner, or rejects with the API's message so the form can show it and stay open.
 */
export async function savePartner(fields: PartnerFields, id?: string): Promise<Partner> {
  if (isMockMode()) {
    const saved = id ? updatePartner(id, fields) : createPartner(fields);
    if (!saved) throw new Error("This partner no longer exists.");
    return saved;
  }
  const body: PartnerWriteInput = {
    organizationName: fields.name,
    partnerType: fields.type,
    country: fields.country,
    sector: fields.sector,
    assignedOwnerId: fields.ownerId || null,
    contactName: fields.contactName,
    contactEmail: fields.contactEmail ?? "",
    contactPhone: fields.contactPhone ?? "",
    provides: fields.provides,
    sourcedBy: fields.sourcedVia ?? "",
    notes: fields.notes ?? "",
  };
  const saved = id ? await updatePartnerApi(id, body) : await createPartnerApi(body);
  notifyPartnersChanged();
  return toPartnerRow(saved);
}

/** Moves a partner to another stage. Undefined when nothing moved. Real mode: waits for the API. */
export async function movePartnerTo(id: string, to: PartnerStage): Promise<MoveResult | undefined> {
  if (isMockMode()) return movePartner(id, to);
  const result = await movePartnerApi(id, to);
  const from = toStage(result.from);
  if (from === toStage(result.to)) return undefined;
  notifyPartnersChanged();
  return { partner: toPartnerRow(result.partner), from, to: toStage(result.to), closedChange: result.closedChange };
}

/** Removes a partner (its programs stay, without it). Real mode: waits for the API. */
export async function deletePartner(id: string): Promise<void> {
  if (isMockMode()) {
    removePartner(id);
    return;
  }
  await deletePartnerApi(id);
  notifyPartnersChanged();
}
