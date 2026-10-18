import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import {
  clearMobileSession,
  loginMobile,
  registerPushToken,
  setSessionSavedHandler,
  updatePushPreference,
} from '../src/lib/api';
import {
  registerForPushNotificationsAsync,
  subscribeToIncomingNotifications,
  subscribeToNotificationTaps,
} from '../src/lib/notifications';
import { subscribeToLiveNotifications } from '../src/lib/notificationSync';
import { loadPushPreference } from '../src/lib/pushPreference';
import { authStore } from '../src/constants/authStore';
import { socketService } from '../src/lib/socket';

// SEC-138: push registration, tap handling and live refresh in the app.

jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
    select: jest.fn(() => 'http://localhost:4000/api/v1'),
  },
}));

jest.mock('expo-device', () => ({ isDevice: true }));

const mockTapListeners: ((response: unknown) => void)[] = [];
const mockReceiveListeners: (() => void)[] = [];

jest.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  AndroidImportance: { MAX: 5 },
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn((listener: (response: unknown) => void) => {
    mockTapListeners.push(listener);
    return { remove: jest.fn() };
  }),
  addNotificationReceivedListener: jest.fn((listener: () => void) => {
    mockReceiveListeners.push(listener);
    return { remove: jest.fn() };
  }),
}));

type SocketHandler = (...args: unknown[]) => void;
const mockSocketHandlers: Record<string, SocketHandler[]> = {};
const mockSocket = {
  on: jest.fn((event: string, handler: SocketHandler) => {
    (mockSocketHandlers[event] ||= []).push(handler);
  }),
  off: jest.fn((event: string, handler: SocketHandler) => {
    mockSocketHandlers[event] = (mockSocketHandlers[event] || []).filter(h => h !== handler);
  }),
};

jest.mock('../src/lib/socket', () => ({
  socketService: {
    socket: null as unknown,
    connect: jest.fn(),
  },
}));

const PUSH_TOKEN = 'ExponentPushToken[this-phone]';
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const jsonResponse = (payload: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload,
});

const tapResponse = (identifier: string, actionIdentifier = Notifications.DEFAULT_ACTION_IDENTIFIER) => ({
  actionIdentifier,
  notification: { request: { identifier, content: { data: { notificationId: identifier, type: 'ambassador' } } } },
});

let fetchMock: jest.Mock;

beforeEach(async () => {
  jest.clearAllMocks();
  mockTapListeners.length = 0;
  mockReceiveListeners.length = 0;
  Object.keys(mockSocketHandlers).forEach(key => delete mockSocketHandlers[key]);
  (SecureStore as unknown as { clearAll: () => void }).clearAll();
  fetchMock = jest.fn().mockResolvedValue(jsonResponse({ data: { success: true } }));
  global.fetch = fetchMock as unknown as typeof fetch;
  setSessionSavedHandler(null);
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
  (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({ data: PUSH_TOKEN });
  (Notifications.getLastNotificationResponseAsync as jest.Mock).mockResolvedValue(null);
});

describe('registering the push token', () => {
  test('signing in runs the session-saved step, which registers this phone', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/auth/login')) {
        return jsonResponse({ data: { token: 'session-token', refreshToken: 'refresh', user: { id: 'u1', name: 'A', email: 'a@example.com', role: 'seeker' } } });
      }
      return jsonResponse({ data: { success: true } });
    });
    setSessionSavedHandler(() => registerForPushNotificationsAsync('ios'));

    await loginMobile('a@example.com', 'Password1!');
    await settle();
    await settle();

    const registration = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/users/me/push-token'));
    expect(registration).toBeDefined();
    expect(registration[1]).toEqual(expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer session-token' }),
      body: JSON.stringify({ token: PUSH_TOKEN, platform: 'ios' }),
    }));
  });

  test('without a session the token is not sent', async () => {
    const token = await registerForPushNotificationsAsync('ios');
    expect(token).toBe(PUSH_TOKEN);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('on Android the channel exists before the permission prompt', async () => {
    const order: string[] = [];
    (Notifications.setNotificationChannelAsync as jest.Mock).mockImplementation(async () => { order.push('channel'); });
    (Notifications.getPermissionsAsync as jest.Mock).mockImplementation(async () => {
      order.push('permissions');
      return { status: 'granted' };
    });

    await registerForPushNotificationsAsync('android');

    expect(order).toEqual(['channel', 'permissions']);
  });

  test('logout names this phone\'s token so the server stops pushing to it', async () => {
    await SecureStore.setItemAsync('kredibble_app_token', 'session-token');
    await SecureStore.setItemAsync('kredibble_app_refresh_token', 'refresh-token');
    await registerPushToken(PUSH_TOKEN, 'ios');
    fetchMock.mockClear();

    await clearMobileSession();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/auth\/logout$/);
    expect(JSON.parse(init.body)).toEqual({ refreshToken: 'refresh-token', pushToken: PUSH_TOKEN });
    expect(await SecureStore.getItemAsync('kredibble_app_push_token')).toBeNull();
  });
});

describe('tapping a push', () => {
  test('opens the notification once, including the tap that launched the app', async () => {
    (Notifications.getLastNotificationResponseAsync as jest.Mock).mockResolvedValue(tapResponse('cold-start'));
    const onOpen = jest.fn();

    const stop = subscribeToNotificationTaps(onOpen, 'ios');
    await settle();
    // The same launch tap can also reach the listener; it must not open twice.
    mockTapListeners[0](tapResponse('cold-start'));
    mockTapListeners[0](tapResponse('while-running'));
    mockTapListeners[0](tapResponse('dismissed', 'expo.modules.notifications.actions.DISMISS'));

    expect(onOpen.mock.calls).toEqual([
      [{ notificationId: 'cold-start', type: 'ambassador' }],
      [{ notificationId: 'while-running', type: 'ambassador' }],
    ]);
    stop();
  });

  test('does nothing on web', () => {
    const onOpen = jest.fn();
    subscribeToNotificationTaps(onOpen, 'web')();
    subscribeToIncomingNotifications(jest.fn(), 'web')();
    expect(Notifications.addNotificationResponseReceivedListener).not.toHaveBeenCalled();
    expect(Notifications.addNotificationReceivedListener).not.toHaveBeenCalled();
  });

  test('a push that arrives while the app is open triggers a refresh', () => {
    const onReceive = jest.fn();
    subscribeToIncomingNotifications(onReceive, 'ios');
    mockReceiveListeners[0]();
    expect(onReceive).toHaveBeenCalledTimes(1);
  });
});

describe('live notifications over the socket', () => {
  test('a socket notification event reloads the list, until unsubscribed', async () => {
    authStore.user = { id: 'u1', name: 'A', email: 'a@example.com', role: 'seeker' };
    (socketService.connect as jest.Mock).mockImplementation(async () => {
      (socketService as unknown as { socket: unknown }).socket = mockSocket;
    });
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }));

    const stop = subscribeToLiveNotifications();
    await settle();
    mockSocketHandlers.notification[0]({ id: 'n1' });
    await settle();

    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/notifications$/), expect.anything());

    stop();
    expect(mockSocket.off).toHaveBeenCalledWith('notification', expect.any(Function));
    authStore.user = null;
  });
});

describe('push preference', () => {
  test('reads the saved switch, treating a missing value as on', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { id: 'u1', notificationPreferences: { push: false } } }));
    await expect(loadPushPreference()).resolves.toBe(false);

    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { id: 'u1' } }));
    await expect(loadPushPreference()).resolves.toBe(true);
  });

  test('saves the switch to the API', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { push: false } }));
    await expect(updatePushPreference(false)).resolves.toEqual({ push: false });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/users\/me\/notification-preferences$/),
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ push: false }) }),
    );
  });
});
