import { Notification } from '../models/Content.js';
import { emitToAll, emitToRoom } from '../socket.js';
import { pushInBackground, pushNotification } from './push.js';

/**
 * Tells every open app that an admin broadcast was just sent, so the bell can refresh at once. The event carries only the id: the
 * title and message are never sent over the shared channel, and each app then loads its own list, which the server limits to the
 * person's audience (so someone outside the audience simply loads nothing new).
 */
export const announceBroadcast = (notification) => {
  emitToAll('notification', { id: String(notification._id) });
};

/**
 * Create a notification that only one user can see, nudge their open app over the
 * personal socket room so it can refresh, and push it to their phone (SEC-138) in the
 * background. Failure to push never fails the caller.
 */
export const notifyUser = async (userId, { title, message, type = 'general', priority = 'normal' }) => {
  const notification = await Notification.create({
    title,
    message,
    type,
    priority,
    audience: 'user',
    userId,
    isActive: true,
    sentAt: new Date().toISOString(),
  });
  emitToRoom(`user_${userId}`, 'notification', { id: String(notification._id), type, title, message });
  pushInBackground(() => pushNotification(notification));
  return notification;
};
