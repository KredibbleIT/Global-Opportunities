/**
 * SEC-160: "Remember me" keeps a person signed in between launches.
 * The launch screen restores a remembered session and signs everything else out.
 */
import * as SecureStore from 'expo-secure-store';
import {
  ApiRequestError,
  clearMobileSession,
  getMobileRefreshToken,
  getMobileToken,
  getMobileUser,
  loginMobile,
  saveMobileSession,
  setRememberSession,
  signupMobile,
} from '../src/lib/api';
import { isSessionRefused, restoreStartupSession } from '../src/lib/session-restore';

jest.mock('react-native', () => ({
  Platform: { select: jest.fn(() => 'http://localhost:4000/api/v1') },
}));

type StoreMock = typeof SecureStore & { clearAll: () => void; __getStore: () => Record<string, string> };
const store = SecureStore as StoreMock;

const REMEMBER_KEY = 'kredibble_app_remember_session';

type FakeResponse = { ok: boolean; status: number; json: () => Promise<unknown> };
const reply = (status: number, body: unknown): FakeResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const savedUser = { id: 'u1', name: 'Ama Mensah', email: 'ama@example.com', role: 'seeker' };
const freshUser = { ...savedUser, name: 'Ama K. Mensah', seeker: { university: 'KNUST' } };

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

/** Answers each request by path; `routes[path]` may be a reply or a function returning one. */
const routeFetch = (routes: Record<string, FakeResponse | (() => Promise<FakeResponse> | FakeResponse)>) => {
  mockFetch.mockImplementation(async (url: string) => {
    const path = Object.keys(routes).find(p => url.endsWith(p));
    if (!path) throw new Error(`Unexpected request: ${url}`);
    const route = routes[path];
    return typeof route === 'function' ? route() : route;
  });
};

const calledPaths = () => mockFetch.mock.calls.map(([url]) => String(url).replace(/^.*\/api\/v1/, ''));

const saveSession = async ({ remember }: { remember: boolean }) => {
  await saveMobileSession({ user: savedUser, token: 'old-access', refreshToken: 'old-refresh' });
  await setRememberSession(remember);
};

beforeEach(() => {
  store.clearAll();
  mockFetch.mockReset();
});

describe('restoreStartupSession: not remembered', () => {
  test('signs the saved session out, on the phone and the server, and opens sign-in', async () => {
    await saveSession({ remember: false });
    routeFetch({ '/auth/logout': reply(204, null) });

    await expect(restoreStartupSession()).resolves.toEqual({ status: 'signed-out' });

    expect(calledPaths()).toEqual(['/auth/logout']);
    const [, init] = mockFetch.mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({ refreshToken: 'old-refresh' });
    expect(await getMobileToken()).toBeNull();
    expect(await getMobileRefreshToken()).toBeNull();
    expect(await getMobileUser()).toBeNull();
  });

  test('with nothing saved, asks the API nothing', async () => {
    await expect(restoreStartupSession()).resolves.toEqual({ status: 'signed-out' });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('restoreStartupSession: remembered', () => {
  test('opens the app with the profile the API returns, and saves it for offline launches', async () => {
    await saveSession({ remember: true });
    routeFetch({ '/auth/me': reply(200, { data: freshUser }) });

    await expect(restoreStartupSession()).resolves.toEqual({
      status: 'signed-in',
      token: 'old-access',
      user: freshUser,
      offline: false,
    });
    expect(await getMobileUser()).toEqual(freshUser);
  });

  test('refreshes an expired access token and opens the app with the new one', async () => {
    await saveSession({ remember: true });
    let meCalls = 0;
    routeFetch({
      '/auth/me': () => (++meCalls === 1 ? reply(401, { error: { message: 'jwt expired' } }) : reply(200, { data: freshUser })),
      '/auth/refresh': reply(200, { data: { token: 'new-access', refreshToken: 'new-refresh' } }),
    });

    const session = await restoreStartupSession();

    expect(session).toMatchObject({ status: 'signed-in', token: 'new-access', offline: false });
    expect(await getMobileRefreshToken()).toBe('new-refresh');
    expect(calledPaths()).toEqual(['/auth/me', '/auth/refresh', '/auth/me']);
  });

  test.each([
    ['revoked or expired refresh token', 401],
    ['suspended account', 403],
    ['malformed refresh token', 400],
  ])('a refused refresh (%s) signs out and clears the phone', async (_label, status) => {
    await saveSession({ remember: true });
    routeFetch({
      '/auth/me': reply(401, { error: { message: 'jwt expired' } }),
      '/auth/refresh': reply(status, { error: { message: 'refused' } }),
      '/auth/logout': reply(204, null),
    });

    await expect(restoreStartupSession()).resolves.toEqual({ status: 'signed-out' });

    expect(await getMobileToken()).toBeNull();
    expect(await getMobileRefreshToken()).toBeNull();
    expect(store.__getStore()[REMEMBER_KEY]).toBeUndefined();
  });

  test('a deleted account (404 from /auth/me) signs out', async () => {
    await saveSession({ remember: true });
    routeFetch({
      '/auth/me': reply(404, { error: { message: 'User not found' } }),
      '/auth/logout': reply(204, null),
    });

    await expect(restoreStartupSession()).resolves.toEqual({ status: 'signed-out' });
    expect(await getMobileToken()).toBeNull();
  });

  test('offline: opens the app on the saved profile and keeps the session', async () => {
    await saveSession({ remember: true });
    mockFetch.mockRejectedValue(new TypeError('Network request failed'));

    await expect(restoreStartupSession()).resolves.toEqual({
      status: 'signed-in',
      token: 'old-access',
      user: savedUser,
      offline: true,
    });
    expect(await getMobileRefreshToken()).toBe('old-refresh');
  });

  test('the API failing (503) does not sign anyone out', async () => {
    await saveSession({ remember: true });
    routeFetch({ '/auth/me': reply(503, { error: { message: 'Service unavailable' } }) });

    await expect(restoreStartupSession()).resolves.toMatchObject({ status: 'signed-in', offline: true });
    expect(await getMobileRefreshToken()).toBe('old-refresh');
  });

  test.each([
    ['the refresh endpoint answers 503', () => reply(503, { error: { message: 'Service unavailable' } })],
    ['the refresh endpoint is rate limited', () => reply(429, { error: { message: 'Too many requests' } })],
    ['the refresh request gets no answer', () => Promise.reject(new TypeError('Network request failed'))],
  ])('an expired access token is kept when %s', async (_label, refreshReply) => {
    await saveSession({ remember: true });
    routeFetch({
      '/auth/me': reply(401, { error: { message: 'jwt expired' } }),
      '/auth/refresh': refreshReply,
    });

    await expect(restoreStartupSession()).resolves.toMatchObject({ status: 'signed-in', offline: true });
    expect(await getMobileToken()).toBe('old-access');
    expect(await getMobileRefreshToken()).toBe('old-refresh');
    expect(calledPaths()).not.toContain('/auth/logout');
  });

  test('an API that never answers falls back to the saved profile after the timeout', async () => {
    await saveSession({ remember: true });
    mockFetch.mockImplementation(() => new Promise(() => {}));

    await expect(restoreStartupSession({ timeoutMs: 20 })).resolves.toMatchObject({
      status: 'signed-in',
      offline: true,
    });
  });

  test('offline with no saved profile opens sign-in but keeps the tokens', async () => {
    await saveSession({ remember: true });
    await SecureStore.deleteItemAsync('kredibble_app_user');
    mockFetch.mockRejectedValue(new TypeError('Network request failed'));

    await expect(restoreStartupSession()).resolves.toEqual({ status: 'signed-out' });
    expect(await getMobileRefreshToken()).toBe('old-refresh');
  });

  test('remembered but nothing saved: sign-in, no request', async () => {
    await setRememberSession(true);
    await expect(restoreStartupSession()).resolves.toEqual({ status: 'signed-out' });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('where the Remember me choice is saved', () => {
  const authResponse = { data: { user: savedUser, token: 'access', refreshToken: 'refresh' } };

  test('loginMobile saves the ticked box', async () => {
    routeFetch({ '/auth/login': reply(200, authResponse) });
    await loginMobile('ama@example.com', 'Secret123!', true);
    expect(store.__getStore()[REMEMBER_KEY]).toBe('true');
  });

  test('loginMobile without the box forgets an earlier choice', async () => {
    await setRememberSession(true);
    routeFetch({ '/auth/login': reply(200, authResponse) });
    await loginMobile('ama@example.com', 'Secret123!');
    expect(store.__getStore()[REMEMBER_KEY]).toBeUndefined();
  });

  test('signupMobile keeps a new account signed in', async () => {
    routeFetch({ '/auth/register': reply(201, authResponse) });
    await signupMobile({ name: 'Ama', email: 'ama@example.com', password: 'Secret123!', role: 'seeker' });
    expect(store.__getStore()[REMEMBER_KEY]).toBe('true');
  });

  test('clearMobileSession forgets the choice and clears the phone before the sign-out request', async () => {
    await saveSession({ remember: true });
    let storeDuringRequest: Record<string, string> = {};
    routeFetch({
      '/auth/logout': () => {
        storeDuringRequest = { ...store.__getStore() };
        return reply(204, null);
      },
    });

    await clearMobileSession();

    expect(storeDuringRequest).toEqual({});
    expect(store.__getStore()).toEqual({});
  });

  test('clearMobileSession never throws, even if the sign-out request does', async () => {
    await saveSession({ remember: true });
    mockFetch.mockImplementation(() => {
      throw new Error('fetch exploded');
    });
    await expect(clearMobileSession()).resolves.toBeUndefined();
    expect(await getMobileToken()).toBeNull();
  });
});

describe('isSessionRefused', () => {
  test.each([
    ['401 session expired', new ApiRequestError('Session expired. Please log in again.', 401, 'SESSION_EXPIRED'), true],
    ['403 suspended', new ApiRequestError('Suspended', 403), true],
    ['404 user gone', new ApiRequestError('User not found', 404), true],
    ['408 timeout', new ApiRequestError('Request timeout', 408), false],
    ['429 rate limited', new ApiRequestError('Too many requests', 429), false],
    ['503 unavailable', new ApiRequestError('Service unavailable', 503), false],
    ['network failure', new TypeError('Network request failed'), false],
    ['any other error', new Error('anything else'), false],
  ])('%s → refused: %s', (_label, error, refused) => {
    expect(isSessionRefused(error)).toBe(refused);
  });
});
