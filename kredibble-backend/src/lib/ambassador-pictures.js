/**
 * BE-029: the picture job. An imported ambassador's picture arrives as a
 * Google Drive share link (`pictureSourceUrl`). This job downloads the file
 * and stores OUR copy (Cloudinary, folder `ambassadors`) in `profilePhoto`,
 * so the app never hot-links someone's Drive.
 *
 * Why a job and not part of the import: one Drive download takes seconds, and
 * a file has hundreds of rows. The import marks each picture `pending` and
 * answers at once; the copies run after the response (schedulePictureCopies)
 * and again from `npm run sync:ambassador-pictures` on a schedule, which
 * picks up anything a restart interrupted and retries failures.
 *
 * Safety: the server never fetches the link as written. It reads the Drive
 * file id out of it and builds the download address itself, so the only host
 * ever contacted is Google's (no request to an internal address can be
 * smuggled in through a CSV). The answer must be a PNG, JPEG or WebP by its
 * magic bytes, at most 5 MB, read within a time limit.
 */
import { fileTypeFromBuffer } from 'file-type';
import { Ambassador } from '../models/AdminPortal.js';
import { uploadBufferToCloudinary } from './cloudinary.js';
import { env } from '../config/env.js';
import logger from './logger.js';

export const MAX_PICTURE_BYTES = 5 * 1024 * 1024;
export const MAX_PICTURE_ATTEMPTS = 3;
/** A 'processing' claim older than this was interrupted and may be retried. */
export const STALE_CLAIM_MS = 15 * 60 * 1000;
const PICTURE_TIMEOUT_MS = 30 * 1000;
const STORAGE_FOLDER = 'ambassadors';
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
const DRIVE_HOST = /^(drive|docs)\.google\.com$/i;
const GOOGLE_DOWNLOAD_HOST = /(^|\.)(google\.com|googleusercontent\.com)$/i;
const DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/;

/**
 * The Drive file id in a share link, or null. Understands
 * `/file/d/<id>/view`, `/open?id=<id>` and `/uc?id=<id>`.
 *
 * @param {string} link
 * @returns {string|null}
 */
export function driveFileId(link) {
  let url;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || !DRIVE_HOST.test(url.hostname)) return null;
  const fromPath = /\/file\/d\/([^/]+)/.exec(url.pathname)?.[1];
  const id = fromPath ?? url.searchParams.get('id');
  return id && DRIVE_ID.test(id) ? id : null;
}

/**
 * The initial job state for a picture link: pending when the link is a Drive
 * file we can copy, otherwise none (the link is kept as the source only).
 *
 * @param {string|undefined} sourceUrl
 * @returns {{ status: 'pending', attempts: number } | undefined}
 */
export function pictureJobFor(sourceUrl) {
  return sourceUrl && driveFileId(sourceUrl) ? { status: 'pending', attempts: 0 } : undefined;
}

class PictureError extends Error {}

const readCapped = async (response, cap) => {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > cap) throw new PictureError('The picture is larger than 5 MB');
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > cap) throw new PictureError('The picture is larger than 5 MB');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const downloadDrivePicture = async (sourceUrl, fetchImpl) => {
  const fileId = driveFileId(sourceUrl);
  if (!fileId) throw new PictureError('Not a Google Drive file link');
  const address = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
  const response = await fetchImpl(address, {
    redirect: 'follow',
    headers: { Accept: 'image/*' },
    signal: AbortSignal.timeout(PICTURE_TIMEOUT_MS),
  });
  const finalHost = new URL(response.url || address).hostname;
  if (!GOOGLE_DOWNLOAD_HOST.test(finalHost)) throw new PictureError('Google Drive redirected outside Google');
  if (!response.ok) throw new PictureError(`Google Drive answered ${response.status}`);
  if (/text\/html/i.test(response.headers.get('content-type') || '')) {
    // Drive answers a sign-in or warning page instead of the file.
    throw new PictureError('The file is not shared as "anyone with the link"');
  }
  const buffer = await readCapped(response, MAX_PICTURE_BYTES);
  const type = await fileTypeFromBuffer(buffer);
  if (!type || !ALLOWED_MIME.has(type.mime)) throw new PictureError('The file is not a PNG, JPEG or WebP picture');
  return buffer;
};

const claimableFilter = (now) => ({
  $or: [
    { 'pictureImport.status': 'pending' },
    { 'pictureImport.status': 'failed', 'pictureImport.attempts': { $lt: MAX_PICTURE_ATTEMPTS } },
    { 'pictureImport.status': 'processing', 'pictureImport.lastAttemptAt': { $lt: new Date(now.getTime() - STALE_CLAIM_MS) } },
  ],
});

/**
 * Copies pending pictures into our storage. Each ambassador is claimed with
 * one atomic update before any download, so the after-import run and the
 * scheduled run never copy the same picture twice. A failure is recorded on
 * the ambassador (`pictureImport.lastError`) and retried on a later run, up to
 * MAX_PICTURE_ATTEMPTS.
 *
 * @param {object} [options]
 * @param {string[]} [options.ids] - only these ambassadors (the import's own)
 * @param {number} [options.limit] - most pictures to try in this run
 * @param {typeof fetch} [options.fetchImpl] - injected in tests
 * @param {(buffer: Buffer, folder: string) => Promise<{ secure_url: string }>} [options.upload] - injected in tests
 * @returns {Promise<{ tried: number, done: number, failed: number }>}
 */
export async function processAmbassadorPictures({
  ids,
  limit = 100,
  fetchImpl = globalThis.fetch,
  upload = uploadBufferToCloudinary,
} = {}) {
  const now = new Date();
  const scope = ids ? { _id: { $in: ids } } : {};
  const candidates = await Ambassador.find({ ...scope, ...claimableFilter(now) })
    .select('_id')
    .sort({ 'pictureImport.lastAttemptAt': 1 })
    .limit(limit)
    .lean();

  const summary = { tried: 0, done: 0, failed: 0 };
  for (const { _id } of candidates) {
    const claimed = await Ambassador.findOneAndUpdate(
      { _id, ...claimableFilter(new Date()) },
      { $set: { 'pictureImport.status': 'processing', 'pictureImport.lastAttemptAt': new Date() }, $inc: { 'pictureImport.attempts': 1 } },
      { returnDocument: 'after', projection: { pictureSourceUrl: 1, pictureImport: 1 } },
    ).lean();
    if (!claimed) continue;
    summary.tried++;

    // The finishing write only lands if the source link is still the one we
    // copied: a re-import that changed it meanwhile re-queued a new copy.
    const stillOurs = { _id, pictureSourceUrl: claimed.pictureSourceUrl, 'pictureImport.status': 'processing' };
    try {
      const buffer = await downloadDrivePicture(claimed.pictureSourceUrl, fetchImpl);
      const stored = await upload(buffer, STORAGE_FOLDER);
      if (!/^https:\/\//.test(stored?.secure_url || '')) throw new PictureError('Storage did not return an https address');
      await Ambassador.updateOne(stillOurs, {
        $set: { profilePhoto: stored.secure_url, 'pictureImport.status': 'done' },
        $unset: { 'pictureImport.lastError': '' },
      });
      summary.done++;
    } catch (error) {
      const reason = error instanceof PictureError ? error.message
        : error?.name === 'TimeoutError' ? 'Google Drive took too long to answer'
          : 'Could not copy the picture';
      if (!(error instanceof PictureError)) {
        logger.warn({ ambassadorId: String(_id), error: error?.message }, 'Ambassador picture copy failed');
      }
      await Ambassador.updateOne(stillOurs, { $set: { 'pictureImport.status': 'failed', 'pictureImport.lastError': reason } });
      summary.failed++;
    }
  }
  return summary;
}

/**
 * Starts copying the given ambassadors' pictures after the current response,
 * without making the caller wait. Errors are logged, never thrown; anything
 * left pending is picked up by the scheduled run. Does nothing under Jest or
 * on the admin e2e server, so neither ever reaches Google or Cloudinary.
 *
 * @param {string[]} ids
 * @returns {void}
 */
export function schedulePictureCopies(ids) {
  if (env.isTest || env.isE2E || ids.length === 0) return;
  setImmediate(() => {
    processAmbassadorPictures({ ids, limit: ids.length }).catch((error) => {
      logger.error({ error: error.message, count: ids.length }, 'Ambassador picture job failed to run');
    });
  });
}
