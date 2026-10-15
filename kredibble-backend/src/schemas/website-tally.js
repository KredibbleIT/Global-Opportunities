import { z } from 'zod';
import { opportunityTypes } from '../models/Platform.js';

export const taxonomyUpsertSchema = z.object({
  body: z.object({
    websiteCategory: z.string().trim().min(1).max(120),
    // Null clears the mapping back to "awaiting curation".
    appCategory: z.enum(opportunityTypes).nullable().optional(),
    note: z.string().trim().max(500).optional(),
  }).strict(),
  query: z.any(),
  params: z.any(),
});
