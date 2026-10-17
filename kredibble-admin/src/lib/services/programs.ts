/**
 * Programs service: GOD's own activities (trainings, bootcamps, webinars...). A Program is NOT an Opportunity: it is
 * something the desk runs, with its own people, partner and target.
 *
 * One function per need; pages never touch the store, the seed or the API directly. Two modes (services/mock-mode.ts):
 * - Real mode (the default): the loaders read /admin/programs and the saves (saveProgram, saveCancellation) wait for the
 *   API, so an error reaches the page instead of being lost. After a save, notifyProgramsChanged() makes open pages load
 *   again.
 * - Mock mode: everything lives in the shared in-memory mock store, so the list, the detail page, the form, the KPI
 *   "Programs organised" and the Overview see the same sample programs. Mock writes never call the API.
 *
 * Rules kept here, not in the pages:
 * - "Active" = planned + running. "Delivered" = delivered. Cancelled programs are neither. programSummary() is the ONE
 *   place that counts them, so every summary shows the same two numbers.
 * - A delivered program has deliveredAt = the day it ended (that decides which month it counts toward).
 * - Times are wall-clock values ("2026-10-03T09:00"). They travel to the API as that time in UTC and come back the same,
 *   whatever the server's time zone.
 */
import { getMockCollection, setMockCollection, subscribeMockStore } from "@/lib/mock-store";
import type { Program, ProgramFormat, ProgramStatus, ProgramType } from "@/lib/mock-entities";
import {
  ApiError,
  createProgramApi,
  getPartners,
  getProgramById,
  getPrograms,
  updateProgramApi,
  type ProgramApiRecord,
  type ProgramWriteInput,
} from "@/lib/api";
import { fetchAll } from "@/lib/services/api-helpers";
import { isMockMode } from "@/lib/services/mock-mode";

const MOCK_DELAY_MS = 300;
const afterDelay = <T>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), MOCK_DELAY_MS));

// Real mode: saves do not go through the store, so they tell the open pages through these listeners instead.
const liveListeners = new Set<() => void>();

/** Tells every open Programs page that the data changed (real mode: after a save or a cancellation). */
export const notifyProgramsChanged = (): void => liveListeners.forEach((listener) => listener());

/** Re-run a loader whenever programs change: a store change (mock mode) or a saved change (real mode). */
export function subscribeProgramStore(listener: () => void): () => void {
  const unsubscribeStore = subscribeMockStore(listener);
  liveListeners.add(listener);
  return () => {
    unsubscribeStore();
    liveListeners.delete(listener);
  };
}

/** A program with the name of its partner, for the list. */
export interface ProgramRow extends Program {
  partnerName?: string;
}

/** An API date-time as the wall-clock value the pages use ("2026-10-03T09:00"), or "" when there is none. */
const wallTime = (value: string | undefined): string => (value ? value.slice(0, 16) : "");

/** A wall-clock value ("2026-10-03" or "2026-10-03T09:00") as the ISO date-time the API stores. */
const toApiTime = (value: string): string => (value.length === 10 ? `${value}T00:00:00.000Z` : `${value.slice(0, 16)}:00.000Z`);

/** An API program as the pages' ProgramRow. */
export function toProgramRow(record: ProgramApiRecord): ProgramRow {
  return {
    id: record.id,
    name: record.name || record.title,
    type: (record.programType || record.type) as ProgramType,
    status: record.status,
    country: record.country ?? "",
    startAt: wallTime(record.startAt),
    endAt: wallTime(record.endAt),
    deliveredAt: record.deliveredAt ? record.deliveredAt.slice(0, 10) : undefined,
    partnerId: record.partnerId || undefined,
    partnerName: record.partnerName || undefined,
    participants: record.participantCount ?? record.participants ?? 0,
    target: record.participantTarget ?? record.target ?? 0,
    format: (record.format || "in-person") as ProgramFormat,
    location: record.location || undefined,
    facilitators: record.facilitators ?? [],
    notes: record.notes || undefined,
  };
}

const newestStartFirst = (a: ProgramRow, b: ProgramRow) => b.startAt.localeCompare(a.startAt);

/** Every program, newest start first, with the partner's name. */
export async function loadProgramRows(): Promise<ProgramRow[]> {
  if (!isMockMode()) {
    const records = await fetchAll((page, limit) => getPrograms({ page, limit }));
    return records.map(toProgramRow).sort(newestStartFirst);
  }
  const partners = getMockCollection("partners");
  const rows = getMockCollection("programs")
    .map((program): ProgramRow => ({ ...program, partnerName: partners.find((partner) => partner.id === program.partnerId)?.name }))
    .sort(newestStartFirst);
  return afterDelay(rows);
}

/** One program, or undefined. Real mode: an id that is not a database id (400) or no such program (404) is undefined. */
export async function loadProgram(id: string): Promise<ProgramRow | undefined> {
  if (!isMockMode()) {
    try {
      return toProgramRow(await getProgramById(id));
    } catch (error) {
      if (error instanceof ApiError && (error.status === 400 || error.status === 404)) return undefined;
      throw error;
    }
  }
  const partners = getMockCollection("partners");
  const program = getMockCollection("programs").find((entry) => entry.id === id);
  return afterDelay(program ? { ...program, partnerName: partners.find((partner) => partner.id === program.partnerId)?.name } : undefined);
}

/** The two numbers every program summary shows. */
export function programSummary(programs: readonly Pick<Program, "status">[]): { active: number; delivered: number } {
  return {
    active: programs.filter((program) => program.status === "planned" || program.status === "running").length,
    delivered: programs.filter((program) => program.status === "delivered").length,
  };
}

/** Partners that can be linked to a program (mock store, name order). */
export function programPartnerOptions(): { id: string; name: string }[] {
  return getMockCollection("partners")
    .map((partner) => ({ id: partner.id, name: partner.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The partner choices for the form. Real mode: every partner from /admin/partners. */
export async function loadProgramPartnerOptions(): Promise<{ id: string; name: string }[]> {
  if (isMockMode()) return programPartnerOptions();
  const partners = await fetchAll((page, limit) => getPartners({ page, limit }));
  return partners.map((partner) => ({ id: partner.id, name: partner.name || partner.organizationName })).sort((a, b) => a.name.localeCompare(b.name));
}

/** The fields a person fills in on the form. The id is decided by the service. */
export type ProgramFields = Omit<Program, "id" | "deliveredAt">;

/** The calendar day of a "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" value. */
export const dayOf = (value: string): string => value.slice(0, 10);

// The three functions below write the MOCK STORE only (mock mode and the rule tests). The pages call saveProgram and
// saveCancellation, which pick the store or the API.
const write = (programs: Program[]) => setMockCollection("programs", programs, { always: true });

/** A delivered program counts in the month it ended; any other status has no delivered day. */
const withDeliveredDay = (fields: ProgramFields): Program["deliveredAt"] => (fields.status === "delivered" ? dayOf(fields.endAt) : undefined);

/** Mock store: adds a program. */
export function createProgram(fields: ProgramFields): Program {
  const program: Program = { ...fields, id: `prg-new-${Date.now()}`, deliveredAt: withDeliveredDay(fields) };
  write([program, ...getMockCollection("programs")]);
  return program;
}

/** Mock store: saves the form over a program. */
export function updateProgram(id: string, fields: ProgramFields): Program | undefined {
  const current = getMockCollection("programs").find((program) => program.id === id);
  if (!current) return undefined;
  const next: Program = { ...fields, id, deliveredAt: withDeliveredDay(fields) };
  write(getMockCollection("programs").map((program) => (program.id === id ? next : program)));
  return next;
}

/** Mock store: cancels a program that has not been delivered. Active drops by one; Delivered does not change. */
export function cancelProgram(id: string) {
  write(
    getMockCollection("programs").map((program) =>
      program.id === id ? { ...program, status: "cancelled" as ProgramStatus, deliveredAt: undefined } : program,
    ),
  );
}

/**
 * Saves the form: creates a program (no id) or updates one. Resolves with the saved program, or rejects with the API's
 * message so the form can show it and stay open. A delivered program is dated the day it ended, as in mock mode.
 */
export async function saveProgram(fields: ProgramFields, id?: string): Promise<Program> {
  if (isMockMode()) {
    const saved = id ? updateProgram(id, fields) : createProgram(fields);
    if (!saved) throw new Error("This program no longer exists.");
    return saved;
  }
  const deliveredDay = withDeliveredDay(fields);
  const body: ProgramWriteInput = {
    title: fields.name,
    programType: fields.type,
    status: fields.status,
    format: fields.format,
    country: fields.country,
    location: fields.location ?? "",
    partnerId: fields.partnerId ?? null,
    participantCount: fields.participants,
    participantTarget: fields.target,
    facilitators: fields.facilitators,
    notes: fields.notes ?? "",
    startAt: toApiTime(fields.startAt),
    endAt: toApiTime(fields.endAt),
    ...(deliveredDay ? { deliveredAt: toApiTime(deliveredDay) } : {}),
  };
  const saved = id ? await updateProgramApi(id, body) : await createProgramApi(body);
  notifyProgramsChanged();
  return toProgramRow(saved);
}

/** Cancels a program. Real mode: waits for the API, so a failure reaches the caller. */
export async function saveCancellation(id: string): Promise<void> {
  if (isMockMode()) {
    cancelProgram(id);
    return;
  }
  await updateProgramApi(id, { status: "cancelled" });
  notifyProgramsChanged();
}
