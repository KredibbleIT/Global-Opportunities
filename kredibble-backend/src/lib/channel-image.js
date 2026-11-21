import { storedFileExists, storedPathFromUrl } from './storage.js';
import { ApiError } from '../utils/http.js';

/** Where a channel's picture is uploaded: a person's own folder in the app, the shared admin folder in the dashboard. */
export const channelImageFolder = (userId) => `kredibble/${userId}/channel-avatars/`;
export const ADMIN_CHANNEL_IMAGE_FOLDER = 'kredibble/admin/channel-avatar/';

/**
 * A channel's picture must be an image the person just uploaded to the right folder (POST /upload?purpose=channel-avatars in the app,
 * /admin/upload?purpose=channel-avatar in the dashboard), never a link to another site or to someone else's file. Returns the address,
 * or throws a 400. An empty value means no picture.
 */
export async function assertChannelImage(url, folder) {
  if (url === undefined || url === null || url === '') return undefined;
  const stored = typeof url === 'string' ? storedPathFromUrl(url) : null;
  if (!stored || !stored.startsWith(folder) || /\.pdf$/i.test(stored) || !(await storedFileExists(stored))) {
    throw new ApiError(400, 'Upload the picture first; other addresses are not accepted.');
  }
  return url;
}
