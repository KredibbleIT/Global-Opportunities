import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { getMobileToken, registerPushToken, PushPlatform } from './api';

// Configure notification presentation when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const toPushPlatform = (platform: string): PushPlatform =>
  platform === 'ios' || platform === 'android' || platform === 'web' ? platform : 'other';

/**
 * Requests push notification permissions and registers the Expo push token with the backend.
 * Call it on launch and again right after sign-in or sign-up (SEC-138): it only reaches the
 * server when there is a session. Safely handles simulators/emulators, web, and denied permissions.
 */
export async function registerForPushNotificationsAsync(
  targetPlatform: string = Platform.OS
): Promise<string | null> {
  if (targetPlatform === 'web') {
    return null;
  }

  if (!Device.isDevice) {
    // Physical hardware required for APNs/FCM device push tokens
    return null;
  }

  try {
    // Android 13+ shows the permission prompt only once a channel exists, and the
    // server sends every push on this channel.
    if (targetPlatform === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#6671E4',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const pushToken = tokenData.data;

    // Send token to backend if caller has an active session
    const authToken = await getMobileToken();
    if (authToken && pushToken) {
      await registerPushToken(pushToken, toPushPlatform(targetPlatform)).catch(err => {
        // Backend push endpoint is non-blocking
        console.warn('Backend push token registration failed:', err);
      });
    }

    return pushToken;
  } catch (error) {
    console.warn('Error configuring push notifications:', error);
    return null;
  }
}

/**
 * Calls `onOpen` with the push's data when the person taps one of our notifications,
 * including the tap that launched the app from closed. Each tap is handled once.
 * Returns a function that stops listening.
 */
export function subscribeToNotificationTaps(
  onOpen: (data: Record<string, unknown>) => void,
  targetPlatform: string = Platform.OS
): () => void {
  if (targetPlatform === 'web') return () => {};

  const handled = new Set<string>();
  const handle = (response: Notifications.NotificationResponse | null) => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = response.notification.request.identifier;
    if (handled.has(id)) return;
    handled.add(id);
    onOpen((response.notification.request.content.data ?? {}) as Record<string, unknown>);
  };

  const subscription = Notifications.addNotificationResponseReceivedListener(handle);
  Notifications.getLastNotificationResponseAsync()
    .then(handle)
    .catch(err => console.warn('Could not read the notification that opened the app:', err));

  return () => subscription.remove();
}

/**
 * Calls `onReceive` when a push arrives while the app is open, so the in-app list can
 * catch up. Returns a function that stops listening.
 */
export function subscribeToIncomingNotifications(
  onReceive: () => void,
  targetPlatform: string = Platform.OS
): () => void {
  if (targetPlatform === 'web') return () => {};
  const subscription = Notifications.addNotificationReceivedListener(() => onReceive());
  return () => subscription.remove();
}
