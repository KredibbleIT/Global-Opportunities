import { z } from 'zod';

// The Expert listing: what a seeker sends to apply or to change what their public profile shows.
const website = z.string().trim().max(200).optional()
  .refine((value) => !value || /^(https?:\/\/)?[^\s/$.?#][^\s]*\.[^\s]{2,}$/i.test(value), 'Enter a website address, for example example.com');

const contactChoices = {
  showEmail: z.boolean().optional(),
  showPhone: z.boolean().optional(),
  showWebsite: z.boolean().optional(),
  website,
};

export const expertApplySchema = z.object({
  body: z.object(contactChoices).strict(),
  query: z.any(),
  params: z.any(),
});

export const expertPreferencesSchema = z.object({
  body: z.object(contactChoices).strict().refine((data) => Object.keys(data).length > 0, { message: 'At least one field to update must be provided' }),
  query: z.any(),
  params: z.any(),
});

export const expertRatingSchema = z.object({
  body: z.object({ stars: z.number().int().min(1, 'Choose 1 to 5 stars').max(5, 'Choose 1 to 5 stars') }).strict(),
  query: z.any(),
  params: z.any(),
});

// An admin's decision on an expert application. A reason is required to turn one down, so the seeker can fix it.
export const expertApproveSchema = z.object({
  body: z.object({ note: z.string().trim().max(500).optional() }).strict(),
  query: z.any(),
  params: z.any(),
});

export const expertRejectSchema = z.object({
  body: z.object({ note: z.string().trim().min(3, 'Give a short reason so the person knows what to change').max(500) }).strict(),
  query: z.any(),
  params: z.any(),
});
