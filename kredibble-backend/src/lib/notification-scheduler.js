import { Notification } from '../models/Content.js';
import { pushNotification } from './push.js';

// One run sends at most this many; the rest wait for the next minute.
const MAX_PER_RUN = 50;

/**
 * SEC-138: sends broadcasts whose scheduled time has come. Every API
 * instance runs this each minute. Each broadcast is claimed with one atomic
 * update that flips it from `scheduled` to `sent`, so when two instances race
 * only one of them gets it and it is pushed once. Flipping it to `sent` is
 * also what makes it appear in the in-app list.
 *
 * Throws only when the database does; pushes never throw.
 *
 * @param {{ now?: Date, limit?: number }} [options]
 * @returns {Promise<{ delivered: number }>}
 */
export async function deliverDueNotifications({ now = new Date(), limit = MAX_PER_RUN } = {}) {
  let delivered = 0;
  while (delivered < limit) {
    const notification = await Notification.findOneAndUpdate(
      { status: 'scheduled', scheduledFor: { $lte: now }, isActive: { $ne: false } },
      { $set: { status: 'sent', sentAt: now } },
      { sort: { scheduledFor: 1 }, returnDocument: 'after' },
    );
    if (!notification) break;
    delivered += 1;
    await pushNotification(notification);
  }
  return { delivered };
}
