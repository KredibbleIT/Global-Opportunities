import {
  ApiRequestError,
  clearMobileSession,
  getMe,
  getMobileRefreshToken,
  getMobileToken,
  getMobileUser,
  isSessionRemembered,
  saveMobileUser,
  type AuthUser,
} from './api';

/** What the app should do at launch with the session saved on this phone (SEC-160). */
export type StartupSession =
  | { status: 'signed-in'; token: string; user: AuthUser; offline: boolean }
  | { status: 'signed-out' };

/** How long launch waits for the API before falling back to the saved profile. */
export const RESTORE_TIMEOUT_MS = 8000;

class RestoreTimeoutError extends Error {
  constructor() {
    super('The API did not answer in time');
    this.name = 'RestoreTimeoutError';
  }
}

/**
 * True when the API answered and refused the session: a 4xx such as an expired or
 * revoked refresh token (SESSION_EXPIRED), a suspended account, or a deleted user.
 * Being offline, a timeout, a 5xx or a 429 is not a refusal.
 */
export const isSessionRefused = (error: unknown): boolean => {
  if (!(error instanceof ApiRequestError)) return false;
  const { status } = error;
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
};

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RestoreTimeoutError()), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

/**
 * SEC-160: decides at launch whether the person is still signed in.
 *
 * - Not remembered ("Remember me" was left unticked): signs the old session out, here
 *   and on the server, and returns signed-out.
 * - Remembered: asks the API who this is, refreshing the access token when needed.
 *   If the API refuses the session it is cleared. If the API can't be reached in time
 *   (offline, timeout, 5xx), the profile saved on this phone is used, so a bad
 *   connection doesn't sign anyone out.
 *
 * Never throws.
 */
export async function restoreStartupSession(
  options: { timeoutMs?: number } = {},
): Promise<StartupSession> {
  const timeoutMs = options.timeoutMs ?? RESTORE_TIMEOUT_MS;
  const signedOut: StartupSession = { status: 'signed-out' };
  try {
    const [remembered, token, refreshToken] = await Promise.all([
      isSessionRemembered(),
      getMobileToken(),
      getMobileRefreshToken(),
    ]);

    if (!remembered) {
      if (token || refreshToken) {
        // Local storage is cleared before the network call, so a slow server can only
        // delay the sign-out request, never the sign-in screen.
        await withTimeout(clearMobileSession(), timeoutMs).catch(() => undefined);
      }
      return signedOut;
    }

    if (!token && !refreshToken) return signedOut;

    try {
      const user = await withTimeout(getMe(), timeoutMs);
      const currentToken = await getMobileToken();
      if (!currentToken) return signedOut;
      await saveMobileUser(user);
      return { status: 'signed-in', token: currentToken, user, offline: false };
    } catch (error) {
      if (isSessionRefused(error)) {
        await clearMobileSession();
        return signedOut;
      }
      // Offline, timed out or the API is failing: keep the person signed in on what
      // this phone already knows. Screens show their own errors until the API is back.
      const [cachedUser, cachedToken] = await Promise.all([getMobileUser(), getMobileToken()]);
      if (cachedUser && cachedToken) {
        return { status: 'signed-in', token: cachedToken, user: cachedUser as AuthUser, offline: true };
      }
      return signedOut;
    }
  } catch (error) {
    console.warn('Could not restore the saved session:', error);
    return signedOut;
  }
}
