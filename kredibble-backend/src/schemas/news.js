import { z } from 'zod';

export const newsAdminQuerySchema = z.object({
  query: z.object({
    source: z.enum(['insight_ghana', 'african_journal']).optional(),
    hidden: z.enum(['true', 'false']).optional(),
    q: z.string().trim().max(120).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
  params: z.any(),
  body: z.any(),
});

export const newsModerateSchema = z.object({
  body: z.object({
    hidden: z.boolean(),
  }).strict(),
  query: z.any(),
  params: z.any(),
});
