import { env } from '../config/env.js';
import { fetchWithTimeout } from './fetch.js';
import logger from './logger.js';
import { readStoredFile, storedPathFromUrl } from './storage.js';
import { isWordpressSettingSet, wordpressRestRootUrl } from './wordpress-sync.js';

/**
 * Listing images for the website (GOD-T95 follow-up, 25 Nov 2026).
 *
 * The GOD Track plugin shows a listing's logo and cover only from WordPress media IDs (`logoId`, `featuredImageId`); it
 * refuses image URLs and never downloads them. So before a listing is pushed, its images are uploaded to the WordPress
 * media library (`/wp-json/wp/v2/media`) as a WordPress user with an application password, and the returned IDs are
 * kept on the listing (`wordpressSync.media`) so the same image is not uploaded again until it changes.
 *
 * Only files this API stored itself are uploaded (their address is under UPLOAD_BASE_URL); an image linked from another
 * site is skipped rather than fetched. A failed upload never stops the listing itself from syncing: the listing goes
 * without that image and the error is kept in `wordpressSync.media.lastError`.
 */

/** True when the WordPress media upload is set up. */
export const isWordpressMediaConfigured = () => isWordpressSettingSet(env.wordpressSyncBaseUrl)
  && Boolean(env.wordpressMediaUser)
  && Boolean(env.wordpressMediaAppPassword);

const firstFilled = (...values) => values.find((value) => typeof value === 'string' && value.trim() !== '');

/**
 * Uploads one stored image to the WordPress media library.
 * @param {string} url the image's address on this API
 * @param {string} title the media title shown in WordPress
 * @returns {Promise<number>} the WordPress attachment ID
 */
const uploadToWordpress = async (url, title) => {
  const relativePath = storedPathFromUrl(url);
  if (!relativePath) throw new Error(`Image is not a file stored by this API: ${url}`);
  const { buffer, mime, name } = await readStoredFile(relativePath);
  const endpoint = `${wordpressRestRootUrl(env.wordpressSyncBaseUrl)}/wp/v2/media`;
  // WordPress application passwords may be shown with spaces; they work with or without them.
  const credentials = Buffer.from(`${env.wordpressMediaUser}:${env.wordpressMediaAppPassword.replace(/\s+/g, '')}`).toString('base64');
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': mime,
      'Content-Disposition': `attachment; filename="${name}"`,
      Accept: 'application/json',
    },
    body: buffer,
  }, 'WordPress media upload');
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = payload.message || `WordPress returned ${response.status}`;
    const hint = response.status === 401 || response.status === 403
      ? ' Check WORDPRESS_MEDIA_USER and WORDPRESS_MEDIA_APP_PASSWORD, and that the user may upload files.'
      : '';
    throw new Error(`${reason} (${endpoint}).${hint}`);
  }
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) throw new Error('WordPress media upload did not return an ID');

  // Best effort: a readable title instead of the random file name. The image is usable either way.
  if (title) {
    await fetchWithTimeout(`${endpoint}/${id}`, {
      method: 'POST',
      headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, alt_text: title }),
    }, 'WordPress media upload').catch(() => undefined);
  }
  return id;
};

/**
 * The WordPress media IDs for a listing's logo and cover, uploading what is new or changed. Updates
 * `document.wordpressSync.media` in memory; the caller saves the document with its sync state.
 * @param {object} document an Opportunity document
 * @returns {Promise<{ logoId?: number, featuredImageId?: number }>} the IDs to send (none when not configured)
 */
export const ensureListingMedia = async (document) => {
  if (!isWordpressMediaConfigured()) return {};
  const media = { ...(document.wordpressSync?.media?.toObject?.() ?? document.wordpressSync?.media ?? {}) };
  const title = String(document.title || '').trim();
  const organization = firstFilled(document.offeringOrganization, document.company, document.organizer);
  const wanted = [
    { key: 'logo', url: firstFilled(document.logoUrl, document.organizationLogo), title: organization ? `${organization} logo` : `${title} logo` },
    { key: 'cover', url: firstFilled(document.coverImage, document.imageUrl), title },
  ];
  const errors = [];

  for (const { key, url, title: mediaTitle } of wanted) {
    if (!url) {
      media[`${key}Url`] = undefined;
      media[`${key}Id`] = undefined;
      continue;
    }
    if (media[`${key}Url`] === url && media[`${key}Id`]) continue;
    // The logo and cover are often the same picture: upload it once.
    const other = key === 'logo' ? 'cover' : 'logo';
    if (media[`${other}Url`] === url && media[`${other}Id`]) {
      media[`${key}Url`] = url;
      media[`${key}Id`] = media[`${other}Id`];
      continue;
    }
    try {
      media[`${key}Id`] = await uploadToWordpress(url, mediaTitle);
      media[`${key}Url`] = url;
    } catch (error) {
      // Never send the previous picture for a changed image: the website shows none until the upload works.
      media[`${key}Url`] = undefined;
      media[`${key}Id`] = undefined;
      errors.push(`${key}: ${error.message}`);
      logger.warn({ err: error, listingId: String(document._id), image: key }, 'WordPress media upload failed; the listing syncs without this image');
    }
  }

  media.lastError = errors.length ? errors.join(' ') : undefined;
  document.wordpressSync = { ...(document.wordpressSync?.toObject?.() ?? document.wordpressSync ?? {}), media };
  const result = {};
  if (media.logoUrl && media.logoId) result.logoId = media.logoId;
  if (media.coverUrl && media.coverId) result.featuredImageId = media.coverId;
  return result;
};
