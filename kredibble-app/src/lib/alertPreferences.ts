import { useCallback, useEffect, useState } from 'react';
import { getMe, updateAlertPreferences } from './api';

export const ALERT_SAVE_FAILED_MESSAGE = 'We could not save your notification setting. Please try again.';

/** A seeker's alert switches in Manage notifications, and what each is before the person changes it. */
export const SEEKER_ALERT_DEFAULTS = {
  jobAlerts: true,
  aiRecommendations: true,
  jobActivity: false,
  savedJobs: true,
  statusUpdates: true,
  interviewInvites: true,
  newPosts: true,
  recruiterViews: true,
  marketingUpdates: false,
};
export type NotificationSettings = typeof SEEKER_ALERT_DEFAULTS;

/** A hirer's alert switches in Manage notifications. */
export const HIRER_ALERT_DEFAULTS = {
  newApplicants: true,
  candidateMessages: true,
  channelActivity: true,
  verificationUpdates: true,
  marketingUpdates: false,
};
export type HirerNotificationSettings = typeof HIRER_ALERT_DEFAULTS;

/**
 * The signed-in person's alert switches (Manage notifications), saved on their account so they are the same on every phone. They start at the
 * defaults, then show what the server holds. Each change is saved straight away; if a save fails the switch flips back and `onError` gets a message.
 */
export function useAlertPreferences<T extends Record<string, boolean>>(defaults: T, onError: (message: string) => void) {
  const [settings, setSettings] = useState<T>({ ...defaults });

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then(user => {
        const saved = (user?.notificationPreferences as { alerts?: Record<string, unknown> } | undefined)?.alerts ?? {};
        const next = { ...defaults } as Record<string, boolean>;
        for (const key of Object.keys(defaults)) if (typeof saved[key] === 'boolean') next[key] = saved[key] as boolean;
        if (!cancelled) setSettings(next as T);
      })
      .catch(err => console.warn('Could not load the notification settings:', err));
    return () => {
      cancelled = true;
    };
    // The defaults are a fixed object per screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = useCallback(async (key: keyof T & string) => {
    const next = !settings[key];
    setSettings(current => ({ ...current, [key]: next }));
    try {
      await updateAlertPreferences({ [key]: next });
    } catch (err) {
      console.warn('Saving the notification setting failed:', err);
      setSettings(current => ({ ...current, [key]: !next }));
      onError(ALERT_SAVE_FAILED_MESSAGE);
    }
  }, [settings, onError]);

  return { settings, toggle };
}
