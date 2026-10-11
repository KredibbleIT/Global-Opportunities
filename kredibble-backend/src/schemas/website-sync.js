import { z } from 'zod';

export const websiteWebhookSchema = z.object({
  body: z.object({
    eventId: z.string().trim().min(1).max(120),
    resource: z.enum(['opportunity', 'ambassador']),
    externalId: z.string().trim().min(1).max(120),
    attributes: z.record(z.string(), z.any()).optional().default({}),
  }).strict(),
  query: z.any(),
  params: z.any(),
});

export const syncEventQuerySchema = z.object({
  query: z.object({
    status: z.enum(['received', 'applied', 'failed']).optional(),
    resource: z.enum(['opportunity', 'ambassador']).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
  params: z.any(),
  body: z.any(),
});

export const syncEventRetrySchema = z.object({
  body: z.object({}).strict(),
  query: z.any(),
  // The sync event id (an opaque sender string like "evt-123"), not a Mongo id.
  params: z.object({ id: z.string().trim().min(1).max(120) }),
});
