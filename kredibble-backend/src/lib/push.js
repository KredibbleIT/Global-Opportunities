import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { PushTicket } from '../models/Content.js';
import { fetchWithTimeout } from './fetch.js';
import logger from './logger.js';

/**
 * SEC-138: phone push notifications through the Expo push service.
 *
 * Expo answers a send with one "ticket" per message: accepted, or refused
 * with a reason. Whether Apple or Google then delivered it comes later as a
 * "receipt", fetched by ticket id. A `DeviceNotRegistered` answer at either
 * step means the app was uninstalled or the token expired, so the token is
 * removed and nobody pushes to it again.
 *
 * Nothing here throws to its caller: a push is a nudge on top of the in-app
 * notification, never a reason for the request that triggered it to fail.
 */

export const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_PUSH_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

// Expo's limits per request: 100 messages per send, 1000 ids per receipt lookup.
export const PUSH_BATCH_SIZE = 100;
export const RECEIPT_BATCH_SIZE = 1000;

// Expo recommends waiting about 15 minutes before asking for receipts.
export const RECEIPT_DELAY_MS = 15 * 60 * 1000;

// The whole push payload must stay under 4 KB; the full text is in the app.
const MAX_PUSH_BODY_LENGTH = 500;

// Who a broadcast reaches. Staff (role `admin`) are never a push audience.
const AUDIENCE_ROLES = Object.freeze({
  all: ['seeker', 'hirer'],
  both: ['seeker', 'hirer'],
  seekers: ['seeker'],
  seeker: ['seeker'],
  hirers: ['hirer'],
  hirer: ['hirer'],
});

const EXPO_PUSH_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

// Someone can receive pushes when they have a token and haven't turned pushes off.
const PUSHABLE_USER_FILTER = Object.freeze({
  pushToken: { $exists: true, $nin: [null, ''] },
  'notificationPreferences.push': { $ne: false },
});

const pendingBackgroundPushes = new Set();

/**
 * True when `token` looks like a token Expo issued (`ExponentPushToken[...]`).
 *
 * @param {unknown} token
 * @returns {boolean}
 */
export const isExpoPushToken = (token) => typeof token === 'string' && EXPO_PUSH_TOKEN_PATTERN.test(token);

const emptySummary = () => ({ sent: 0, failed: 0, removedTokens: 0 });

const addSummary = (total, part) => {
  total.sent += part.sent;
  total.failed += part.failed;
  total.removedTokens += part.removedTokens;
  return total;
};

const chunk = (items, size) => {
  const chunks = [];
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size));
  return chunks;
};

const expoHeaders = () => ({
  Accept: 'application/json',
  'Content-Type': 'application/json',
  ...(env.expoAccessToken ? { Authorization: `Bearer ${env.expoAccessToken}` } : {}),
});

const truncate = (text, maxLength) => {
  const value = String(text ?? '');
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
};

/**
 * Removes push tokens Expo reported as dead. Matches on the token itself, so
 * a person who has since registered a new token keeps it.
 *
 * @param {string[]} tokens
 * @returns {Promise<number>} how many accounts lost a token
 */
const removeDeadTokens = async (tokens) => {
  if (tokens.length === 0) return 0;
  const result = await User.updateMany(
    { pushToken: { $in: tokens } },
    { $unset: { pushToken: '', pushPlatform: '' }, $set: { pushTokenUpdatedAt: new Date() } },
  );
  return result.modifiedCount ?? 0;
};

const toExpoMessage = ({ to, title, body, data, priority }) => ({
  to,
  title: truncate(title, 200),
  body: truncate(body, MAX_PUSH_BODY_LENGTH),
  data: data || {},
  sound: 'default',
  priority: priority === 'high' || priority === 'urgent' ? 'high' : 'default',
  // Matches the channel the app creates on Android.
  channelId: 'default',
});

/**
 * Sends one batch (at most PUSH_BATCH_SIZE) and records what Expo said.
 *
 * @param {Array<{ to: string, userId?: unknown }>} batch
 * @param {object[]} expoMessages - the same batch in Expo's message format
 */
const sendBatch = async (batch, expoMessages) => {
  const summary = emptySummary();
  const response = await fetchWithTimeout(
    EXPO_PUSH_SEND_URL,
    { method: 'POST', headers: expoHeaders(), body: JSON.stringify(expoMessages) },
    'Expo push service',
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(payload?.data)) {
    logger.error({ status: response.status, errors: payload?.errors }, 'Expo push request was refused');
    summary.failed = batch.length;
    return summary;
  }

  const tickets = [];
  const deadTokens = [];
  batch.forEach((message, index) => {
    const ticket = payload.data[index];
    if (ticket?.status === 'ok' && ticket.id) {
      summary.sent += 1;
      tickets.push({ ticketId: ticket.id, token: message.to, userId: message.userId });
      return;
    }
    summary.failed += 1;
    if (ticket?.details?.error === 'DeviceNotRegistered') {
      deadTokens.push(message.to);
    } else {
      logger.warn({ error: ticket?.details?.error, message: ticket?.message }, 'Expo refused a push');
    }
  });

  if (tickets.length > 0) await PushTicket.insertMany(tickets, { ordered: false });
  summary.removedTokens = await removeDeadTokens(deadTokens);
  return summary;
};

/**
 * Sends pushes through Expo in batches of PUSH_BATCH_SIZE. Messages whose
 * `to` isn't an Expo token are skipped. Does nothing while push is disabled.
 * Never throws: a failed batch is logged and counted in `failed`.
 *
 * @param {Array<{ to: string, userId?: unknown, title: string, body: string, data?: object, priority?: string }>} messages
 * @returns {Promise<{ sent: number, failed: number, removedTokens: number }>}
 */
export async function sendPushMessages(messages) {
  const total = emptySummary();
  if (!env.pushEnabled) return total;

  const deliverable = messages.filter((message) => isExpoPushToken(message.to));
  for (const batch of chunk(deliverable, PUSH_BATCH_SIZE)) {
    try {
      addSummary(total, await sendBatch(batch, batch.map(toExpoMessage)));
    } catch (error) {
      logger.error({ err: error.message, count: batch.length }, 'Expo push request failed');
      total.failed += batch.length;
    }
  }
  return total;
}

/**
 * Builds the push for a stored Notification: its title and message, plus the
 * id and type the app uses to open the right screen when it's tapped.
 *
 * @param {{ _id: unknown, title: string, message: string, type?: string, priority?: string }} notification
 */
const pushContentFor = (notification) => ({
  title: notification.title,
  body: notification.message,
  priority: notification.priority,
  data: { notificationId: String(notification._id), type: notification.type || 'general' },
});

/**
 * Pushes to specific people, skipping anyone without a token or with pushes
 * turned off. Never throws.
 *
 * @param {unknown[]} userIds
 * @param {{ title: string, body: string, data?: object, priority?: string }} content
 * @returns {Promise<{ sent: number, failed: number, removedTokens: number }>}
 */
export async function sendPushToUsers(userIds, content) {
  if (!env.pushEnabled || userIds.length === 0) return emptySummary();
  try {
    const users = await User.find({ _id: { $in: userIds }, ...PUSHABLE_USER_FILTER }).select('_id pushToken').lean();
    return await sendPushMessages(users.map((user) => ({ ...content, to: user.pushToken, userId: user._id })));
  } catch (error) {
    logger.error({ err: error.message }, 'Push to users failed');
    return { ...emptySummary(), failed: userIds.length };
  }
}

/**
 * Pushes a broadcast to everyone in its audience (`all`, `both`, `seekers`,
 * `hirers`). Reads recipients with a cursor and sends as each batch fills,
 * so a large audience never sits in memory at once. Never throws.
 *
 * @param {string} audience
 * @param {{ title: string, body: string, data?: object, priority?: string }} content
 * @returns {Promise<{ sent: number, failed: number, removedTokens: number }>}
 */
export async function sendPushToAudience(audience, content) {
  const total = emptySummary();
  const roles = AUDIENCE_ROLES[audience];
  if (!env.pushEnabled || !roles) return total;

  try {
    const cursor = User.find({ role: { $in: roles }, ...PUSHABLE_USER_FILTER }).select('_id pushToken').lean().cursor();
    let batch = [];
    for await (const user of cursor) {
      batch.push({ ...content, to: user.pushToken, userId: user._id });
      if (batch.length === PUSH_BATCH_SIZE) {
        addSummary(total, await sendPushMessages(batch));
        batch = [];
      }
    }
    if (batch.length > 0) addSummary(total, await sendPushMessages(batch));
  } catch (error) {
    logger.error({ err: error.message, audience }, 'Push to audience failed');
  }
  return total;
}

/**
 * Pushes a stored Notification to whoever it is for: its one `userId`, or
 * its broadcast audience. Never throws.
 *
 * @param {{ _id: unknown, userId?: unknown, audience: string, title: string, message: string, type?: string, priority?: string }} notification
 * @returns {Promise<{ sent: number, failed: number, removedTokens: number }>}
 */
export async function pushNotification(notification) {
  const content = pushContentFor(notification);
  if (notification.userId) return sendPushToUsers([notification.userId], content);
  return sendPushToAudience(notification.audience, content);
}

/**
 * Starts a push without making the caller wait for Expo. Push helpers never
 * reject; the catch only guards against a programming error.
 *
 * @param {() => Promise<unknown>} job
 */
export const pushInBackground = (job) => {
  if (!env.pushEnabled) return;
  const running = Promise.resolve()
    .then(job)
    .catch((error) => logger.error({ err: error.message }, 'Background push failed'))
    .finally(() => pendingBackgroundPushes.delete(running));
  pendingBackgroundPushes.add(running);
};

/**
 * Resolves once every push started with pushInBackground has finished.
 * Tests use it to see what a request sent.
 *
 * @returns {Promise<void>}
 */
export async function waitForBackgroundPushes() {
  while (pendingBackgroundPushes.size > 0) {
    await Promise.all([...pendingBackgroundPushes]);
  }
}

/**
 * Reads receipts for pushes Expo accepted at least RECEIPT_DELAY_MS ago and
 * removes tokens whose phone is gone. A ticket whose receipt isn't ready yet
 * is kept for the next run; Mongo expires it after a day. Never throws.
 *
 * @param {{ now?: Date }} [options]
 * @returns {Promise<{ checked: number, failed: number, removedTokens: number }>}
 */
export async function checkPushReceipts({ now = new Date() } = {}) {
  const summary = { checked: 0, failed: 0, removedTokens: 0 };
  if (!env.pushEnabled) return summary;

  try {
    const due = await PushTicket.find({ createdAt: { $lte: new Date(now.getTime() - RECEIPT_DELAY_MS) } })
      .sort({ createdAt: 1 })
      .limit(RECEIPT_BATCH_SIZE)
      .lean();
    if (due.length === 0) return summary;

    const response = await fetchWithTimeout(
      EXPO_PUSH_RECEIPTS_URL,
      { method: 'POST', headers: expoHeaders(), body: JSON.stringify({ ids: due.map((ticket) => ticket.ticketId) }) },
      'Expo push service',
    );
    const payload = await response.json().catch(() => null);
    const receipts = payload?.data;
    if (!response.ok || !receipts || typeof receipts !== 'object') {
      logger.error({ status: response.status, errors: payload?.errors }, 'Expo receipt request was refused');
      summary.failed = due.length;
      return summary;
    }

    const answeredTicketIds = [];
    const deadTokens = [];
    for (const ticket of due) {
      const receipt = receipts[ticket.ticketId];
      if (!receipt) continue;
      answeredTicketIds.push(ticket.ticketId);
      summary.checked += 1;
      if (receipt.status !== 'error') continue;
      summary.failed += 1;
      if (receipt.details?.error === 'DeviceNotRegistered') {
        deadTokens.push(ticket.token);
      } else {
        logger.warn({ error: receipt.details?.error, message: receipt.message }, 'A push was not delivered');
      }
    }

    summary.removedTokens = await removeDeadTokens(deadTokens);
    await PushTicket.deleteMany({ ticketId: { $in: answeredTicketIds } });
  } catch (error) {
    logger.error({ err: error.message }, 'Checking push receipts failed');
  }
  return summary;
}
