import { deleteImage, storedPathFromUrl } from './storage.js';
import logger from './logger.js';

/**
 * BE-031: Showcase pictures.
 *
 * - A picture is accepted only as one of OUR stored image files (this server's own storage, see lib/storage.js): uploaded
 *   through the admin upload route (purpose `showcase-photo`), or an ambassador's picture that the admin or the BE-029
 *   picture job stored. A client-supplied URL from anywhere else is refused.
 * - The app gets the stored picture as it is; the screen crops it round or square.
 * - A replaced or removed picture the Showcase uploaded is deleted, unless another entry still uses it. Borrowed
 *   ambassador pictures are never deleted. Deleting is best effort: a failure is logged, never thrown.
 */

const OWN_FOLDER = /^kredibble\/admin\/showcase-photo\/[^/]+$/;
const BORROWED_FOLDERS = [
  /^kredibble\/admin\/ambassador-photo\/[^/]+$/,
  /^ambassadors\/[^/]+$/,
];

/**
 * Reads one of our image URLs.
 * @param {string} url
 * @returns {{ publicId: string, ownUpload: boolean } | null} null for any other URL
 */
export function parseOwnPicture(url) {
  const stored = storedPathFromUrl(url);
  if (!stored || /\.pdf$/i.test(stored)) return null;
  const path = stored.replace(/\.[a-z0-9]+$/i, '');
  const ownUpload = OWN_FOLDER.test(path);
  if (!ownUpload && !BORROWED_FOLDERS.some((folder) => folder.test(path))) return null;
  return { publicId: path, ownUpload };
}

/** Is this a picture a Showcase entry may store? */
export const isAcceptablePicture = (url) => parseOwnPicture(url) !== null;

/**
 * The picture as the app should load it.
 * @param {string | null | undefined} url - the stored picture
 * @returns {string | undefined}
 */
export const deliveryUrl = (url) => url || undefined;

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
