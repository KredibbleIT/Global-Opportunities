import { Opportunity } from '../models/Platform.js';
import { uploadBuffer } from './storage.js';

/**
 * Listing images are stored as files and saved on the listing as links.
 *
 * Until 21 Nov 2026 the admin listing form saved the picked picture itself, as base64 text (a `data:` URL), in the
 * listing. Production's one published listing weighed about 1.1 MB, in every API response and in every push to the
 * website. The admin now uploads the picture first (`POST /admin/upload?purpose=listing-image`) and the admin API
 * refuses `data:` URLs in these fields; `moveListingImages` moves the pictures saved before that.
 */

/** The listing fields that hold one image link each. `images` holds a list of them. */
export const LISTING_IMAGE_FIELDS = Object.freeze(['logoUrl', 'organizationLogo', 'imageUrl', 'coverImage']);
const IMAGE_LIST_FIELD = 'images';

/** Where listing pictures are stored: the folder the admin upload route uses for the `listing-image` purpose. */
export const LISTING_IMAGE_FOLDER = 'kredibble/admin/listing-image';

/** The picture types the server stores (the SEC-013 image allowlist; lib/storage.js refuses the rest). */
const STORABLE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

/** True when `value` is a picture written into the text itself rather than a link to one. */
export const isDataUrl = (value) => typeof value === 'string' && /^data:/i.test(value.trim());

/** The type and bytes of a `data:` URL, or null when it cannot be read. */
const parseDataUrl = (value) => {
  const match = /^data:([^;,]*)((?:;[^;,]*)*),(.*)$/is.exec(value.trim());
  if (!match) return null;
  const type = (match[1] || 'text/plain').toLowerCase();
  const base64 = /;base64/i.test(match[2]);
  try {
    return { type, buffer: base64 ? Buffer.from(match[3], 'base64') : Buffer.from(decodeURIComponent(match[3]), 'utf8') };
  } catch {
    return null;
  }
};

/**
 * Moves pictures saved as `data:` URLs in listings into storage and replaces them with their links.
 *
 * - A dry run (`write: false`, the default) only counts and reports.
 * - The same picture appearing in several fields of one listing (the form saved the logo in `logoUrl` and
 *   `organizationLogo`) is stored once.
 * - A type the server does not store (AVIF, GIF, SVG…) is left as it is and reported in `skipped`: a person re-picks
 *   it in the admin, where the browser converts it to WebP before uploading.
 * - Listings are updated without touching `updatedAt`, and nothing is sent to the website; the next save does that.
 * Safe to run again: a moved picture is a link and is never picked up twice.
 *
 * @param {object} [options]
 * @param {boolean} [options.write] store the pictures and save the links (default false)
 * @param {(buffer: Buffer, folder: string) => Promise<{ secure_url: string }>} [options.store] stores one picture
 * @returns {Promise<{ write: boolean, listings: number, moved: number, skipped: { id: string, title: string, field: string, type: string }[] }>}
 */
export async function moveListingImages({ write = false, store = uploadBuffer } = {}) {
  const holdsDataUrl = { $regex: '^data:', $options: 'i' };
  const listings = await Opportunity.find({ $or: [...LISTING_IMAGE_FIELDS, IMAGE_LIST_FIELD].map((field) => ({ [field]: holdsDataUrl })) })
    .select(['title', ...LISTING_IMAGE_FIELDS, IMAGE_LIST_FIELD].join(' '))
    .lean();
  const summary = { write, listings: listings.length, moved: 0, skipped: [] };

  for (const record of listings) {
    const stored = new Map(); // picture text -> its link, so one picture is stored once per listing
    let movedHere = 0;

    const linkFor = async (field, value) => {
      if (!isDataUrl(value)) return value;
      const picture = parseDataUrl(value);
      if (!picture || !STORABLE_TYPES.has(picture.type)) {
        summary.skipped.push({ id: String(record._id), title: record.title, field, type: picture?.type ?? 'unreadable' });
        return value;
      }
      movedHere += 1;
      if (!write) return value;
      if (!stored.has(value)) stored.set(value, (await store(picture.buffer, LISTING_IMAGE_FOLDER)).secure_url);
      return stored.get(value);
    };

    const changes = {};
    for (const field of LISTING_IMAGE_FIELDS) {
      if (isDataUrl(record[field])) changes[field] = await linkFor(field, record[field]);
    }
    if (Array.isArray(record[IMAGE_LIST_FIELD]) && record[IMAGE_LIST_FIELD].some(isDataUrl)) {
      const links = [];
      for (const [index, value] of record[IMAGE_LIST_FIELD].entries()) links.push(await linkFor(`${IMAGE_LIST_FIELD}.${index}`, value));
      changes[IMAGE_LIST_FIELD] = links;
    }

    summary.moved += movedHere;
    if (write && movedHere > 0) await Opportunity.updateOne({ _id: record._id }, { $set: changes }, { timestamps: false });
  }
  return summary;
}
