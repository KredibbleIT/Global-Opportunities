import { Router } from 'express';
import { requireAdminAuth, requireAuth } from '../middleware/auth.js';
import { resolveStaffRoles } from '../middleware/portal-auth.js';
import { validate } from '../middleware/validate.js';
import { ApiError, asyncHandler, itemResponse, notFound } from '../utils/http.js';
import { Ambassador, Partner, ShowcaseCategory, ShowcaseEntry } from '../models/AdminPortal.js';
import { auditReq, AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES, AuditLog } from '../lib/audit.js';
import { getEffectiveToggles } from '../lib/permissions.js';
import {
  canEditCategory,
  ensureBuiltInCategories,
  loadAppShowcase,
  moveWithinGroup,
  nameKeyOf,
  nextPlace,
  renumberGroup,
  showcaseAccessFor,
  toAdminEntryObject,
  toCategoryObject,
} from '../lib/showcase.js';
import {
  createShowcaseCategorySchema,
  createShowcaseEntrySchema,
  showcaseIdSchema,
  showcaseMoveSchema,
  showcaseVisibilitySchema,
  updateShowcaseCategorySchema,
  updateShowcaseEntrySchema,
} from '../schemas/showcase.js';

/**
 * BE-030: the Showcase ("Meet our people").
 *
 * - showcaseAdminRouter, mounted at /admin/showcase: every category and entry,
 *   hidden ones included, and every change. Who may change what is worked out
 *   from the caller's roles in the verified session (resolveStaffRoles), per
 *   category: the category of the entry AND, on a move, the category it goes to.
 *   Categories themselves need `showcase.manage`. Every change writes an audit
 *   row, which the History dialog reads back from GET /history.
 * - showcaseAppRouter, mounted at /showcase: what the app shows any signed-in
 *   user, with the staff-only `providedBy` left out.
 */
export const showcaseAdminRouter = Router();
export const showcaseAppRouter = Router();

const NO_ACCESS = 'Your role has no access to the Showcase.';
const CANNOT_EDIT = 'Your role cannot change this part of the showcase.';
const CANNOT_MANAGE = 'Only Super Admin and Desk Lead can change the showcase categories.';
const DUPLICATE_KEY = 11000;
const HISTORY_LIMIT = 100;
const SORT_BY_PLACE = { order: 1, createdAt: 1, _id: 1 };
const EDITABLE_TEXT_FIELDS = ['name', 'title', 'bio', 'country', 'providedBy'];
const SHOWCASE_AUDIT_ACTIONS = Object.entries(AUDIT_ACTIONS)
  .filter(([name]) => name.startsWith('SHOWCASE_'))
  .map(([, action]) => action);

const visibleWord = (visible) => (visible ? 'Visible' : 'Hidden');

/** Reads the caller's Showcase access once per request; no access at all is a 403. */
const loadShowcaseAccess = async (req, res, next) => {
  try {
    const { roles } = await resolveStaffRoles(req);
    const access = showcaseAccessFor(roles, await getEffectiveToggles());
    if (!access.view) return next(new ApiError(403, NO_ACCESS));
    req.showcaseAccess = access;
    return next();
  } catch (error) {
    return next(error);
  }
};

const requireManage = (req, res, next) => (req.showcaseAccess.manage ? next() : next(new ApiError(403, CANNOT_MANAGE)));

/** @throws {ApiError} 403 when the caller may not change entries in this category */
const assertCanEdit = (req, category) => {
  if (!canEditCategory(req.showcaseAccess, category)) throw new ApiError(403, CANNOT_EDIT);
};

/** The category an entry is being put into: a missing one is the form's "Choose a category." */
const targetCategory = async (id) => {
  const category = await ShowcaseCategory.findById(id);
  if (!category) throw new ApiError(400, 'Choose a category.');
  return category;
};

/** An entry and the category it is in, or 404. */
const findEntryWithCategory = async (id) => {
  const entry = await ShowcaseEntry.findById(id);
  if (!entry) throw notFound('Showcase entry');
  const category = await ShowcaseCategory.findById(entry.categoryId);
  if (!category) throw notFound('Showcase category');
  return { entry, category };
};

const findCategory = async (id) => {
  const category = await ShowcaseCategory.findById(id);
  if (!category) throw notFound('Showcase category');
  return category;
};

/** A linked record must exist; featuring it twice is refused by the unique index (see alreadyFeatured). */
const assertLinksExist = async ({ linkedAmbassadorId, linkedPartnerId }) => {
  if (linkedAmbassadorId && !(await Ambassador.exists({ _id: linkedAmbassadorId }))) {
    throw new ApiError(400, 'That ambassador no longer exists.');
  }
  if (linkedPartnerId && !(await Partner.exists({ _id: linkedPartnerId }))) {
    throw new ApiError(400, 'That partner no longer exists.');
  }
};

const alreadyFeatured = (error) =>
  (error?.code === DUPLICATE_KEY ? new ApiError(409, 'This ambassador or partner is already featured.') : error);

const photoChange = (before, after) => {
  if (!before && after) return 'added';
  if (before && !after) return 'removed';
  return before !== after ? 'changed' : null;
};

const auditEntry = (req, action, entryId, metadata) =>
  auditReq(req, { action, resourceType: AUDIT_RESOURCE_TYPES.SHOWCASE_ENTRY, resourceId: entryId, outcome: 'success', metadata });

const auditCategory = (req, action, categoryId, metadata) =>
  auditReq(req, { action, resourceType: AUDIT_RESOURCE_TYPES.SHOWCASE_CATEGORY, resourceId: categoryId, outcome: 'success', metadata });

showcaseAdminRouter.use(requireAdminAuth, loadShowcaseAccess);

// ---- Read ---------------------------------------------------------------------------------------

showcaseAdminRouter.get('/', asyncHandler(async (req, res) => {
  await ensureBuiltInCategories();
  const [categories, entries] = await Promise.all([
    ShowcaseCategory.find().sort(SORT_BY_PLACE).lean(),
    ShowcaseEntry.find().sort(SORT_BY_PLACE).lean(),
  ]);
  res.set('Cache-Control', 'no-store');
  itemResponse(res, { categories: categories.map(toCategoryObject), entries: entries.map(toAdminEntryObject) });
}));

/** The History dialog: the latest Showcase changes, newest first, with who made them. */
showcaseAdminRouter.get('/history', asyncHandler(async (req, res) => {
  const rows = await AuditLog.find({ action: { $in: SHOWCASE_AUDIT_ACTIONS } })
    .sort({ createdAt: -1 })
    .limit(HISTORY_LIMIT)
    .populate('actorId', 'name')
    .lean();
  res.set('Cache-Control', 'no-store');
  itemResponse(res, rows.map((row) => ({
    id: String(row._id),
    at: row.createdAt,
    action: row.action,
    outcome: row.outcome,
    actorName: row.actorId?.name ?? null,
    metadata: row.metadata ?? {},
  })));
}));

// ---- Entries ------------------------------------------------------------------------------------

showcaseAdminRouter.post('/entries', validate(createShowcaseEntrySchema), asyncHandler(async (req, res) => {
  const body = req.body;
  const category = await targetCategory(body.categoryId);
  assertCanEdit(req, category);
  await assertLinksExist(body);

  let entry;
  try {
    entry = await ShowcaseEntry.create({
      categoryId: category._id,
      name: body.name,
      title: body.title,
      bio: body.bio,
      country: body.country,
      providedBy: body.providedBy,
      photoUrl: body.photoUrl ?? null,
      visible: body.visible,
      order: await nextPlace(ShowcaseEntry, { categoryId: category._id }),
      linkedAmbassadorId: body.linkedAmbassadorId ?? null,
      linkedPartnerId: body.linkedPartnerId ?? null,
      createdBy: req.auth.sub,
      updatedBy: req.auth.sub,
    });
  } catch (error) {
    throw alreadyFeatured(error);
  }

  await auditEntry(req, AUDIT_ACTIONS.SHOWCASE_ADD, entry._id, {
    summary: `Added ${entry.name} to ${category.name} (${entry.visible ? 'visible' : 'hidden'})`,
    entry: entry.name,
    category: category.name,
    visible: entry.visible,
    hasPhoto: Boolean(entry.photoUrl),
    providedBy: entry.providedBy || '—',
  });
  res.status(201).json({ data: toAdminEntryObject(entry.toObject()) });
}));

/** Edits an entry. A new category must be one the caller may edit too; the entry goes last there. */
showcaseAdminRouter.patch('/entries/:id', validate(updateShowcaseEntrySchema), asyncHandler(async (req, res) => {
  const body = req.body;
  const { entry, category: from } = await findEntryWithCategory(req.params.id);
  assertCanEdit(req, from);
  let to = from;
  if (body.categoryId && body.categoryId !== String(entry.categoryId)) {
    to = await targetCategory(body.categoryId);
    assertCanEdit(req, to);
  }

  const before = entry.toObject();
  for (const field of EDITABLE_TEXT_FIELDS) {
    if (body[field] !== undefined) entry[field] = body[field];
  }
  if (body.visible !== undefined) entry.visible = body.visible;
  if (body.photoUrl !== undefined) entry.photoUrl = body.photoUrl;
  const moved = to !== from;
  if (moved) {
    entry.categoryId = to._id;
    entry.order = await nextPlace(ShowcaseEntry, { categoryId: to._id });
  }

  const changed = EDITABLE_TEXT_FIELDS.filter((field) => (before[field] ?? '') !== (entry[field] ?? ''));
  const photo = photoChange(before.photoUrl, entry.photoUrl);
  const visibilityChanged = before.visible !== entry.visible;
  if (changed.length === 0 && !photo && !visibilityChanged && !moved) {
    return itemResponse(res, toAdminEntryObject(before));
  }

  entry.updatedBy = req.auth.sub;
  await entry.save();
  if (moved) await renumberGroup(ShowcaseEntry, { categoryId: from._id });

  await auditEntry(req, AUDIT_ACTIONS.SHOWCASE_EDIT, entry._id, {
    summary: `Edited ${entry.name}`,
    entry: entry.name,
    category: to.name,
    ...(changed.length > 0 ? { changed } : {}),
    ...(visibilityChanged ? { visible: `${visibleWord(before.visible)} to ${visibleWord(entry.visible)}` } : {}),
    ...(photo ? { photo } : {}),
    ...(moved ? { movedCategory: `${from.name} to ${to.name}` } : {}),
  });
  return itemResponse(res, toAdminEntryObject(entry.toObject()));
}));

/** Shows or hides an entry. Publishing is direct: Visible is on the app at once. */
showcaseAdminRouter.post('/entries/:id/visibility', validate(showcaseVisibilitySchema), asyncHandler(async (req, res) => {
  const { entry, category } = await findEntryWithCategory(req.params.id);
  assertCanEdit(req, category);
  const wasVisible = entry.visible;
  if (wasVisible !== req.body.visible) {
    entry.visible = req.body.visible;
    entry.updatedBy = req.auth.sub;
    await entry.save();
    await auditEntry(req, entry.visible ? AUDIT_ACTIONS.SHOWCASE_SHOW : AUDIT_ACTIONS.SHOWCASE_HIDE, entry._id, {
      summary: `${entry.visible ? 'Showed' : 'Hid'} ${entry.name}`,
      entry: entry.name,
      category: category.name,
      from: visibleWord(wasVisible),
      to: visibleWord(entry.visible),
    });
  }
  itemResponse(res, toAdminEntryObject(entry.toObject()));
}));

showcaseAdminRouter.post('/entries/:id/move', validate(showcaseMoveSchema), asyncHandler(async (req, res) => {
  const { entry, category } = await findEntryWithCategory(req.params.id);
  assertCanEdit(req, category);
  const { direction } = req.body;
  const place = await moveWithinGroup(ShowcaseEntry, { categoryId: entry.categoryId }, entry._id, direction);
  if (!place) throw new ApiError(409, direction === 'up' ? 'It is already first.' : 'It is already last.');
  await auditEntry(req, AUDIT_ACTIONS.SHOWCASE_MOVE, entry._id, {
    summary: `Moved ${entry.name} ${direction}`,
    entry: entry.name,
    category: category.name,
    place: `${place.from} to ${place.to}`,
  });
  itemResponse(res, place);
}));

showcaseAdminRouter.delete('/entries/:id', validate(showcaseIdSchema), asyncHandler(async (req, res) => {
  const { entry, category } = await findEntryWithCategory(req.params.id);
  assertCanEdit(req, category);
  await ShowcaseEntry.deleteOne({ _id: entry._id });
  await renumberGroup(ShowcaseEntry, { categoryId: entry.categoryId });
  await auditEntry(req, AUDIT_ACTIONS.SHOWCASE_DELETE, entry._id, {
    summary: `Deleted ${entry.name} from ${category.name}`,
    entry: entry.name,
    category: category.name,
    wasVisible: entry.visible,
  });
  res.status(204).end();
}));

// ---- Categories (showcase.manage) ---------------------------------------------------------------

const nameTaken = () => new ApiError(409, 'A category with this name already exists.');

showcaseAdminRouter.post('/categories', requireManage, validate(createShowcaseCategorySchema), asyncHandler(async (req, res) => {
  // Seed first, so a new custom category can never take a built-in's name.
  await ensureBuiltInCategories();
  const { name, kind } = req.body;
  const nameKey = nameKeyOf(name);
  if (await ShowcaseCategory.exists({ nameKey })) throw nameTaken();
  let category;
  try {
    category = await ShowcaseCategory.create({ key: 'custom', name, nameKey, kind, order: await nextPlace(ShowcaseCategory, {}), visible: true });
  } catch (error) {
    throw error?.code === DUPLICATE_KEY ? nameTaken() : error;
  }
  await auditCategory(req, AUDIT_ACTIONS.SHOWCASE_CATEGORY_ADD, category._id, {
    summary: `Added the category ${category.name}`,
    category: category.name,
    kind,
  });
  res.status(201).json({ data: toCategoryObject(category) });
}));

/** Renames a category, changes its kind (custom ones only) or shows and hides it with everything in it. */
showcaseAdminRouter.patch('/categories/:id', requireManage, validate(updateShowcaseCategorySchema), asyncHandler(async (req, res) => {
  const body = req.body;
  const category = await findCategory(req.params.id);
  const before = category.toObject();
  if (body.kind && body.kind !== category.kind && category.key !== 'custom') {
    throw new ApiError(400, 'The kind of a built-in category cannot change.');
  }
  if (body.name !== undefined) {
    const nameKey = nameKeyOf(body.name);
    if (nameKey !== category.nameKey && (await ShowcaseCategory.exists({ nameKey, _id: { $ne: category._id } }))) throw nameTaken();
    category.name = body.name;
    category.nameKey = nameKey;
  }
  if (body.kind) category.kind = body.kind;
  if (body.visible !== undefined) category.visible = body.visible;

  const renamed = before.name !== category.name;
  const kindChanged = before.kind !== category.kind;
  const visibilityChanged = before.visible !== category.visible;
  if (!renamed && !kindChanged && !visibilityChanged) return itemResponse(res, toCategoryObject(before));

  try {
    await category.save();
  } catch (error) {
    throw error?.code === DUPLICATE_KEY ? nameTaken() : error;
  }
  await auditCategory(req, AUDIT_ACTIONS.SHOWCASE_CATEGORY_EDIT, category._id, {
    summary: `Changed the category ${before.name}`,
    category: category.name,
    ...(renamed ? { renamed: `${before.name} to ${category.name}` } : {}),
    ...(kindChanged ? { kind: `${before.kind} to ${category.kind}` } : {}),
    ...(visibilityChanged ? { visible: `${visibleWord(before.visible)} to ${visibleWord(category.visible)}` } : {}),
  });
  return itemResponse(res, toCategoryObject(category));
}));

showcaseAdminRouter.post('/categories/:id/move', requireManage, validate(showcaseMoveSchema), asyncHandler(async (req, res) => {
  const category = await findCategory(req.params.id);
  const { direction } = req.body;
  const place = await moveWithinGroup(ShowcaseCategory, {}, category._id, direction);
  if (!place) throw new ApiError(409, direction === 'up' ? 'It is already first.' : 'It is already last.');
  await auditCategory(req, AUDIT_ACTIONS.SHOWCASE_CATEGORY_MOVE, category._id, {
    summary: `Moved the category ${category.name} ${direction}`,
    category: category.name,
    place: `${place.from} to ${place.to}`,
  });
  itemResponse(res, place);
}));

/** Only an empty custom category can go; the four built-in ones can be hidden, never deleted. */
showcaseAdminRouter.delete('/categories/:id', requireManage, validate(showcaseIdSchema), asyncHandler(async (req, res) => {
  const category = await findCategory(req.params.id);
  if (category.key !== 'custom') {
    throw new ApiError(409, 'The built-in categories cannot be deleted. Hide the category instead.');
  }
  const count = await ShowcaseEntry.countDocuments({ categoryId: category._id });
  if (count > 0) throw new ApiError(409, `Move or delete its ${count} ${count === 1 ? 'entry' : 'entries'} first.`);
  await ShowcaseCategory.deleteOne({ _id: category._id });
  await renumberGroup(ShowcaseCategory, {});
  await auditCategory(req, AUDIT_ACTIONS.SHOWCASE_CATEGORY_DELETE, category._id, {
    summary: `Deleted the category ${category.name}`,
    category: category.name,
  });
  res.status(204).end();
}));

// ---- App ----------------------------------------------------------------------------------------

showcaseAppRouter.get('/', requireAuth, asyncHandler(async (req, res) => {
  const showcase = await loadAppShowcase();
  // Cacheable, but revalidated every time (the ETag answers 304 while nothing
  // changed), so hiding an entry takes it off the app at once.
  res.set('Cache-Control', 'private, no-cache');
  itemResponse(res, showcase);
}));
