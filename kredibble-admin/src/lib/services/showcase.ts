"use client";

/**
 * Showcase service: reads and changes the people and organisations featured on the app ("Meet our people").
 *
 * - Real mode (the default): one read of GET /admin/showcase (BE-030) gives every category and entry, and every change is a
 *   server call the page waits for (saveEntry, saveEntryVisible, ... below). The server checks the caller's role per category,
 *   renumbers the order and writes the audit entry itself; the History dialog reads it back (loadShowcaseHistory). A refusal
 *   (403 for a category the role may not change, 409 for a taken name or a category that is not empty) comes back as
 *   { ok: false, reason } with the server's message. A newly picked photo is uploaded first and the stored https address saved.
 * - Mock mode: the synchronous functions (addEntry, updateEntry, ...) write the shared in-memory store ({ always: true }) and the
 *   in-browser audit log, and never call the backend.
 * - Permission checks also live in the caller (use-showcase-manager), which asks `can(...)` before every call, for the experience.
 *   The data rules are repeated in the mock functions, so a wrong caller is still refused.
 * - Publishing is direct: an entry marked Visible is on the app at once. Hiding is one click.
 */
import { useSyncExternalStore } from "react";
import {
  createShowcaseCategoryApi,
  createShowcaseEntryApi,
  deleteShowcaseCategoryApi,
  deleteShowcaseEntryApi,
  getShowcaseApi,
  getShowcaseHistoryApi,
  moveShowcaseCategoryApi,
  moveShowcaseEntryApi,
  setShowcaseEntryVisibleApi,
  updateShowcaseCategoryApi,
  updateShowcaseEntryApi,
  uploadShowcasePhoto,
  type ShowcaseEntryWriteInput,
} from "@/lib/api";
import { getMockCollection, setMockCollection, subscribeMockStore, useMockCollection } from "@/lib/mock-store";
import type { Ambassador, Partner, ShowcaseCategory, ShowcaseEntry, ShowcaseKind } from "@/lib/mock-entities";
import {
  canDeleteCategory,
  moveCategory,
  moveEntry,
  nextCategoryOrder,
  nextEntryOrder,
  normaliseText,
  validateCategory,
  validateEntry,
  type CategoryErrors,
  type EntryErrors,
  type EntryForm,
} from "@/lib/showcase";
import { flatDetails } from "@/lib/services/ambassador-import";
import { dataUrlToFile } from "@/lib/services/api-helpers";
import { recordAudit, type AuditAction, type AuditEntry } from "@/lib/services/audit-log";
import { isMockMode } from "@/lib/services/mock-mode";
import { loadAmbassadorRows } from "@/lib/services/network";
import { loadPartnerRows } from "@/lib/services/partners";

const readEntries = () => getMockCollection("showcaseEntries");
const readCategories = () => getMockCollection("showcaseCategories");
const writeEntries = (rows: ShowcaseEntry[]) => setMockCollection("showcaseEntries", rows, { always: true });
const writeCategories = (rows: ShowcaseCategory[]) => setMockCollection("showcaseCategories", rows, { always: true });
const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order;

// ---- Real mode: the last server read, shared by the page's list and useShowcase ---------------------------------------

export interface ShowcaseData {
  categories: ShowcaseCategory[];
  entries: ShowcaseEntry[];
}

const EMPTY: ShowcaseData = { categories: [], entries: [] };
let liveShowcase: ShowcaseData = EMPTY;
const cacheListeners = new Set<() => void>();
// Saves do not go through the store in real mode, so they tell the open page through these listeners instead.
const liveListeners = new Set<() => void>();

/** Tells the open Showcase page that the data changed (real mode: after a change was sent), so it reads it again. */
export const notifyShowcaseChanged = (): void => liveListeners.forEach((listener) => listener());

/** Re-run a loader whenever the showcase changes: a store change (mock mode) or a saved change (real mode). */
export function subscribeShowcase(listener: () => void): () => void {
  const unsubscribeStore = subscribeMockStore(listener);
  liveListeners.add(listener);
  return () => {
    unsubscribeStore();
    liveListeners.delete(listener);
  };
}

const subscribeCache = (listener: () => void) => {
  cacheListeners.add(listener);
  return () => {
    cacheListeners.delete(listener);
  };
};

/** Real mode: reads everything (hidden entries included) and keeps it for useShowcase. Rejects with the API's message. */
async function readShowcase(): Promise<ShowcaseData> {
  const data = await getShowcaseApi();
  liveShowcase = { categories: [...data.categories].sort(byOrder), entries: data.entries };
  cacheListeners.forEach((listener) => listener());
  return liveShowcase;
}

export const loadShowcaseCategories = async (): Promise<ShowcaseCategory[]> =>
  isMockMode() ? [...readCategories()].sort(byOrder) : (await readShowcase()).categories;
export const loadShowcaseEntries = async (): Promise<ShowcaseEntry[]> => (isMockMode() ? [...readEntries()] : (await readShowcase()).entries);

/**
 * The categories and entries, re-rendering the caller on every change. Real mode: what the page's last read returned (the page
 * loads through loadShowcaseEntries, which shows the loading and error states); mock mode: the live store.
 */
export function useShowcase(): ShowcaseData {
  const categories = useMockCollection("showcaseCategories");
  const entries = useMockCollection("showcaseEntries");
  const live = useSyncExternalStore(subscribeCache, () => liveShowcase, () => EMPTY);
  return isMockMode() ? { categories, entries } : live;
}

export type Failure = { ok: false; reason: string };
export type EntryFailure = { ok: false; reason: string; errors?: EntryErrors };
export type CategoryFailure = { ok: false; reason: string; errors?: CategoryErrors };

const now = () => new Date().toISOString();
const categoryName = (id: string) => readCategories().find((category) => category.id === id)?.name ?? "Unknown category";

// ---- Entries ----------------------------------------------------------------------------------------------------

/** Adds an entry at the end of its category. */
export function addEntry(
  form: EntryForm,
  links: { ambassadorId?: string; partnerId?: string },
  actor: string,
): ({ ok: true; entry: ShowcaseEntry }) | EntryFailure {
  const errors = validateEntry(form, readCategories());
  if (Object.keys(errors).length > 0) return { ok: false, reason: "Fix the highlighted fields.", errors };
  const stamp = now();
  const entry: ShowcaseEntry = {
    id: `se-${Date.now()}-${readEntries().length}`,
    categoryId: form.categoryId,
    name: normaliseText(form.name),
    title: normaliseText(form.title),
    bio: form.bio.trim(),
    photoUrl: form.photoUrl,
    country: normaliseText(form.country) || undefined,
    providedBy: normaliseText(form.providedBy) || undefined,
    visible: form.visible,
    order: nextEntryOrder(readEntries(), form.categoryId),
    linkedAmbassadorId: links.ambassadorId,
    linkedPartnerId: links.partnerId,
    createdAt: stamp,
    updatedAt: stamp,
  };
  writeEntries([...readEntries(), entry]);
  recordAudit({
    actor,
    action: "showcase.add",
    summary: `Added ${entry.name} to ${categoryName(entry.categoryId)}${entry.visible ? " (visible)" : " (hidden)"}`,
    details: { entry: entry.name, category: categoryName(entry.categoryId), visible: entry.visible, hasPhoto: !!entry.photoUrl, providedBy: entry.providedBy ?? "—" },
  });
  return { ok: true, entry };
}

/** Changes an entry. Moving it to another category puts it last there. */
export function updateEntry(id: string, form: EntryForm, actor: string): ({ ok: true; entry: ShowcaseEntry }) | EntryFailure {
  const current = readEntries().find((entry) => entry.id === id);
  if (!current) return { ok: false, reason: "That entry no longer exists." };
  const errors = validateEntry(form, readCategories());
  if (Object.keys(errors).length > 0) return { ok: false, reason: "Fix the highlighted fields.", errors };
  const moved = form.categoryId !== current.categoryId;
  const entry: ShowcaseEntry = {
    ...current,
    categoryId: form.categoryId,
    name: normaliseText(form.name),
    title: normaliseText(form.title),
    bio: form.bio.trim(),
    photoUrl: form.photoUrl,
    country: normaliseText(form.country) || undefined,
    providedBy: normaliseText(form.providedBy) || undefined,
    visible: form.visible,
    order: moved ? nextEntryOrder(readEntries(), form.categoryId) : current.order,
    updatedAt: now(),
  };
  writeEntries(readEntries().map((row) => (row.id === id ? entry : row)));
  recordAudit({
    actor,
    action: "showcase.edit",
    summary: `Edited ${entry.name}`,
    details: {
      entry: entry.name,
      category: categoryName(entry.categoryId),
      visible: entry.visible,
      photoChanged: current.photoUrl !== entry.photoUrl,
      movedCategory: moved ? `${categoryName(current.categoryId)} to ${categoryName(entry.categoryId)}` : "no",
    },
  });
  return { ok: true, entry };
}

/** Shows or hides an entry. Publishing is direct: Visible means it is on the app now. */
export function setEntryVisible(id: string, visible: boolean, actor: string): { ok: true } | Failure {
  const current = readEntries().find((entry) => entry.id === id);
  if (!current) return { ok: false, reason: "That entry no longer exists." };
  if (current.visible === visible) return { ok: true };
  writeEntries(readEntries().map((row) => (row.id === id ? { ...row, visible, updatedAt: now() } : row)));
  recordAudit({
    actor,
    action: visible ? "showcase.show" : "showcase.hide",
    summary: `${visible ? "Showed" : "Hid"} ${current.name}`,
    details: { entry: current.name, category: categoryName(current.categoryId), from: current.visible ? "Visible" : "Hidden", to: visible ? "Visible" : "Hidden" },
  });
  return { ok: true };
}

export function moveEntryPlace(id: string, direction: "up" | "down", actor: string): { ok: true } | Failure {
  const current = readEntries().find((entry) => entry.id === id);
  if (!current) return { ok: false, reason: "That entry no longer exists." };
  const next = moveEntry(readEntries(), id, direction);
  const after = next.find((entry) => entry.id === id)!;
  if (after.order === current.order) return { ok: false, reason: direction === "up" ? "It is already first." : "It is already last." };
  writeEntries(next);
  recordAudit({
    actor,
    action: "showcase.move",
    summary: `Moved ${current.name} ${direction}`,
    details: { entry: current.name, category: categoryName(current.categoryId), place: `${current.order} to ${after.order}` },
  });
  return { ok: true };
}

export function deleteEntry(id: string, actor: string): { ok: true } | Failure {
  const current = readEntries().find((entry) => entry.id === id);
  if (!current) return { ok: false, reason: "That entry no longer exists." };
  writeEntries(readEntries().filter((entry) => entry.id !== id));
  recordAudit({
    actor,
    action: "showcase.delete",
    summary: `Deleted ${current.name} from ${categoryName(current.categoryId)}`,
    details: { entry: current.name, category: categoryName(current.categoryId), wasVisible: current.visible },
  });
  return { ok: true };
}

// ---- Categories -------------------------------------------------------------------------------------------------

export function addCategory(name: string, kind: ShowcaseKind, actor: string): ({ ok: true; category: ShowcaseCategory }) | CategoryFailure {
  const errors = validateCategory(name, kind, readCategories());
  if (Object.keys(errors).length > 0) return { ok: false, reason: "Fix the highlighted fields.", errors };
  const category: ShowcaseCategory = { id: `sc-${Date.now()}`, key: "custom", name: normaliseText(name), kind, order: nextCategoryOrder(readCategories()), visible: true };
  writeCategories([...readCategories(), category]);
  recordAudit({ actor, action: "showcase.category_add", summary: `Added the category ${category.name}`, details: { category: category.name, kind } });
  return { ok: true, category };
}

/** Renames a category, changes its kind (custom ones only) or shows and hides it. A hidden category hides everything in it. */
export function updateCategory(id: string, change: { name?: string; kind?: ShowcaseKind; visible?: boolean }, actor: string): { ok: true } | CategoryFailure {
  const current = readCategories().find((category) => category.id === id);
  if (!current) return { ok: false, reason: "That category no longer exists." };
  const name = change.name ?? current.name;
  const kind = change.kind ?? current.kind;
  const errors = validateCategory(name, kind, readCategories(), id);
  if (Object.keys(errors).length > 0) return { ok: false, reason: "Fix the highlighted fields.", errors };
  if (current.key !== "custom" && kind !== current.kind) return { ok: false, reason: "The kind of a built-in category cannot change." };
  const next: ShowcaseCategory = { ...current, name: normaliseText(name), kind, visible: change.visible ?? current.visible };
  writeCategories(readCategories().map((category) => (category.id === id ? next : category)));
  recordAudit({
    actor,
    action: "showcase.category_edit",
    summary: `Changed the category ${current.name}`,
    details: { category: next.name, renamed: next.name !== current.name, visible: next.visible, kind: next.kind },
  });
  return { ok: true };
}

export function moveCategoryPlace(id: string, direction: "up" | "down", actor: string): { ok: true } | Failure {
  const current = readCategories().find((category) => category.id === id);
  if (!current) return { ok: false, reason: "That category no longer exists." };
  const next = moveCategory(readCategories(), id, direction);
  const after = next.find((category) => category.id === id)!;
  if (after.order === current.order) return { ok: false, reason: direction === "up" ? "It is already first." : "It is already last." };
  writeCategories(next);
  recordAudit({ actor, action: "showcase.category_move", summary: `Moved the category ${current.name} ${direction}`, details: { category: current.name, place: `${current.order} to ${after.order}` } });
  return { ok: true };
}

export function deleteCategory(id: string, actor: string): { ok: true } | Failure {
  const current = readCategories().find((category) => category.id === id);
  if (!current) return { ok: false, reason: "That category no longer exists." };
  const verdict = canDeleteCategory(current, readEntries());
  if (!verdict.allowed) return { ok: false, reason: verdict.reason ?? "This category cannot be deleted." };
  writeCategories(readCategories().filter((category) => category.id !== id));
  recordAudit({ actor, action: "showcase.category_delete", summary: `Deleted the category ${current.name}`, details: { category: current.name } });
  return { ok: true };
}

// ---- Start from an existing ambassador or partner (so nobody is typed in twice) -------------------------------------

export interface Suggestion {
  /** "ambassador:amb-1" / "partner:partner-3": unique across both lists. */
  id: string;
  label: string;
  description: string;
  fill: Pick<EntryForm, "name" | "title" | "bio" | "country" | "photoUrl">;
  link: { ambassadorId?: string; partnerId?: string };
}

const fromAmbassador = (person: Ambassador): Suggestion => ({
  id: `ambassador:${person.id}`,
  label: person.name,
  description: `Ambassador, ${person.city}, ${person.country}`,
  fill: { name: person.name, title: person.roleTitle ?? "Ambassador", bio: (person.description ?? "").slice(0, 400), country: person.country, photoUrl: person.photoUrl },
  link: { ambassadorId: person.id },
});

const fromPartner = (partner: Partner): Suggestion => ({
  id: `partner:${partner.id}`,
  label: partner.name,
  description: `Partner, ${partner.sector}, ${partner.country}`,
  fill: { name: partner.name, title: partner.provides, bio: "", country: partner.country },
  link: { partnerId: partner.id },
});

const SUGGESTION_LIMIT = 50;

const ambassadorSuggestions = (featured: readonly ShowcaseEntry[], people: readonly Ambassador[]): Suggestion[] => {
  const taken = new Set(featured.map((entry) => entry.linkedAmbassadorId).filter(Boolean));
  return people.filter((person) => !taken.has(person.id)).slice(0, SUGGESTION_LIMIT).map(fromAmbassador);
};

const partnerSuggestions = (featured: readonly ShowcaseEntry[], partners: readonly Partner[]): Suggestion[] => {
  const taken = new Set(featured.map((entry) => entry.linkedPartnerId).filter(Boolean));
  return partners.filter((partner) => !taken.has(partner.id)).slice(0, SUGGESTION_LIMIT).map(fromPartner);
};

/** Mock mode: ambassadors or partners from the store that are not featured yet, for "Start from an existing record". */
export function suggestionsFor(categoryKey: ShowcaseCategory["key"]): Suggestion[] {
  if (categoryKey === "ambassadors") return ambassadorSuggestions(readEntries(), getMockCollection("ambassadors"));
  if (categoryKey === "partners") return partnerSuggestions(readEntries(), getMockCollection("partners"));
  return [];
}

/**
 * Ambassadors or partners that are not featured yet. Real mode reads them from the API and leaves out anyone the last showcase
 * read already links (the server refuses a second entry for the same person with a 409 as well).
 */
export async function loadSuggestions(categoryKey: ShowcaseCategory["key"]): Promise<Suggestion[]> {
  if (isMockMode()) return suggestionsFor(categoryKey);
  if (categoryKey === "ambassadors") return ambassadorSuggestions(liveShowcase.entries, await loadAmbassadorRows());
  if (categoryKey === "partners") return partnerSuggestions(liveShowcase.entries, await loadPartnerRows());
  return [];
}

// ---- Changes: a server call in real mode, the store in mock mode ---------------------------------------------------

type Links = { ambassadorId?: string; partnerId?: string };

const failure = (error: unknown): Failure => ({
  ok: false,
  reason: error instanceof Error && error.message ? error.message : "Something went wrong. Try again.",
});

/** Sends one change and reports the server's refusal as { ok: false, reason }. The page reads again either way. */
async function send(change: () => Promise<unknown>): Promise<{ ok: true } | Failure> {
  try {
    await change();
    return { ok: true };
  } catch (error) {
    return failure(error);
  } finally {
    notifyShowcaseChanged();
  }
}

/** Adds an entry (no `editingId`) or saves the edit. A newly picked photo is uploaded first; the server stores its https address. */
export async function saveEntry(
  form: EntryForm,
  links: Links,
  actor: string,
  editingId?: string,
): Promise<{ ok: true; entry: ShowcaseEntry } | EntryFailure> {
  if (isMockMode()) return editingId ? updateEntry(editingId, form, actor) : addEntry(form, links, actor);
  try {
    const photoUrl = form.photoUrl?.startsWith("data:")
      ? (await uploadShowcasePhoto(dataUrlToFile(form.photoUrl, "showcase-photo"))).url
      : form.photoUrl;
    const body: ShowcaseEntryWriteInput = {
      categoryId: form.categoryId,
      name: form.name,
      title: form.title,
      bio: form.bio,
      country: form.country,
      providedBy: form.providedBy,
      photoUrl: photoUrl ?? null,
      visible: form.visible,
    };
    const entry = editingId
      ? await updateShowcaseEntryApi(editingId, body)
      : await createShowcaseEntryApi({ ...body, linkedAmbassadorId: links.ambassadorId, linkedPartnerId: links.partnerId });
    return { ok: true, entry };
  } catch (error) {
    return failure(error);
  } finally {
    notifyShowcaseChanged();
  }
}

export const saveEntryVisible = async (entry: ShowcaseEntry, visible: boolean, actor: string): Promise<{ ok: true } | Failure> =>
  isMockMode() ? setEntryVisible(entry.id, visible, actor) : send(() => setShowcaseEntryVisibleApi(entry.id, visible));

export const saveEntryMove = async (entry: ShowcaseEntry, direction: "up" | "down", actor: string): Promise<{ ok: true } | Failure> =>
  isMockMode() ? moveEntryPlace(entry.id, direction, actor) : send(() => moveShowcaseEntryApi(entry.id, direction));

export const saveEntryDeletion = async (entry: ShowcaseEntry, actor: string): Promise<{ ok: true } | Failure> =>
  isMockMode() ? deleteEntry(entry.id, actor) : send(() => deleteShowcaseEntryApi(entry.id));

/** Adds a custom category (no `editingId`) or renames it / changes its kind. */
export async function saveCategory(name: string, kind: ShowcaseKind, actor: string, editingId?: string): Promise<{ ok: true } | CategoryFailure> {
  if (isMockMode()) return editingId ? updateCategory(editingId, { name, kind }, actor) : addCategory(name, kind, actor);
  return send(() => (editingId ? updateShowcaseCategoryApi(editingId, { name, kind }) : createShowcaseCategoryApi({ name, kind })));
}

export const saveCategoryVisible = async (category: ShowcaseCategory, visible: boolean, actor: string): Promise<{ ok: true } | Failure> =>
  isMockMode() ? updateCategory(category.id, { visible }, actor) : send(() => updateShowcaseCategoryApi(category.id, { visible }));

export const saveCategoryMove = async (category: ShowcaseCategory, direction: "up" | "down", actor: string): Promise<{ ok: true } | Failure> =>
  isMockMode() ? moveCategoryPlace(category.id, direction, actor) : send(() => moveShowcaseCategoryApi(category.id, direction));

export const saveCategoryDeletion = async (category: ShowcaseCategory, actor: string): Promise<{ ok: true } | Failure> =>
  isMockMode() ? deleteCategory(category.id, actor) : send(() => deleteShowcaseCategoryApi(category.id));

/** Real mode: the History dialog's entries, newest first, from the server's audit log. */
export async function loadShowcaseHistory(): Promise<AuditEntry[]> {
  const rows = await getShowcaseHistoryApi();
  return rows.map((row) => {
    const { summary, ...facts } = row.metadata;
    return {
      id: row.id,
      at: row.at,
      actor: row.actorName ?? "Unknown user",
      action: row.action as AuditAction,
      summary: typeof summary === "string" ? summary : row.action,
      details: flatDetails(facts),
    };
  });
}
