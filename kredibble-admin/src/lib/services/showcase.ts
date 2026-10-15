"use client";

/**
 * Showcase service: reads and changes the people and organisations featured on the app ("Meet our people"). Mock mode only: it
 * writes the shared in-memory store ({ always: true }) and the audit log, and never calls the backend, which has no showcase
 * endpoint yet.
 * TODO(backend): every write below must become a server call (see task.md, the Showcase backend tasks). Photos: the picture is an
 * data: URL in memory here; the server must accept an upload (type and magic-byte check, 5 MB cap, Cloudinary) and store the URL.
 *
 * - Permission checks live in the caller (use-showcase-manager), which asks `can(...)` before every call. The data rules are
 *   repeated here, so a wrong caller is still refused: every function returns { ok: true, ... } or { ok: false, reason }.
 * - Publishing is direct: an entry marked Visible is on the app at once. Hiding is one click.
 * - Every add, edit, show, hide, move and delete writes an audit entry: who, which entry, what changed, when.
 */
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
import { recordAudit } from "@/lib/services/audit-log";

/** Tells a list hook to reload when the showcase changes. */
export const subscribeShowcase = subscribeMockStore;

const readEntries = () => getMockCollection("showcaseEntries");
const readCategories = () => getMockCollection("showcaseCategories");
const writeEntries = (rows: ShowcaseEntry[]) => setMockCollection("showcaseEntries", rows, { always: true });
const writeCategories = (rows: ShowcaseCategory[]) => setMockCollection("showcaseCategories", rows, { always: true });

export const loadShowcaseCategories = async (): Promise<ShowcaseCategory[]> => [...readCategories()].sort((a, b) => a.order - b.order);
export const loadShowcaseEntries = async (): Promise<ShowcaseEntry[]> => [...readEntries()];

/** The categories and entries, re-rendering the caller on every change. */
export const useShowcase = () => ({ categories: useMockCollection("showcaseCategories"), entries: useMockCollection("showcaseEntries") });

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

/** Ambassadors or partners that are not featured yet, for "Start from an existing record". */
export function suggestionsFor(categoryKey: ShowcaseCategory["key"]): Suggestion[] {
  const featured = readEntries();
  if (categoryKey === "ambassadors") {
    const taken = new Set(featured.map((entry) => entry.linkedAmbassadorId).filter(Boolean));
    return getMockCollection("ambassadors").filter((person) => !taken.has(person.id)).slice(0, 50).map(fromAmbassador);
  }
  if (categoryKey === "partners") {
    const taken = new Set(featured.map((entry) => entry.linkedPartnerId).filter(Boolean));
    return getMockCollection("partners").filter((partner) => !taken.has(partner.id)).slice(0, 50).map(fromPartner);
  }
  return [];
}
