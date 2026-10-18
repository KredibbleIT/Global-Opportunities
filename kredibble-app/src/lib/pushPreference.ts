import { useCallback, useEffect, useState } from 'react';
import { getMe, updatePushPreference } from './api';

export const PUSH_SAVE_FAILED_MESSAGE = 'We could not save your push setting. Please try again.';

/** Reads the signed-in person's push switch from the API. Missing means on. */
export async function loadPushPreference(): Promise<boolean> {
  const user = await getMe();
  return user?.notificationPreferences?.push !== false;
}

/**
 * The signed-in person's phone-push switch (SEC-138). It starts on, then shows the value
 * saved on the server. Each change is saved straight away. If a save fails, the switch
 * flips back and `onError` gets a message to show.
 */
export function usePushPreference(onError: (message: string) => void) {
  const [enabled, setEnabledState] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadPushPreference()
      .then(value => {
        if (!cancelled) setEnabledState(value);
      })
      .catch(err => console.warn('Could not load the push setting:', err));
    return () => {
      cancelled = true;
    };
  }, []);

  const setEnabled = useCallback(async (next: boolean) => {
    setEnabledState(next);
    setSaving(true);
    try {
      const saved = await updatePushPreference(next);
      setEnabledState(saved.push);
    } catch (err) {
      console.warn('Saving the push setting failed:', err);
      setEnabledState(!next);
      onError(PUSH_SAVE_FAILED_MESSAGE);
    } finally {
      setSaving(false);
    }
  }, [onError]);

  return { enabled, saving, setEnabled };
}
