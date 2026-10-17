import { z } from 'zod';
import { TEMPLATE_HEADERS } from '../lib/ambassador-io.js';
import { AMBASSADOR_STATUSES } from './admin.js';

// BE-029: ambassador CSV import/export. The file itself is re-validated row
// by row in lib/ambassador-io.js; these schemas cover the wizard's choices and
// the export request.

export const IMPORT_CHOICES = ['skip', 'update'];
export const IMPORT_STATUSES = ['active', 'pending'];
export const EXPORT_SCOPES = ['all', 'filtered', 'selected'];
/** The tiers the Network page filters on (stored legacy labels map onto these). */
export const EXPORT_TIERS = ['ambassador', 'senior', 'lead'];
/** Most rows "Export selected" may name in one request. */
export const MAX_SELECTED_IDS = 5000;

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ambassador id');

// Multipart text fields arrive as strings; absent fields default.
export const ambassadorImportSchema = z.object({
  body: z.object({
    choice: z.enum(IMPORT_CHOICES).default('skip'),
    status: z.enum(IMPORT_STATUSES).default('active'),
  }).strict(),
});

export const ambassadorExportSchema = z.object({
  body: z.object({
    scope: z.enum(EXPORT_SCOPES),
    columns: z.array(z.enum(TEMPLATE_HEADERS)).min(1).max(TEMPLATE_HEADERS.length).optional(),
    // Contact columns (email, phone, WhatsApp) leave only with this set to true.
    includeSensitive: z.boolean().default(false),
    ids: z.array(objectId).min(1).max(MAX_SELECTED_IDS).optional(),
    filters: z.object({
      status: z.enum(AMBASSADOR_STATUSES).optional(),
      tier: z.enum(EXPORT_TIERS).optional(),
      country: z.string().trim().min(1).max(100).optional(),
      search: z.string().trim().min(1).max(100).optional(),
    }).strict().optional(),
  }).strict()
    .refine((body) => body.scope !== 'selected' || Boolean(body.ids), {
      message: 'ids are required when scope is "selected"',
      path: ['ids'],
    })
    .refine((body) => body.scope === 'selected' || !body.ids, {
      message: 'ids are only allowed when scope is "selected"',
      path: ['ids'],
    })
    .refine((body) => body.scope === 'filtered' || !body.filters, {
      message: 'filters are only allowed when scope is "filtered"',
      path: ['filters'],
    }),
});
