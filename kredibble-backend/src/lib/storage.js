import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import { ApiError } from '../utils/http.js';
import logger from './logger.js';

/**
 * File storage on this server's own disk (no third-party storage).
 *
 * - Files live under UPLOAD_DIR (in Docker, a named volume mounted at /data/uploads, so they survive redeploys).
 * - Each file gets a random 128-bit name, so its address cannot be guessed, and is served from `${UPLOAD_BASE_URL}/<folder>/<name>.<ext>`
 *   by the static handler in app.js.
 * - The extension comes from the file's detected type, never from the client's file name.
 * - Folders are built by the server from user ids and purposes; every segment is checked again here so nothing can climb out of UPLOAD_DIR.
 *
 * Results keep the shape the upload route has always returned: { secure_url, public_id, format, bytes, folder }.
 */

const EXTENSIONS = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
});

const SEGMENT = /^[A-Za-z0-9_-]+$/;
const FILE_NAME = /^[a-f0-9]{32}\.(?:png|jpg|webp|pdf)$/;

/** The folder every upload is stored in. Tests get their own temporary folder. */
export const uploadRoot = () => {
  if (process.env.UPLOAD_DIR) return path.resolve(process.env.UPLOAD_DIR);
  if (process.env.NODE_ENV === 'test') return path.join(os.tmpdir(), `kredibble-test-uploads-${process.pid}`);
  return path.resolve(process.cwd(), 'uploads');
};

/**
 * The public address the files are served from, without a trailing slash. Production must set UPLOAD_BASE_URL
 * (for example https://api.globalopportunitydesk.com/uploads); elsewhere it defaults to this server.
 */
export const uploadBaseUrl = () => {
  const configured = (process.env.UPLOAD_BASE_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  if (process.env.NODE_ENV === 'test') return 'https://api.test/uploads';
  if (process.env.NODE_ENV === 'production') throw new ApiError(503, 'File storage is not configured');
  return `http://localhost:${process.env.PORT || 4000}/uploads`;
};

const safeSegments = (folder) => {
  const segments = String(folder).split('/').filter(Boolean);
  if (segments.length === 0 || !segments.every((segment) => SEGMENT.test(segment))) {
    throw new Error('Unsafe storage folder');
  }
  return segments;
};

/** Resolves a path under the upload root, refusing anything that would leave it. */
const insideRoot = (...parts) => {
  const root = uploadRoot();
  const target = path.resolve(root, ...parts);
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error('Unsafe storage path');
  return target;
};

/**
 * Saves a file's bytes and returns where it can be read.
 * @param {Buffer} buffer - the file, already checked by the upload route
 * @param {string} folder - for example `kredibble/<userId>/avatars`
 * @returns {Promise<{ secure_url: string, public_id: string, format: string, bytes: number, folder: string }>}
 */
export const uploadBuffer = async (buffer, folder) => {
  const base = uploadBaseUrl();
  const segments = safeSegments(folder);
  const detected = await fileTypeFromBuffer(buffer);
  const extension = detected && EXTENSIONS[detected.mime];
  if (!extension) throw new ApiError(400, 'File type not allowed');

  const name = crypto.randomBytes(16).toString('hex');
  const directory = insideRoot(...segments);
  try {
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, `${name}.${extension}`), buffer, { flag: 'wx' });
  } catch (error) {
    logger.error({ error: error.message, folder }, 'File could not be saved to storage');
    throw new Error('Failed to save the file', { cause: error });
  }

  return {
    secure_url: `${base}/${segments.join('/')}/${name}.${extension}`,
    public_id: `${segments.join('/')}/${name}`,
    format: extension,
    bytes: buffer.length,
    folder: segments.join('/'),
  };
};

/**
 * The stored path (`folder/name.ext`) behind one of our file addresses, or null for any other address
 * (another host, a query string, a name we did not generate).
 * @param {string} url
 * @returns {string | null}
 */
export const storedPathFromUrl = (url) => {
  let parsed;
  let base;
  try {
    parsed = new URL(String(url));
    base = new URL(uploadBaseUrl());
  } catch {
    return null;
  }
  if (parsed.origin !== base.origin || parsed.search || parsed.hash) return null;
  const prefix = base.pathname.replace(/\/+$/, '') + '/';
  if (!parsed.pathname.startsWith(prefix)) return null;
  const relative = parsed.pathname.slice(prefix.length);
  const parts = relative.split('/');
  const file = parts.pop();
  if (!FILE_NAME.test(file ?? '') || parts.length === 0 || !parts.every((segment) => SEGMENT.test(segment))) return null;
  return relative;
};

/**
 * Deletes one stored image by its public id (`folder/name`, no extension). A missing file is not an error.
 * @param {string} publicId
 * @returns {Promise<{ result: 'ok' | 'not found' }>}
 */
export const deleteImage = async (publicId) => {
  const parts = String(publicId).split('/').filter(Boolean);
  const name = parts.pop();
  if (!name || !/^[a-f0-9]{32}$/.test(name) || parts.length === 0 || !parts.every((segment) => SEGMENT.test(segment))) {
    return { result: 'not found' };
  }
  const directory = insideRoot(...parts);
  for (const extension of new Set(Object.values(EXTENSIONS))) {
    try {
      await fs.unlink(path.join(directory, `${name}.${extension}`));
      return { result: 'ok' };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return { result: 'not found' };
};

/**
 * SEC-065: delete every file a user uploaded. The upload route stores them under `kredibble/<userId>/<purpose>`.
 * @param {string} userId
 */
export const deleteUserMedia = async (userId) => {
  if (!SEGMENT.test(String(userId))) return;
  await fs.rm(insideRoot('kredibble', String(userId)), { recursive: true, force: true });
};
