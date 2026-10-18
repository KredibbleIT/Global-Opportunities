import { deleteImage } from './cloudinary.js';
import logger from './logger.js';

/**
 * BE-031: Showcase pictures.
 *
 * - A picture is accepted only as one of OUR Cloudinary image URLs: uploaded
 *   through the admin upload route (purpose `showcase-photo`), or an
 *   ambassador's picture that the admin or the BE-029 picture job stored. A
 *   client-supplied URL from anywhere else is refused, and so is a URL with
 *   delivery transformations (the server adds those).
 * - The app gets a delivery URL shaped for the category: a square crop on the
 *   face for people, a padded square for organisation logos.
 * - A replaced or removed picture the Showcase uploaded is deleted, unless
 *   another entry still uses it. Borrowed ambassador pictures are never
 *   deleted. Deleting is best effort: a failure is logged, never thrown.
 */

const CLOUD_HOST = 'res.cloudinary.com';
// The upload helpers prefix `kredibble/` to the folder the route chose, so a
// real path may carry it twice.
const OWN_FOLDER = /^(?:kredibble\/)?kredibble\/admin\/showcase-photo\/[^/]+$/;
const BORROWED_FOLDERS = [
  /^(?:kredibble\/)?kredibble\/admin\/ambassador-photo\/[^/]+$/,
  /^(?:kredibble\/)?ambassadors\/[^/]+$/,
];
const VERSION = /^v\d+$/;

export const PICTURE_TRANSFORMS = Object.freeze({
  person: 'c_fill,g_face,w_400,h_400,f_auto,q_auto',
  organisation: 'c_pad,b_white,w_400,h_400,f_auto,q_auto',
});

/** The Cloudinary account pictures must come from; in tests, the mock uploads' `test` account (lib/cloudinary.js). */
const cloudName = () => (process.env.NODE_ENV === 'test' ? 'test' : process.env.CLOUDINARY_CLOUD_NAME || '');

/**
 * Reads one of our Cloudinary image URLs.
 * @param {string} url
 * @returns {{ publicId: string, ownUpload: boolean } | null} null for any other URL
 */
export function parseOwnPicture(url) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.host !== CLOUD_HOST || parsed.search || parsed.hash) return null;
  const [cloud, resourceType, deliveryType, ...rest] = parsed.pathname.split('/').filter(Boolean);
  if (!cloud || cloud !== cloudName() || resourceType !== 'image' || deliveryType !== 'upload') return null;
  const path = (VERSION.test(rest[0] ?? '') ? rest.slice(1) : rest).join('/');
  const ownUpload = OWN_FOLDER.test(path);
  if (!ownUpload && !BORROWED_FOLDERS.some((folder) => folder.test(path))) return null;
  return { publicId: path.replace(/\.[a-z0-9]+$/i, ''), ownUpload };
}

/** Is this a picture a Showcase entry may store? */
export const isAcceptablePicture = (url) => parseOwnPicture(url) !== null;

/**
 * The picture as the app should load it, shaped for the category's kind.
 * @param {string | null | undefined} url - the stored picture
 * @param {'person' | 'organisation'} kind
 * @returns {string | undefined}
 */
export function deliveryUrl(url, kind) {
  if (!url) return undefined;
  if (!parseOwnPicture(url)) return url;
  return url.replace('/image/upload/', `/image/upload/${PICTURE_TRANSFORMS[kind] ?? PICTURE_TRANSFORMS.person}/`);
}

/** Where pictures are deleted; tests swap `destroy` for a stub. */
export const pictureStore = { destroy: deleteImage };

/**
 * Deletes a picture the Showcase uploaded once no entry uses it any more.
 * @param {string | null | undefined} url - the picture that was replaced or removed
 * @param {(url: string) => Promise<boolean>} stillUsed - whether another entry still shows it
 * @returns {Promise<boolean>} true when a delete was asked for
 */
export async function releasePicture(url, stillUsed) {
  const picture = url ? parseOwnPicture(url) : null;
  if (!picture?.ownUpload) return false;
  if (await stillUsed(url)) return false;
  try {
    await pictureStore.destroy(picture.publicId);
    return true;
  } catch (error) {
    logger.warn({ error: error.message, publicId: picture.publicId }, 'A replaced Showcase picture could not be deleted');
    return false;
  }
}
