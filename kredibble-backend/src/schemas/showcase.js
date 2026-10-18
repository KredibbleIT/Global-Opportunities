import { z } from 'zod';
import { SHOWCASE_KINDS, SHOWCASE_LIMITS } from '../models/AdminPortal.js';
import { normaliseText } from '../lib/showcase.js';
import { isAcceptablePicture } from '../lib/showcase-photos.js';

// BE-030: the Showcase admin routes. Names and titles are trimmed with runs of
// spaces collapsed before the limits apply, and the messages match the admin
// form's (kredibble-admin/src/lib/showcase.ts).

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
// A ceiling before normalising, so a huge string is refused without work.
const RAW_MAX = 4000;

const requiredText = (max, requiredMessage, tooLongMessage) =>
  z.string().max(RAW_MAX).transform(normaliseText).pipe(z.string().min(1, requiredMessage).max(max, tooLongMessage));

const optionalText = (max, tooLongMessage) =>
  z.string().max(RAW_MAX).transform(normaliseText).pipe(z.string().max(max, tooLongMessage));

const entryName = requiredText(SHOWCASE_LIMITS.name, 'Enter the name.', `Keep the name to ${SHOWCASE_LIMITS.name} characters or fewer.`);
const entryTitle = requiredText(SHOWCASE_LIMITS.title, 'Enter the role or what they do.', `Keep this to ${SHOWCASE_LIMITS.title} characters or fewer.`);
// The bio keeps its line breaks; only the ends are trimmed.
const entryBio = z.string().max(RAW_MAX).transform((value) => value.trim())
  .pipe(z.string().max(SHOWCASE_LIMITS.bio, `The bio is too long. The limit is ${SHOWCASE_LIMITS.bio} characters.`));
const entryCountry = optionalText(SHOWCASE_LIMITS.country, `Keep the country to ${SHOWCASE_LIMITS.country} characters or fewer.`);
const entryProvidedBy = optionalText(SHOWCASE_LIMITS.providedBy, `Keep this to ${SHOWCASE_LIMITS.providedBy} characters or fewer.`);
// The site's Content-Security-Policy allows https images only, so a stored
// picture is an https link; BE-031: and only one of OUR Cloudinary pictures (a
// Showcase upload or an ambassador's stored picture). `null` removes it.
const entryPhotoUrl = z.string().trim().max(SHOWCASE_LIMITS.photoUrl)
  .regex(/^https:\/\/[^\s"'<>]+$/i, 'The picture must be an https link.')
  .refine(isAcceptablePicture, 'Upload the picture with the Showcase form; links to other sites are not accepted.')
  .nullable();

const categoryName = requiredText(
  SHOWCASE_LIMITS.categoryName,
  'Enter a name for the category.',
  `Keep the name to ${SHOWCASE_LIMITS.categoryName} characters or fewer.`,
);
const categoryKind = z.enum(SHOWCASE_KINDS, { message: 'Choose people or organisations.' });
const direction = z.enum(['up', 'down'], { message: 'Choose up or down.' });
const idParams = z.object({ id: objectId });

const atLeastOneField = (body) => Object.keys(body).length > 0;

export const createShowcaseEntrySchema = z.object({
  body: z.object({
    categoryId: objectId,
    name: entryName,
    title: entryTitle,
    bio: entryBio.default(''),
    country: entryCountry.default(''),
    providedBy: entryProvidedBy.default(''),
    photoUrl: entryPhotoUrl.optional(),
    visible: z.boolean().default(true),
    linkedAmbassadorId: objectId.nullable().optional(),
    linkedPartnerId: objectId.nullable().optional(),
  }).strict(),
});

export const updateShowcaseEntrySchema = z.object({
  params: idParams,
  body: z.object({
    categoryId: objectId.optional(),
    name: entryName.optional(),
    title: entryTitle.optional(),
    bio: entryBio.optional(),
    country: entryCountry.optional(),
    providedBy: entryProvidedBy.optional(),
    photoUrl: entryPhotoUrl.optional(),
    visible: z.boolean().optional(),
  }).strict().refine(atLeastOneField, 'Nothing to change'),
});

export const showcaseVisibilitySchema = z.object({
  params: idParams,
  body: z.object({ visible: z.boolean() }).strict(),
});

export const showcaseMoveSchema = z.object({
  params: idParams,
  body: z.object({ direction }).strict(),
});

export const showcaseIdSchema = z.object({ params: idParams });

export const createShowcaseCategorySchema = z.object({
  body: z.object({ name: categoryName, kind: categoryKind }).strict(),
});

export const updateShowcaseCategorySchema = z.object({
  params: idParams,
  body: z.object({
    name: categoryName.optional(),
    kind: categoryKind.optional(),
    visible: z.boolean().optional(),
  }).strict().refine(atLeastOneField, 'Nothing to change'),
});
