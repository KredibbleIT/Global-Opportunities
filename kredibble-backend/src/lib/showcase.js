import { ShowcaseCategory, ShowcaseEntry, SHOWCASE_BUILT_IN_KEYS } from '../models/AdminPortal.js';
import { roleCan } from './permissions.js';

/**
 * BE-030: the Showcase rules ("Meet our people"), the server copy of
 * kredibble-admin/src/lib/showcase.ts.
 *
 * - Access: `showcase` edit (Super Admin, Desk Lead, Communications Officer)
 *   edits every category; `showcase.ambassadors` (Country Lead) only
 *   Ambassadors; `showcase.partners` (Partnerships Officer) only Partners.
 *   `showcase.manage` (Super Admin, Desk Lead) changes the categories.
 * - Order: entries are numbered 1..n inside their category, categories 1..n
 *   on the page; every move and delete renumbers.
 * - The app sees visible categories that hold at least one visible entry, and
 *   never `providedBy` (a staff-only note).
 */

/** Collapses runs of spaces and trims, the way the admin form does. */
export const normaliseText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

/** Category names are unique whatever the capitals. */
export const nameKeyOf = (name) => normaliseText(name).toLowerCase();

export const BUILT_IN_CATEGORIES = Object.freeze([
  { key: 'ambassadors', name: 'Ambassadors', kind: 'person' },
  { key: 'team', name: 'Team', kind: 'person' },
  { key: 'partners', name: 'Partners', kind: 'organisation' },
  { key: 'stakeholders', name: 'Stakeholders', kind: 'person' },
]);

const DUPLICATE_KEY = 11000;

/**
 * Creates any missing built-in category, last on the page. One indexed read
 * when all four exist, so it is cheap enough to run before every read.
 * Two requests seeding at once collide on the unique name; the loser skips.
 * @returns {Promise<void>}
 */
export async function ensureBuiltInCategories() {
  const present = await ShowcaseCategory.find({ key: { $in: SHOWCASE_BUILT_IN_KEYS } }).select('key').lean();
  if (present.length >= BUILT_IN_CATEGORIES.length) return;
  const have = new Set(present.map((category) => category.key));
  for (const category of BUILT_IN_CATEGORIES) {
    if (have.has(category.key)) continue;
    const last = await ShowcaseCategory.findOne().sort({ order: -1 }).select('order').lean();
    try {
      await ShowcaseCategory.updateOne(
        { key: category.key },
        { $setOnInsert: { ...category, nameKey: nameKeyOf(category.name), order: (last?.order ?? 0) + 1, visible: true } },
        { upsert: true },
      );
    } catch (error) {
      if (error?.code !== DUPLICATE_KEY) throw error;
    }
  }
}

/**
 * What a set of BE-001 roles may do on the Showcase.
 * @param {string[]} roles - from resolveStaffRoles (the verified session)
 * @param {object} [toggles] - the editable roles' switches
 * @returns {{ view: boolean, editAll: boolean, ambassadors: boolean, partners: boolean, manage: boolean }}
 */
export function showcaseAccessFor(roles, toggles) {
  const editAll = roleCan(roles, 'showcase', 'edit', toggles);
  const ambassadors = editAll || roleCan(roles, 'showcase.ambassadors', 'edit', toggles);
  const partners = editAll || roleCan(roles, 'showcase.partners', 'edit', toggles);
  return {
    view: editAll || ambassadors || partners || roleCan(roles, 'showcase', 'view', toggles),
    editAll,
    ambassadors,
    partners,
    manage: roleCan(roles, 'showcase.manage', 'edit', toggles),
  };
}

/**
 * May this caller add, edit, show, hide, move or delete entries in this category?
 * @param {ReturnType<typeof showcaseAccessFor>} access
 * @param {{ key: string }} category
 * @returns {boolean}
 */
export function canEditCategory(access, category) {
  if (access.editAll) return true;
  if (category.key === 'ambassadors') return access.ambassadors;
  if (category.key === 'partners') return access.partners;
  return false;
}

const PLACE_SORT = { order: 1, createdAt: 1, _id: 1 };

/** Writes 1..n onto the rows in the order given, touching only those that change. */
async function writePlaces(Model, rows) {
  const writes = rows
    .map((row, index) => ({ row, order: index + 1 }))
    .filter(({ row, order }) => row.order !== order)
    .map(({ row, order }) => ({ updateOne: { filter: { _id: row._id }, update: { $set: { order } } } }));
  if (writes.length > 0) await Model.bulkWrite(writes);
}

/**
 * Swaps a row with its neighbour and renumbers the group 1..n.
 * @param {import('mongoose').Model} Model - ShowcaseEntry or ShowcaseCategory
 * @param {object} filter - the group: one category's entries, or every category
 * @param {string} id
 * @param {'up' | 'down'} direction
 * @returns {Promise<{ from: number, to: number } | null>} the place before and after; null when it cannot move
 */
export async function moveWithinGroup(Model, filter, id, direction) {
  const rows = await Model.find(filter).sort(PLACE_SORT).select('_id order').lean();
  const index = rows.findIndex((row) => String(row._id) === String(id));
  const swapWith = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || swapWith < 0 || swapWith >= rows.length) return null;
  [rows[index], rows[swapWith]] = [rows[swapWith], rows[index]];
  await writePlaces(Model, rows);
  return { from: index + 1, to: swapWith + 1 };
}

/**
 * Closes the gaps a delete or a move to another category leaves: 1..n again.
 * @param {import('mongoose').Model} Model
 * @param {object} filter
 * @returns {Promise<void>}
 */
export async function renumberGroup(Model, filter) {
  const rows = await Model.find(filter).sort(PLACE_SORT).select('_id order').lean();
  await writePlaces(Model, rows);
}

/** The place after the last one in the group. */
export async function nextPlace(Model, filter) {
  const last = await Model.findOne(filter).sort({ order: -1 }).select('order').lean();
  return (last?.order ?? 0) + 1;
}

/** A category as both the admin and the app receive it. */
export const toCategoryObject = (category) => ({
  id: String(category._id),
  key: category.key,
  name: category.name,
  kind: category.kind,
  order: category.order,
  visible: category.visible,
});

/** An entry as the admin receives it: everything, including the staff-only `providedBy`. */
export const toAdminEntryObject = (entry) => ({
  id: String(entry._id),
  categoryId: String(entry.categoryId),
  name: entry.name,
  title: entry.title,
  bio: entry.bio ?? '',
  photoUrl: entry.photoUrl || undefined,
  country: entry.country || undefined,
  providedBy: entry.providedBy || undefined,
  visible: entry.visible,
  order: entry.order,
  linkedAmbassadorId: entry.linkedAmbassadorId ? String(entry.linkedAmbassadorId) : undefined,
  linkedPartnerId: entry.linkedPartnerId ? String(entry.linkedPartnerId) : undefined,
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,
});

/**
 * An entry as the app receives it. An allowlist, so a field added to the
 * model later (or `providedBy`) never reaches the app by accident.
 */
export const toAppEntryObject = (entry) => ({
  id: String(entry._id),
  categoryId: String(entry.categoryId),
  name: entry.name,
  title: entry.title,
  bio: entry.bio ?? '',
  photoUrl: entry.photoUrl || undefined,
  country: entry.country || undefined,
  visible: true,
  order: entry.order,
});

/**
 * What the app's "Meet our people" page shows: visible categories in order,
 * each with its visible entries in order; empty categories are left out.
 * @returns {Promise<{ categories: object[], entries: object[] }>}
 */
export async function loadAppShowcase() {
  await ensureBuiltInCategories();
  const categories = await ShowcaseCategory.find({ visible: true }).sort(PLACE_SORT).lean();
  const entries = await ShowcaseEntry.find({ categoryId: { $in: categories.map((category) => category._id) }, visible: true })
    .sort(PLACE_SORT)
    .lean();
  const filled = new Set(entries.map((entry) => String(entry.categoryId)));
  // Entries grouped in the categories' order, each group in its own order.
  const position = new Map(categories.map((category, index) => [String(category._id), index]));
  const grouped = [...entries].sort((a, b) => position.get(String(a.categoryId)) - position.get(String(b.categoryId)));
  return {
    categories: categories.filter((category) => filled.has(String(category._id))).map(toCategoryObject),
    entries: grouped.map(toAppEntryObject),
  };
}
