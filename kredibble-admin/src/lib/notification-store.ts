/**
 * Client-side store for admin-sent broadcast notifications.
 * - Mock mode: the in-memory history (two sample broadcasts), and a send only adds to it.
 * - Live mode: the history is the server's (GET /admin/notifications) and a send is POST /admin/notifications, which also
 *   pushes the broadcast to the audience's phones (SEC-138). GOD-T45: the live history no longer starts from the sample
 *   broadcasts, a failed load is an error state (with retry) instead of silently showing the samples, and send() waits for the
 *   server: a failure is thrown, so the composer never says "sent" for a broadcast that was not.
 */

import { BRAND } from '@/config/brand';
import { isMockMode } from '@/lib/services/mock-mode';
import { getAdminNotifications, sendAdminNotification, type SentNotificationRecord } from '@/lib/api';

export type Audience = 'seekers' | 'hirers' | 'both';

export interface SentNotification {
  id: string;
  title: string;
  message: string;
  audience: Audience;
  /** ISO date-time. Shown with formatDateTime() (src/lib/format.ts), never as a raw string. */
  sentAt: string;
}

/** "loading" and "error" only happen in live mode. */
export type HistoryStatus = 'loading' | 'ready' | 'error';

export interface HistorySnapshot {
  history: SentNotification[];
  status: HistoryStatus;
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

const fromServer = (item: SentNotificationRecord): SentNotification => ({
  id: item.id,
  title: item.title,
  message: item.message,
  audience: (item.audience === 'seekers' || item.audience === 'hirers' ? item.audience : 'both') as Audience,
  sentAt: item.sentAt || item.createdAt || new Date().toISOString(),
});

class NotificationBroadcastStore {
  // A new object on every change, so it is a valid useSyncExternalStore snapshot. Newest first.
  snapshot: HistorySnapshot = { history: [], status: 'loading' };
  private initialized = false;
  private listeners: (() => void)[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      void this.init();
    }
  }

  /** The broadcasts, newest first. */
  get history(): SentNotification[] {
    return this.snapshot.history;
  }

  private set(next: Partial<HistorySnapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    this.listeners.forEach((listener) => listener());
  }

  /** Loads the history once (live mode), or takes the sample one (mock mode). */
  async init() {
    if (this.initialized) return;
    this.initialized = true;
    if (isMockMode()) {
      this.set({ history: [...initialHistory].sort((a, b) => b.sentAt.localeCompare(a.sentAt)), status: 'ready' });
      return;
    }
    await this.load();
  }

  /** Live mode: reads the server's history; a failure is the "error" state. Also the error state's "Try again". */
  async load() {
    this.set({ status: 'loading' });
    try {
      const res = await getAdminNotifications({ limit: 50 });
      this.set({ history: (res.data ?? []).map(fromServer), status: 'ready' });
    } catch {
      this.set({ status: 'error' });
    }
  }

  subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Sends a broadcast. Mock mode: adds it to the in-memory history. Live mode: waits for POST /admin/notifications and adds what the
   * server saved; a failure rejects (nothing is added), so the caller can say it was not sent.
   */
  async send(title: string, message: string, audience: Audience, scheduledFor?: string): Promise<SentNotification> {
    const entry: SentNotification = isMockMode()
      ? { id: `sent-${Date.now()}`, title, message, audience, sentAt: scheduledFor || new Date().toISOString() }
      : fromServer(await sendAdminNotification({ title, message, audience, scheduledFor }));
    this.set({ history: [entry, ...this.snapshot.history] });
    return entry;
  }
}

export const notificationBroadcastStore = new NotificationBroadcastStore();
