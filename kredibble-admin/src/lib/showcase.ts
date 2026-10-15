/**
 * Showcase rules (pure, no store, no React): everything the Showcase page decides, so it can be tested without a browser and the real
 * server can copy the same rules.
 *
 * - A CATEGORY is a heading on the app's "Meet our people" page (Ambassadors, Team, Partners, Stakeholders, and any the admin
 *   adds, such as Developers). The four built-in ones have a fixed `key`; permissions are scoped by it.
 * - An ENTRY is one person or organisation with a photo, a title and a short bio. It is Visible (shown on the app) or Hidden.
 *   Publishing is direct: switching an entry to Visible puts it on the app at once, for the roles allowed to edit its category.
 * - ACCESS (see canEditCategory): the Showcase editors (Super Admin, Desk Lead, Communications Officer) edit every category;
 *   the Country Lead edits only Ambassadors; the Partnerships Officer edits only Partners. Creating, renaming, reordering and
 *   deleting CATEGORIES needs the separate `showcase.manage` permission (Super Admin and Desk Lead).
 *
 * TODO(backend): all of this must be enforced again on the server (see task.md, BE showcase tasks).
 */
import type { ShowcaseCategory, ShowcaseEntry, ShowcaseKind } from "@/lib/mock-entities";
import type { AccessLevel, Screen } from "@/config/permissions";

export const NAME_MAX = 80;
export const TITLE_MAX = 100;
export const BIO_MAX = 400;
export const PROVIDED_MAX = 120;
export const CATEGORY_NAME_MAX = 40;

export const KIND_LABEL: Record<ShowcaseKind, string> = { person: "People (round photo)", organisation: "Organisations (logo)" };

export const normaliseText = (value: string): string => value.replace(/\s+/g, " ").trim();

export interface EntryForm {
  categoryId: string;
  name: string;
  title: string;
  bio: string;
  country: string;
  providedBy: string;
  photoUrl?: string;
  visible: boolean;
}

export type EntryErrors = Partial<Record<"categoryId" | "name" | "title" | "bio" | "providedBy", string>>;

/** The error for each wrong field (none = valid). Messages say what to do, in one sentence. */
export function validateEntry(form: EntryForm, categories: readonly Pick<ShowcaseCategory, "id">[]): EntryErrors {
  const errors: EntryErrors = {};
  if (!categories.some((category) => category.id === form.categoryId)) errors.categoryId = "Choose a category.";
  const name = normaliseText(form.name);
  if (name === "") errors.name = "Enter the name.";
  else if (name.length > NAME_MAX) errors.name = `Keep the name to ${NAME_MAX} characters or fewer.`;
  if (normaliseText(form.title) === "") errors.title = "Enter the role or what they do.";
  else if (normaliseText(form.title).length > TITLE_MAX) errors.title = `Keep this to ${TITLE_MAX} characters or fewer.`;
  if (form.bio.trim().length > BIO_MAX) errors.bio = `The bio is ${form.bio.trim().length} characters. The limit is ${BIO_MAX}.`;
  if (normaliseText(form.providedBy).length > PROVIDED_MAX) errors.providedBy = `Keep this to ${PROVIDED_MAX} characters or fewer.`;
  return errors;
}

export type CategoryErrors = Partial<Record<"name" | "kind", string>>;

/** A category name is required, short and unique (trimmed, case-insensitive). `ignoreId` lets a rename keep its own name. */
export function validateCategory(name: string, kind: string, existing: readonly ShowcaseCategory[], ignoreId?: string): CategoryErrors {
  const errors: CategoryErrors = {};
  const clean = normaliseText(name);
  if (clean === "") errors.name = "Enter a name for the category.";
  else if (clean.length > CATEGORY_NAME_MAX) errors.name = `Keep the name to ${CATEGORY_NAME_MAX} characters or fewer.`;
  else if (existing.some((category) => category.id !== ignoreId && normaliseText(category.name).toLowerCase() === clean.toLowerCase())) {
    errors.name = "A category with this name already exists.";
  }
  if (kind !== "person" && kind !== "organisation") errors.kind = "Choose people or organisations.";
  return errors;
}

/** The entries of one category, in their order. */
export const entriesOf = (entries: readonly ShowcaseEntry[], categoryId: string): ShowcaseEntry[] =>
  entries.filter((entry) => entry.categoryId === categoryId).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

/** The order number for a new entry: last place in its category. */
export const nextEntryOrder = (entries: readonly ShowcaseEntry[], categoryId: string): number =>
  entries.filter((entry) => entry.categoryId === categoryId).reduce((highest, entry) => Math.max(highest, entry.order), 0) + 1;

export const nextCategoryOrder = (categories: readonly ShowcaseCategory[]): number => categories.reduce((highest, category) => Math.max(highest, category.order), 0) + 1;

/** Moves an entry one place up or down inside its category. Returns the same array when it cannot move. Orders are renumbered 1..n. */
export function moveEntry(entries: readonly ShowcaseEntry[], id: string, direction: "up" | "down"): ShowcaseEntry[] {
  const target = entries.find((entry) => entry.id === id);
  if (!target) return [...entries];
  const siblings = entriesOf(entries, target.categoryId);
  const index = siblings.findIndex((entry) => entry.id === id);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= siblings.length) return [...entries];
  const reordered = [...siblings];
  [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];
  const newOrder = new Map(reordered.map((entry, position) => [entry.id, position + 1]));
  return entries.map((entry) => (newOrder.has(entry.id) ? { ...entry, order: newOrder.get(entry.id)! } : entry));
}

/** Moves a category one place up or down. Renumbers 1..n. */
export function moveCategory(categories: readonly ShowcaseCategory[], id: string, direction: "up" | "down"): ShowcaseCategory[] {
  const sorted = [...categories].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((category) => category.id === id);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapWith < 0 || swapWith >= sorted.length) return [...categories];
  [sorted[index], sorted[swapWith]] = [sorted[swapWith], sorted[index]];
  const newOrder = new Map(sorted.map((category, position) => [category.id, position + 1]));
  return categories.map((category) => ({ ...category, order: newOrder.get(category.id) ?? category.order }));
}

export interface Verdict {
  allowed: boolean;
  reason?: string;
}

/** A category can be deleted only when it is a custom one with nothing in it. The built-in four can be hidden, never deleted. */
export function canDeleteCategory(category: ShowcaseCategory, entries: readonly ShowcaseEntry[]): Verdict {
  if (category.key !== "custom") return { allowed: false, reason: "The built-in categories cannot be deleted. Hide the category instead." };
  const count = entries.filter((entry) => entry.categoryId === category.id).length;
  if (count > 0) return { allowed: false, reason: `Move or delete its ${count} ${count === 1 ? "entry" : "entries"} first.` };
  return { allowed: true };
}

type Can = (screen: Screen, level: AccessLevel) => boolean;

/** May this person add, edit, hide or delete entries in this category? */
export function canEditCategory(can: Can, category: Pick<ShowcaseCategory, "key">): boolean {
  if (can("showcase", "edit")) return true;
  if (category.key === "ambassadors") return can("showcase.ambassadors", "edit");
  if (category.key === "partners") return can("showcase.partners", "edit");
  return false;
}

/** What the app shows: visible categories in order, each with its visible entries in order. Empty categories are left out. */
export function appView(categories: readonly ShowcaseCategory[], entries: readonly ShowcaseEntry[]): { category: ShowcaseCategory; entries: ShowcaseEntry[] }[] {
  return [...categories]
    .filter((category) => category.visible)
    .sort((a, b) => a.order - b.order)
    .map((category) => ({ category, entries: entriesOf(entries, category.id).filter((entry) => entry.visible) }))
    .filter((group) => group.entries.length > 0);
}
