/**
 * Client-side store for admin-sent broadcast notifications.
 * In mock mode (or offline) it uses the in-memory history.
 * In live mode, it reads and persists to the backend API (/admin/notifications).
 */

import { BRAND } from '@/config/brand';
import { isMockMode } from '@/lib/services/mock-mode';
import { getAdminNotifications, sendAdminNotification } from '@/lib/api';

export type Audience = 'seekers' | 'hirers' | 'both';

export interface SentNotification {
  id: string;
  title: string;
  message: string;
  audience: Audience;
  /** ISO date-time. Shown with formatDateTime() (src/lib/format.ts), never as a raw string. */
  sentAt: string;
}

const initialHistory: SentNotification[] = [
  {
    id: 'sent-1',
    title: `Welcome to ${BRAND.name}`,
    message: 'Complete your profile to start receiving personalized opportunity matches.',
    audience: 'seekers',
    sentAt: '2026-07-01T09:00:00',
  },
  {
    id: 'sent-2',
    title: 'New verification requirements',
    message: 'All hirer accounts must complete document verification by end of month to keep posting.',
    audience: 'hirers',
    sentAt: '2026-07-10T14:30:00',
  },
];

class NotificationBroadcastStore {
  // Newest first, like every entry added later.
  history: SentNotification[] = [...initialHistory].sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  private initialized = false;
  private listeners: (() => void)[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      this.init();
    }
  }

  async init() {
    if (this.initialized || isMockMode()) return;
    this.initialized = true;
    try {
      const res = await getAdminNotifications({ limit: 50 });
      if (res.data && res.data.length > 0) {
        this.history = res.data.map((item) => ({
          id: item.id,
          title: item.title,
          message: item.message,
          audience: (item.audience === 'seekers' || item.audience === 'hirers' ? item.audience : 'both') as Audience,
          sentAt: item.sentAt || item.createdAt || new Date().toISOString(),
        }));
        this.notify();
      }
    } catch {
      // Fallback stays in memory
    }
  }

  subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  notify() {
    this.listeners.forEach((l) => l());
  }

  send(title: string, message: string, audience: Audience, scheduledFor?: string) {
    const entry: SentNotification = {
      id: `sent-${Date.now()}`,
      title,
      message,
      audience,
      sentAt: scheduledFor || new Date().toISOString(),
    };
    this.history = [entry, ...this.history];
    this.notify();

    if (!isMockMode()) {
      sendAdminNotification({ title, message, audience, scheduledFor }).catch(() => {
        // Fallback remains in local store
      });
    }
  }
}

export const notificationBroadcastStore = new NotificationBroadcastStore();
