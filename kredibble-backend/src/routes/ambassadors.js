import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { requireAdminAuth } from '../middleware/auth.js';
import { requireStaffRoles } from '../middleware/portal-auth.js';
import { validate } from '../middleware/validate.js';
import { ApiError, asyncHandler, itemResponse } from '../utils/http.js';
import { Ambassador, generateReferralCode } from '../models/AdminPortal.js';
import { auditReq, AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES, AuditLog } from '../lib/audit.js';
import { ambassadorIoLimiter } from '../lib/rate-limiters.js';
import { acquireLock, releaseLock } from '../lib/job-lock.js';
import {
  MAX_FILE_BYTES,
  analyseImport,
  buildExportCsv,
  mapHeaders,
  parseCsv,
  planImport,
  readRows,
  resolveExportColumns,
} from '../lib/ambassador-io.js';
import { pictureJobFor, schedulePictureCopies } from '../lib/ambassador-pictures.js';
import { ambassadorExportSchema, ambassadorImportSchema } from '../schemas/ambassadors.js';

/**
 * BE-029: ambassador CSV import and export for the Network page.
 *
 * Both actions belong to Super Admin and Desk Lead only (the admin's
 * `ambassadors.import` / `ambassadors.export` grants). The roles are read from
 * the verified session; the uploaded file is parsed and validated again here
 * with the same rules the admin previewed with (lib/ambassador-io.js), so the
 * preview is never trusted.
 */
export const ambassadorsRouter = Router();

const requireImportExportRole = requireStaffRoles(
  ['super_admin', 'desk_lead'],
  'Only Super Admin and Desk Lead can import or export ambassadors',
);

const IMPORT_LOCK = 'ambassador-import';
const IMPORT_LOCK_MS = 5 * 60 * 1000;
const CSV_MIME_TYPES = new Set(['text/csv', 'application/csv', 'application/vnd.ms-excel']);
const FILE_NAME_MAX = 120;
const DUPLICATE_KEY = 11000;
const MAX_CODE_ROUNDS = 3;

const IMPORT_STATUS_TO_STORED = { active: 'active', pending: 'applicant' };
/** The Network page filters on three tiers; older records may carry a long label. */
const TIER_LABELS = {
  ambassador: ['ambassador', 'Ambassador'],
  senior: ['senior', 'Senior Ambassador'],
  lead: ['lead', 'Campus Lead', 'Regional Lead'],
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const receiveCsv = (req, res, next) => {
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 4, fieldSize: 64 },
  }).single('file')(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') return next(new ApiError(413, 'The file is larger than 5 MB'));
    return next(new ApiError(400, 'Send one CSV file in the "file" field, with only the choice and status fields'));
  });
};

/** The upload as text, or a 400 that says what is wrong with the file. */
const readCsvUpload = (file) => {
  if (!file) throw new ApiError(400, 'Attach the CSV file in the "file" field');
  const isCsvName = path.extname(file.originalname || '').toLowerCase() === '.csv';
  if (!isCsvName && !CSV_MIME_TYPES.has(file.mimetype)) throw new ApiError(400, 'Only .csv files can be imported');
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer);
  } catch {
    throw new ApiError(400, 'The file is not UTF-8 text. Save it from Excel or Sheets as "CSV UTF-8"');
  }
  if (text.includes('\u0000')) throw new ApiError(400, 'The file is not a CSV text file');
  return text;
};

/** `count` new GOD-XXXXXX codes, none of them already stored. */
const allocateReferralCodes = async (count) => {
  const codes = new Set();
  while (codes.size < count) {
    const batch = new Set();
    while (batch.size < count - codes.size) {
      const code = generateReferralCode();
      if (!codes.has(code)) batch.add(code);
    }
    const taken = await Ambassador.find({ referralCode: { $in: [...batch] } }).select('referralCode').lean();
    const takenCodes = new Set(taken.map((doc) => doc.referralCode));
    for (const code of batch) if (!takenCodes.has(code)) codes.add(code);
  }
  return [...codes];
};

const writeErrorCode = (writeError) => writeError?.err?.code ?? writeError?.code;
const writeErrorKey = (writeError) => writeError?.err?.keyPattern ?? writeError?.keyPattern ?? {};

/**
 * Inserts the new ambassadors. A referral code that another request took in
 * the moment between allocation and insert is the only expected clash: those
 * rows get a fresh code and are tried again. Anything else is reported per row.
 */
const insertNewAmbassadors = async (entries) => {
  const failedRows = [];
  let pending = entries;
  for (let round = 0; round < MAX_CODE_ROUNDS && pending.length > 0; round++) {
    const codes = await allocateReferralCodes(pending.length);
    pending.forEach((entry, index) => { entry.doc.referralCode = codes[index]; });
    try {
      await Ambassador.insertMany(pending.map((entry) => entry.doc), { ordered: false });
      pending = [];
    } catch (error) {
      if (!Array.isArray(error.writeErrors)) throw error;
      const retry = [];
      for (const writeError of error.writeErrors) {
        const entry = pending[writeError.index];
        if (writeErrorCode(writeError) === DUPLICATE_KEY && writeErrorKey(writeError).referralCode) retry.push(entry);
        else failedRows.push({ row: entry.row.rowNumber, email: entry.row.record.email, reason: 'Could not be saved; import this row again' });
      }
      pending = retry;
    }
  }
  for (const entry of pending) {
    failedRows.push({ row: entry.row.rowNumber, email: entry.row.record.email, reason: 'Could not get a unique referral code; import this row again' });
  }
  return failedRows;
};

/** The stored fields of a new ambassador from one import row. */
const newAmbassadorDoc = (record, storedStatus, createdBy, today) => {
  const doc = {
    fullName: record.fullName,
    email: record.email,
    tier: 'ambassador',
    status: storedStatus,
    memberType: 'student',
    trained: false,
    joinedAt: record.submittedAt ? record.submittedAt.slice(0, 10) : today,
    createdBy,
  };
  const optional = {
    phone: record.phone,
    whatsapp: record.whatsapp,
    country: record.country,
    region: record.region,
    city: record.city,
    profilePhoto: record.pictureUrl,
    pictureSourceUrl: record.pictureSourceUrl,
    description: record.bio,
  };
  for (const [key, value] of Object.entries(optional)) if (value) doc[key] = value;
  if (record.submittedAt) doc.submittedAt = new Date(record.submittedAt);
  if (!record.pictureUrl) {
    const job = pictureJobFor(record.pictureSourceUrl);
    if (job) doc.pictureImport = job;
  }
  return doc;
};

/**
 * The $set for an existing ambassador: only what the file actually has. The
 * id, referral code, tier, status, training and joining date are never
 * touched, so a file can never change someone's status.
 */
const updateFor = (record, existing) => {
  const set = {};
  const fields = {
    fullName: record.fullName,
    phone: record.phone,
    whatsapp: record.whatsapp,
    country: record.country,
    region: record.region,
    city: record.city,
    profilePhoto: record.pictureUrl,
    pictureSourceUrl: record.pictureSourceUrl,
    description: record.bio,
  };
  for (const [key, value] of Object.entries(fields)) if (value) set[key] = value;
  if (record.submittedAt) set.submittedAt = new Date(record.submittedAt);
  // A new Drive link (and no direct picture) queues a fresh copy.
  const newSource = record.pictureSourceUrl && record.pictureSourceUrl !== existing.pictureSourceUrl;
  const job = !record.pictureUrl && newSource ? pictureJobFor(record.pictureSourceUrl) : undefined;
  if (job) set.pictureImport = job;
  return { set, queuesPicture: Boolean(job) };
};

const importHandler = asyncHandler(async (req, res) => {
  const text = readCsvUpload(req.file);
  const lines = parseCsv(text);
  if (lines.length === 0) throw new ApiError(400, 'The file is empty');
  const mapping = mapHeaders(lines[0]);
  if (mapping.missing.length > 0) {
    throw new ApiError(400, `The file has no ${mapping.missing.join(' or ')} column. Use the template headers`);
  }
  if (lines.length < 2) throw new ApiError(400, 'The file has no rows below the header');
  const rows = readRows(lines.slice(1), mapping);

  const { choice, status } = req.body;
  const storedStatus = IMPORT_STATUS_TO_STORED[status];
  const fileName = path.basename(req.file.originalname || 'ambassadors.csv').slice(0, FILE_NAME_MAX);

  // One import at a time, platform-wide: two at once (a double-click, or two
  // admins with overlapping files) could each see an email as new and create
  // the same person twice, because email is matched here, not by an index.
  const lease = await acquireLock(IMPORT_LOCK, IMPORT_LOCK_MS);
  if (!lease) throw new ApiError(409, 'Another ambassador import is running. Try again in a minute');

  let preview;
  let plan;
  let saveFailures;
  const pictureIds = [];
  try {
    const emailKeys = [...new Set(rows.map((row) => row.emailKey).filter(Boolean))];
    const existing = await Ambassador.find({ email: { $in: emailKeys } })
      .select('_id email pictureSourceUrl')
      .sort({ createdAt: 1 })
      .lean();
    const byEmail = new Map();
    for (const ambassador of existing) if (!byEmail.has(ambassador.email)) byEmail.set(ambassador.email, ambassador);

    preview = analyseImport(rows, new Set(byEmail.keys()));
    plan = planImport(preview, choice);

    if (plan.updates.length > 0) {
      const operations = plan.updates.map((row) => {
        const current = byEmail.get(row.emailKey);
        const { set, queuesPicture } = updateFor(row.record, current);
        if (queuesPicture) pictureIds.push(current._id);
        return { updateOne: { filter: { _id: current._id }, update: { $set: set } } };
      });
      await Ambassador.bulkWrite(operations, { ordered: false });
    }

    const today = new Date().toISOString().slice(0, 10);
    const entries = plan.creates.map((row) => ({
      row,
      doc: new Ambassador(newAmbassadorDoc(row.record, storedStatus, req.auth.sub, today)),
    }));
    const invalid = [];
    const valid = [];
    const checks = await Promise.allSettled(entries.map((entry) => entry.doc.validate()));
    checks.forEach((check, index) => {
      const entry = entries[index];
      if (check.status === 'fulfilled') {
        valid.push(entry);
        return;
      }
      const messages = Object.values(check.reason?.errors ?? {}).map((error) => error.message);
      invalid.push({ row: entry.row.rowNumber, email: entry.row.record.email, reason: messages.join('; ') || 'Could not be saved' });
    });
    saveFailures = [...invalid, ...(await insertNewAmbassadors(valid))];
    const failedLines = new Set(saveFailures.map((failure) => failure.row));
    for (const entry of valid) {
      if (!failedLines.has(entry.row.rowNumber) && entry.doc.pictureImport?.status === 'pending') pictureIds.push(entry.doc._id);
    }
  } catch (error) {
    // Some rows may already be saved; the trail must say this import ran.
    await auditReq(req, {
      action: AUDIT_ACTIONS.AMBASSADORS_IMPORT,
      resourceType: AUDIT_RESOURCE_TYPES.AMBASSADOR,
      outcome: 'failure',
      metadata: { file: fileName, rows: rows.length, choice, status, reason: 'The import stopped before it finished' },
    });
    throw error;
  } finally {
    await releaseLock(lease);
  }

  const created = plan.creates.length - saveFailures.length;
  const errors = [...plan.errorRows, ...saveFailures].sort((a, b) => a.row - b.row);
  const result = {
    choice,
    status,
    created,
    updated: plan.updates.length,
    skipped: plan.skipped,
    failed: errors.length,
    merged: preview.counts.merged,
    picturesQueued: pictureIds.length,
  };

  await auditReq(req, {
    action: AUDIT_ACTIONS.AMBASSADORS_IMPORT,
    resourceType: AUDIT_RESOURCE_TYPES.AMBASSADOR,
    outcome: 'success',
    metadata: { file: fileName, rows: rows.length, ...result },
  });

  schedulePictureCopies(pictureIds.map(String));
  itemResponse(res, { ...result, counts: preview.counts, errors, ignoredColumns: mapping.ignored });
});

/** The Mongo filter for an export scope. */
const exportFilter = ({ scope, ids, filters }) => {
  if (scope === 'selected') return { _id: { $in: ids } };
  if (scope === 'all' || !filters) return {};
  const filter = {};
  if (filters.status) filter.status = filters.status;
  if (filters.tier) filter.tier = { $in: TIER_LABELS[filters.tier] };
  if (filters.country) filter.country = filters.country;
  if (filters.search) {
    const pattern = { $regex: escapeRegex(filters.search), $options: 'i' };
    filter.$or = [{ fullName: pattern }, { campus: pattern }];
  }
  return filter;
};

const exportHandler = asyncHandler(async (req, res) => {
  const { scope, includeSensitive, ids, filters } = req.body;
  const columns = resolveExportColumns(req.body.columns, includeSensitive);
  const ambassadors = await Ambassador.find(exportFilter(req.body))
    .select('fullName email phone whatsapp country region city profilePhoto pictureSourceUrl description submittedAt joinedAt status')
    .sort({ createdAt: -1 })
    .lean();

  // Written before the file leaves, so no export goes unrecorded.
  await auditReq(req, {
    action: AUDIT_ACTIONS.AMBASSADORS_EXPORT,
    resourceType: AUDIT_RESOURCE_TYPES.AMBASSADOR,
    outcome: 'success',
    metadata: {
      scope,
      rows: ambassadors.length,
      columns,
      includeSensitive: columns.some((column) => ['email', 'phone', 'whatsapp'].includes(column)),
      ...(ids ? { selected: ids.length } : {}),
      ...(filters ? { filters } : {}),
    },
  });

  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="ambassadors-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.set('Cache-Control', 'no-store');
  res.send(buildExportCsv(ambassadors, columns));
});

const HISTORY_LIMIT = 100;

/**
 * The Network page's History dialog: the latest imports and exports, newest
 * first, with who ran them. Metadata is what the audit rows already hold
 * (counts, scope, columns, filters), so no personal data is added here.
 */
const historyHandler = asyncHandler(async (req, res) => {
  const rows = await AuditLog.find({ action: { $in: [AUDIT_ACTIONS.AMBASSADORS_IMPORT, AUDIT_ACTIONS.AMBASSADORS_EXPORT] } })
    .sort({ createdAt: -1 })
    .limit(HISTORY_LIMIT)
    .populate('actorId', 'name')
    .lean();
  itemResponse(res, rows.map((row) => ({
    id: String(row._id),
    at: row.createdAt,
    action: row.action,
    outcome: row.outcome,
    actorName: row.actorId?.name ?? null,
    metadata: row.metadata ?? {},
  })));
});

// Order: who you are, what you may do, how often, then the body. The limiter
// keys on the verified admin, so it must run after authentication.
ambassadorsRouter.post(
  '/import',
  requireAdminAuth,
  requireImportExportRole,
  ambassadorIoLimiter,
  receiveCsv,
  validate(ambassadorImportSchema),
  importHandler,
);

ambassadorsRouter.post(
  '/export',
  requireAdminAuth,
  requireImportExportRole,
  ambassadorIoLimiter,
  validate(ambassadorExportSchema),
  exportHandler,
);

ambassadorsRouter.get('/history', requireAdminAuth, requireImportExportRole, historyHandler);
