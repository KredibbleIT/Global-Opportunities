import { Notification } from '../models/Content.js';
import { emitToRoom } from '../socket.js';
import { pushInBackground, pushNotification } from './push.js';

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
