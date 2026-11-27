import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { File } from 'expo-file-system';

export type AuthRole = 'seeker' | 'hirer' | 'admin';

export type Opportunity = {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  type?: string;
  requirements?: string | string[];
  salary?: string;
  applicantsCount?: number;
  vetted?: boolean;
  moderationStatus?: string;
  logoColor?: string;
  initial?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type EventItem = {
  id: string;
  title: string;
  description: string;
  date: string;
  time?: string;
  location: string;
  venueName?: string;
  venueAddress?: string;
  theme?: string;
  duration?: string;
  capacity?: number;
  attendeesCount?: number;
  image?: string;
  organizer?: string;
  type?: string;
  price?: string | number;
  priceNum?: number;
  category?: string;
  region?: string;
  ticketType?: string;
  eventType?: string;
  logoColor?: string;
  virtualUrl?: string;
  ticketUrl?: string;
};

export type Grant = {
  id: string;
  title: string;
  org?: string;
  funder?: string;
  fundingAgency?: string;
  description: string;
  fundingPool?: number;
  allocated?: number;
  budget?: string;
  openStatus?: string;
  deadline?: string;
  location?: string;
  requirements?: string;
  status?: string;
  logoColor?: string;
  initial?: string;
  awardCeiling?: string;
  awardFloor?: string;
  sector?: string;
  languages?: string;
  eligibleApplicants?: string;
  datePosted?: string;
};

/** One step of "Complete your profile". The server decides which steps exist and which are done. */
export type ProfileStep = { id: string; label: string; done: boolean };

/** How much of their profile a person has filled in (null for accounts with no profile, such as admins). */
export type ProfileCompletion = {
  percent: number;
  complete: boolean;
  steps: ProfileStep[];
  /** Ids of the steps still to do. */
  missing: string[];
};

export type Gender = 'female' | 'male' | 'other' | 'prefer_not_to_say';

export type AuthUser = {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  /** ISO date (the time part is always midnight UTC). */
  dateOfBirth?: string;
  gender?: Gender;
  avatarUrl?: string | null;
  profileCompletion?: ProfileCompletion | null;
  email: string;
  role: AuthRole | string;
  emailVerified?: boolean;
  seeker?: unknown;
  hirer?: unknown;
  staff?: unknown;
  notificationPreferences?: { push?: boolean; alerts?: Record<string, boolean> };
};

type AuthResponse = {
  user: AuthUser;
  token: string;
  refreshToken?: string;
};

const fallbackApiUrl = Platform.select({
  android: 'http://10.0.2.2:4000/api/v1',
  default: 'http://localhost:4000/api/v1',
});

export const getApiUrl = () => {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!envUrl) return fallbackApiUrl || 'http://localhost:4000/api/v1';

  // SEC-016: In production, reject non-HTTPS URLs
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && !envUrl.startsWith('https://')) {
    throw new Error('SEC-016: EXPO_PUBLIC_API_URL must use https:// in production');
  }

  if (envUrl.includes('.') && !envUrl.startsWith('http')) {
    return `https://${envUrl.replace(/\/$/, '')}`;
  }

  return envUrl.replace(/\/$/, '');
};

export const API_BASE_URL = getApiUrl();

const TOKEN_KEY = 'kredibble_app_token';
const REFRESH_TOKEN_KEY = 'kredibble_app_refresh_token';
const USER_KEY = 'kredibble_app_user';
// SEC-138: the Expo push token this phone last registered, so logout can name it.
const PUSH_TOKEN_KEY = 'kredibble_app_push_token';
// SEC-160: 'true' when this session should outlive the app being closed ("Remember me", or a new sign-up).
const REMEMBER_SESSION_KEY = 'kredibble_app_remember_session';

let sessionSavedHandler: (() => unknown) | null = null;

/**
 * SEC-138: runs after every sign-in or sign-up saves its session, without making the
 * caller wait. The root layout registers the phone's push token here, because a token
 * can only reach the server once there is a session.
 */
export const setSessionSavedHandler = (handler: (() => unknown) | null) => {
  sessionSavedHandler = handler;
};

export const saveMobileSession = async ({ token, user, refreshToken }: AuthResponse) => {
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    if (refreshToken) {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
    }
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  } catch {
    // Silently fail if secure store unavailable
  }
  const onSaved = sessionSavedHandler;
  if (onSaved) {
    Promise.resolve()
      .then(onSaved)
      .catch(err => console.warn('After-sign-in step failed:', err));
  }
};

export const getMobileToken = async () => {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const getMobileRefreshToken = async () => {
  try {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
};

/** The push token this phone last registered (SEC-138), or null if none or unreadable. */
const getStoredPushToken = async (): Promise<string | null> => {
  try {
    return (await SecureStore.getItemAsync(PUSH_TOKEN_KEY)) ?? null;
  } catch {
    return null;
  }
};

export const getMobileUser = async () => {
  try {
    const userJson = await SecureStore.getItemAsync(USER_KEY);
    return userJson ? JSON.parse(userJson) : null;
  } catch {
    return null;
  }
};

/** Replaces the profile saved on this phone (used when it is reopened offline). */
export const saveMobileUser = async (user: AuthUser): Promise<void> => {
  try {
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  } catch (error) {
    console.warn('Could not save the profile on this phone:', error);
  }
};

/**
 * SEC-160: records whether the session on this phone survives the app being closed.
 * Without the flag the next launch signs the old session out and shows sign-in.
 */
export const setRememberSession = async (remember: boolean): Promise<void> => {
  try {
    if (remember) {
      await SecureStore.setItemAsync(REMEMBER_SESSION_KEY, 'true');
    } else {
      await SecureStore.deleteItemAsync(REMEMBER_SESSION_KEY);
    }
  } catch (error) {
    console.warn('Could not save the Remember me choice:', error);
  }
};

/** SEC-160: true when the saved session should be restored at launch. */
export const isSessionRemembered = async (): Promise<boolean> => {
  try {
    return (await SecureStore.getItemAsync(REMEMBER_SESSION_KEY)) === 'true';
  } catch {
    return false;
  }
};

/** Deletes one saved value; a failure on one key must not stop the others. */
const deleteStoredItem = async (key: string): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Unreadable storage holds nothing usable either.
  }
};

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

const onRefreshed = (token: string) => {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
};

export class ApiRequestError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

const SESSION_EXPIRED_MESSAGE = 'Session expired. Please log in again.';
/** SEC-160: the API refused the saved session (refresh token revoked, expired or unknown). */
export const SESSION_EXPIRED_CODE = 'SESSION_EXPIRED';

export const isEmailVerificationError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; status?: number; message?: string };
  return (
    err.code === 'EMAIL_VERIFICATION_REQUIRED' ||
    (err.status === 403 &&
      typeof err.message === 'string' &&
      err.message.toLowerCase().includes('email verification'))
  );
};

let emailVerificationHandler: (() => void) | null = null;
export const setEmailVerificationHandler = (handler: (() => void) | null) => {
  emailVerificationHandler = handler;
};

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getMobileToken();
  let response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  let payload = await response.json().catch(() => null);

  // SEC-080: Handle expired token by refreshing on any 401 for authenticated non-auth requests
  const isAuthRoute = path.includes('/auth/login') || path.includes('/auth/refresh') || path.includes('/auth/logout');
  if (response.status === 401 && token && !isAuthRoute) {
    const refreshToken = await getMobileRefreshToken();
    
    if (refreshToken) {
      if (!isRefreshing) {
        isRefreshing = true;
        let refreshResponse: Response;
        try {
          refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });
        } catch (networkError) {
          // SEC-160: no answer (offline, timeout) is not a refusal; keep the session for the next try.
          isRefreshing = false;
          onRefreshed('');
          throw networkError;
        }

        const refreshPayload = await refreshResponse.json().catch(() => null);

        if (refreshResponse.ok && refreshPayload?.data?.token) {
          const newToken = refreshPayload.data.token;
          const newRefreshToken = refreshPayload.data.refreshToken;
          try {
            await SecureStore.setItemAsync(TOKEN_KEY, newToken);
            if (newRefreshToken) {
              await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, newRefreshToken);
            }
          } catch (storeError) {
            console.warn('Could not save the refreshed session on this phone:', storeError);
          }
          isRefreshing = false;
          onRefreshed(newToken);
        } else if (refreshResponse.status >= 500 || refreshResponse.status === 429) {
          // SEC-160: the API is down or busy, not refusing the session; keep it.
          isRefreshing = false;
          onRefreshed('');
          throw new ApiRequestError(
            refreshPayload?.error?.message || `Request failed with status ${refreshResponse.status}`,
            refreshResponse.status,
            refreshPayload?.error?.code,
          );
        } else {
          isRefreshing = false;
          await clearMobileSession();
          onRefreshed('');
          throw new ApiRequestError(SESSION_EXPIRED_MESSAGE, 401, SESSION_EXPIRED_CODE);
        }
      }
      
      // Wait for the token to be refreshed
      const newToken = await new Promise<string>((resolve) => {
        if (!isRefreshing) {
          resolve('');
        } else {
          refreshSubscribers.push(resolve);
        }
      });
      
      const retryToken = newToken || await getMobileToken();
      if (!retryToken) {
        throw new ApiRequestError(SESSION_EXPIRED_MESSAGE, 401, SESSION_EXPIRED_CODE);
      }

      // Retry original request with new token
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${retryToken}`,
          ...init.headers,
        },
      });
      
      payload = await response.json().catch(() => null);
    }
  }

  if (!response.ok) {
    const errorMsg = payload?.error?.message || `Request failed with status ${response.status}`;
    const apiError = new ApiRequestError(errorMsg, response.status, payload?.error?.code);
    if (isEmailVerificationError(apiError) && emailVerificationHandler) {
      try {
        emailVerificationHandler();
      } catch (handlerErr) {
        console.warn('Error invoking email verification handler:', handlerErr);
      }
    }
    throw apiError;
  }

  return payload.data as T;
}

export type ReferenceListKey = 'universities' | 'programs' | 'skills' | 'career-interests';
export type ReferenceDataList = {
  key: string;
  label: string;
  singular: string;
  items: string[];
};
export type AddReferenceDataResult =
  // `pending`: the entry is saved for this person and waits for staff review before others see it (GOD-T59).
  | { action: 'created'; item: string; created: true; pending?: boolean }
  | { action: 'use_existing'; item: string; created: false; aliased?: boolean }
  | { action: 'aliased'; item: string; alias: string; created: boolean }
  | { action: 'similar'; matches: string[]; created: false };

export const fetchReferenceList = async (group: string, key: string) =>
  request<ReferenceDataList>(`/reference-data/${encodeURIComponent(group)}/${encodeURIComponent(key)}`);

// Public, rate-limited suggestion endpoint; `item` asks to save `label` as an alias of an existing entry.
export const addReferenceListItem = async (group: string, key: ReferenceListKey, label: string, item?: string) =>
  request<AddReferenceDataResult>(`/reference-data/${encodeURIComponent(group)}/${encodeURIComponent(key)}/items`, {
    method: 'POST',
    body: JSON.stringify(item ? { label, item } : { label }),
  });

export const getOpportunities = async (params?: Record<string, any>) => {
  if (params) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v) query.append(k, String(v));
    });
    const qs = query.toString();
    return request<any[]>(`/opportunities${qs ? `?${qs}` : ''}`);
  }
  return request<any[]>('/opportunities');
};

export const createOpportunity = async (data: any) => {
  return request<any>('/opportunities', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const updateOpportunity = async (id: string, data: any) => {
  return request<any>(`/opportunities/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
};

export const deleteOpportunity = async (id: string) => {
  return request<any>(`/opportunities/${id}`, {
    method: 'DELETE',
  });
};

export const getDashboardSummary = async () => {
  return request<any>('/dashboard/summary');
};

export const getMe = async () => {
  return request<AuthUser>('/auth/me');
};

/**
 * "Complete your profile": saves some details about the signed-in person (a seeker's education or skills, a hirer's company details) and
 * returns the refreshed account, with the new profile completion. The copy saved on this phone is updated too.
 * A CV or logo must be uploaded first (uploadFile) and passed as its address.
 */
export const updateMyProfile = async (changes: Record<string, unknown>): Promise<AuthUser> => {
  const user = await request<AuthUser>('/users/me/profile', {
    method: 'PATCH',
    body: JSON.stringify(changes),
  });
  await saveMobileUser(user);
  return user;
};

/**
 * Signs in and saves the session on this phone.
 * @param remember SEC-160: "Remember me" was ticked, so the next launch keeps this session.
 */
export const loginMobile = async (email: string, password: string, remember = false) => {
  const session = await request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  await saveMobileSession(session);
  await setRememberSession(remember);
  return session;
};

export const signupMobile = async (values: {
  /** The new sign-up sends first and last name. A single `name` is what older app versions sent. */
  name?: string;
  firstName?: string;
  lastName?: string;
  /** YYYY-MM-DD */
  dateOfBirth?: string;
  gender?: Gender;
  email: string;
  password: string;
  role: 'seeker' | 'hirer';
  profession?: string;
  university?: string;
  country?: string;
  city?: string;
  companyName?: string;
  industry?: string;
  location?: string;
  website?: string;
  companySize?: string;
  companyEmail?: string;
  phone?: string;
  technicalSkills?: string[];
  recruiterRole?: string;
  recruiterPhone?: string;
  recruiterLinkedin?: string;
}) => {
  const session = await request<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(values),
  });
  await saveMobileSession(session);
  // SEC-160: sign-up has no "Remember me" box; someone who just made an account stays signed in.
  await setRememberSession(true);
  return session;
};

/**
 * Signs this phone out: forgets the session here, then asks the API to revoke the
 * refresh token and stop pushing to this phone. Never throws.
 */
export const clearMobileSession = async () => {
  const refreshToken = await getMobileRefreshToken();
  const token = await getMobileToken();
  // SEC-138: naming this phone's push token stops the server pushing to it,
  // without touching another phone signed in to the same account.
  const pushToken = await getStoredPushToken();
  // SEC-160: forget the session here first, so a slow sign-out request can't
  // delete a newer session saved while it was still running.
  await Promise.all(
    [TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY, PUSH_TOKEN_KEY, REMEMBER_SESSION_KEY].map(deleteStoredItem),
  );
  if (refreshToken) {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ refreshToken, ...(pushToken ? { pushToken } : {}) }),
      });
    } catch {
      // The session is already gone from this phone; the server's copy expires by itself.
    }
  }
};

// --- Push notifications (SEC-138) ---

export type PushPlatform = 'ios' | 'android' | 'web' | 'other';

/**
 * Sends this phone's Expo push token to the API (which takes it off any other
 * account) and remembers it on the phone for logout.
 */
export const registerPushToken = async (pushToken: string, platform: PushPlatform): Promise<void> => {
  await request<{ success: boolean }>('/users/me/push-token', {
    method: 'POST',
    body: JSON.stringify({ token: pushToken, platform }),
  });
  try {
    await SecureStore.setItemAsync(PUSH_TOKEN_KEY, pushToken);
  } catch (error) {
    // The server already has the token; without the copy, logout clears the account's token instead.
    console.warn('Could not store the push token on this phone:', error);
  }
};

/** Saves the alert switches of Manage notifications (only the ones sent change); resolves with every switch as saved. */
export const updateAlertPreferences = async (alerts: Record<string, boolean>): Promise<Record<string, boolean>> => {
  return request<Record<string, boolean>>('/users/me/alert-preferences', {
    method: 'PATCH',
    body: JSON.stringify(alerts),
  });
};

/** Turns phone pushes on or off for the signed-in person. The in-app list is not affected. */
export const updatePushPreference = async (enabled: boolean): Promise<{ push: boolean }> => {
  return request<{ push: boolean }>('/users/me/notification-preferences', {
    method: 'PATCH',
    body: JSON.stringify({ push: enabled }),
  });
};

// --- Applicant Management ---

export const getMyApplications = async () => {
  return request<any[]>('/users/me/applications');
};

export const getApplicants = async (opportunityId: string) => {
  return request<any[]>(`/opportunities/${opportunityId}/applicants`);
};

export const getApplicant = async (id: string) => {
  return request<any>(`/applicants/${id}`);
};

export const updateApplicantStatus = async (id: string, status: string) => {
  return request<any>(`/applicants/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
};

// --- Advanced Search & Filtering ---

export const searchCandidates = async (params: { skills?: string, university?: string, country?: string, q?: string }) => {
  const query = new URLSearchParams();
  if (params.skills) query.append('skills', params.skills);
  if (params.university) query.append('university', params.university);
  if (params.country) query.append('country', params.country);
  if (params.q) query.append('q', params.q);
  
  return request<any[]>(`/candidates/search?${query.toString()}`);
};

export const searchSeekers = async (params: { skills?: string, university?: string, country?: string, q?: string }) => {
  const query = new URLSearchParams();
  if (params.skills) query.append('skills', params.skills);
  if (params.university) query.append('university', params.university);
  if (params.country) query.append('country', params.country);
  if (params.q) query.append('q', params.q);
  
  return request<any[]>(`/seekers/search?${query.toString()}`);
};

// --- Expert listing ---

/** An approved expert, as the Expert listing and an expert's profile show them. Contact details are only here when the expert chose to show them. */
export interface PublicExpert {
  id: string;
  name: string;
  image?: string;
  profession: string;
  verified: boolean;
  city: string;
  country: string;
  location: string;
  university?: string;
  bio: string;
  experienceLevel?: string;
  technicalSkills: string[];
  rating: number;
  ratingCount: number;
  contact: { email?: string; phone?: string; website?: string };
  // Only on a single expert's profile
  professionalSummary?: string;
  softSkills?: string[];
  tools?: string[];
  certifications?: string[];
  education?: { degree?: string; institution?: string; duration?: string }[];
  workExperience?: { role?: string; company?: string; location?: string; duration?: string; bullets?: string[] }[];
  projects?: { name?: string; bullets?: string[] }[];
  myRating?: number | null;
  isMe?: boolean;
  /** false for an applicant who is not on the Expert listing: they can be read by the hirer they applied to, but not rated. */
  listed?: boolean;
}

export type ExpertStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'hidden';

/** Where the signed-in seeker stands with the Expert listing. */
export interface MyExpertState {
  status: ExpertStatus;
  eligible: boolean;
  /** What the profile still needs before applying: profession, summary, skills. */
  missing: string[];
  showEmail: boolean;
  showPhone: boolean;
  showWebsite: boolean;
  website?: string;
  reviewNote?: string;
  rating: number;
  ratingCount: number;
  profileId?: string;
}

export interface ExpertContactChoices {
  showEmail?: boolean;
  showPhone?: boolean;
  showWebsite?: boolean;
  website?: string;
}

export const getExperts = async (params: { q?: string; city?: string; profession?: string; experience?: string; rating?: string; country?: string; skills?: string } = {}) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.append(key, value);
  return request<PublicExpert[]>(`/experts?${query.toString()}`);
};

/** The professions and countries of the experts who are listed, most common first: what the filter and the search suggestions offer. */
export const getExpertFacets = async () => request<{ professions: string[]; countries: string[] }>('/experts/facets');

export const getExpert = async (id: string) => request<PublicExpert>(`/experts/${encodeURIComponent(id)}`);

/** The profile of someone who applied to one of the signed-in hirer's listings, by the id of the application. */
export const getApplicantProfile = async (applicantId: string) => request<PublicExpert>(`/experts/applicant/${encodeURIComponent(applicantId)}`);

export const getMyExpertState = async () => request<MyExpertState>('/experts/me');

export const applyAsExpert = async (choices: ExpertContactChoices) =>
  request<MyExpertState>('/experts/me/apply', { method: 'POST', body: JSON.stringify(choices) });

export const updateExpertContactChoices = async (choices: ExpertContactChoices) =>
  request<MyExpertState>('/experts/me', { method: 'PATCH', body: JSON.stringify(choices) });

export const withdrawAsExpert = async () => request<MyExpertState>('/experts/me/withdraw', { method: 'POST' });

export const rateExpert = async (id: string, stars: number) =>
  request<{ rating: number; ratingCount: number; myRating: number }>(`/experts/${encodeURIComponent(id)}/rating`, { method: 'POST', body: JSON.stringify({ stars }) });

// --- Community Channels & Posts ---

export const getChannels = async () => {
  return request<any[]>('/community/channels');
};

export const getChannel = async (id: string) => {
  return request<any>(`/community/channels/${id}`);
};

export const createChannel = async (data: any) => {
  return request<any>('/community/channels', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const updateChannel = async (id: string, data: any) => {
  return request<any>(`/community/channels/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
};

export const deleteChannel = async (id: string) => {
  return request<any>(`/community/channels/${id}`, {
    method: 'DELETE',
  });
};
export const getChannelPosts = async (channelId: string) => {
  return request<any[]>(`/community/channels/${channelId}/posts`);
};

export const createChannelPost = async (channelId: string, data: any) => {
  return request<any>(`/community/channels/${channelId}/posts`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const updateChannelPost = async (id: string, data: any) => {
  return request<any>(`/community/posts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
};

export const deleteChannelPost = async (id: string) => {
  return request<any>(`/community/posts/${id}`, {
    method: 'DELETE',
  });
};

// --- GOD-T89: reactions, views and responses on feed posts ---

export interface PostReactionState {
  reactions: { emoji: string; count: number }[];
  myReaction: string | null;
}

export interface PostResponse {
  id: string;
  postId: string;
  authorId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
}

const feedPost = (channelId: string, postId: string, rest = '') =>
  `/community/channels/${encodeURIComponent(channelId)}/posts/${encodeURIComponent(postId)}${rest}`;

/** Sets the caller's reaction on a post (one per person), or removes it with `null`. Returns the post's new totals. */
export const setPostReaction = (channelId: string, postId: string, emoji: string | null) =>
  request<PostReactionState>(feedPost(channelId, postId, '/reaction'), emoji
    ? { method: 'PUT', body: JSON.stringify({ emoji }) }
    : { method: 'DELETE' });

/** Counts the caller as a viewer of these posts (each person once per post). */
export const recordPostViews = (channelId: string, postIds: string[]) =>
  request<{ counted: number }>(`/community/channels/${encodeURIComponent(channelId)}/posts/views`, {
    method: 'POST',
    body: JSON.stringify({ postIds }),
  });

/** A post's responses, oldest first, and whether the caller can delete other people's (a group admin). */
export const getPostResponses = (channelId: string, postId: string) =>
  request<{ responses: PostResponse[]; total: number; canManage: boolean }>(feedPost(channelId, postId, '/responses?limit=100'));

export const createPostResponse = (channelId: string, postId: string, body: string) =>
  request<PostResponse>(feedPost(channelId, postId, '/responses'), { method: 'POST', body: JSON.stringify({ body }) });

export const deletePostResponse = (channelId: string, postId: string, responseId: string) =>
  request<{ deleted: true }>(feedPost(channelId, postId, `/responses/${encodeURIComponent(responseId)}`), { method: 'DELETE' });

// --- Applications ---

export const applyForOpportunity = async (opportunityId: string, data: any) => {
  return request<any>(`/opportunities/${opportunityId}/applicants`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const applyForGrant = async (grantId: string, data: any) => {
  return request<any>(`/grants/${grantId}/applications`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const bookEvent = async (eventId: string, data: any) => {
  return request<any>(`/events/${eventId}/attendees`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const uploadVerificationDoc = async (companyId: string, data: any) => {
  return request<any>(`/verification/companies/${companyId}/documents`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

/** Builds `?a=1&b=2` from the truthy entries of `params` ('' when there are none). */
const toQueryString = (params?: Record<string, any>): string => {
  const query = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value) query.append(key, String(value));
  });
  const qs = query.toString();
  return qs ? `?${qs}` : '';
};

/**
 * Reads two list endpoints and joins their results. Listings posted from the admin
 * dashboard live in `/opportunities` (type `event`, `grant`); `/events` and `/grants`
 * hold the older separate collections. One source failing still shows the other;
 * both failing rejects with the first error, so the screen can say so (GOD-T63).
 */
const mergeListSources = async (paths: string[]): Promise<any[]> => {
  const results = await Promise.allSettled(paths.map((path) => request<any[]>(path)));
  const loaded = results.filter((result): result is PromiseFulfilledResult<any[]> => result.status === 'fulfilled');
  if (loaded.length === 0) {
    throw (results[0] as PromiseRejectedResult).reason;
  }
  const seen = new Set<string>();
  return loaded
    .flatMap((result) => (Array.isArray(result.value) ? result.value : []))
    .filter((item) => {
      const key = String(item?.id ?? item?._id ?? '');
      if (!key) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

/** The event screens' wording for an opportunity's `format`. */
const EVENT_STYLE_BY_FORMAT: Record<string, string> = { online: 'Online', 'in-person': 'In-person', hybrid: 'In-person' };

/**
 * A readable event date, e.g. "Sat, 5 Dec 2026, 18:00". Text that isn't a date
 * (e.g. "2 Aug 2026, 6:00 PM GMT", typed on older listings) is shown as written.
 */
export const formatEventDate = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Gives a dashboard event (an opportunity) the fields the event screens read. The
 * admin form saves the time as `eventAt`; the screens read `eventDateTime` (list) and
 * `date` (detail and booking), so dashboard events showed no date at all.
 */
const toEventShape = (item: any) => {
  const when = formatEventDate(item.eventDateTime || item.eventAt);
  return {
    ...item,
    eventStyle: item.eventStyle ?? EVENT_STYLE_BY_FORMAT[item.format] ?? undefined,
    organizer: item.organizer ?? item.offeringOrganization ?? item.company,
    eventDateTime: when,
    date: item.date || when,
  };
};

/** Events: the dashboard's event listings plus the separate events collection. */
export const getEvents = async (params?: Record<string, any>) => {
  const items = await mergeListSources([
    `/opportunities${toQueryString({ type: 'event', q: params?.q })}`,
    `/opportunities${toQueryString({ type: 'competition', q: params?.q })}`,
    `/events${toQueryString(params)}`,
  ]);
  return items.map(toEventShape);
};

/** Grants: the dashboard's grant listings plus the separate grants collection (signed-in only). */
export const getGrants = async (params?: Record<string, any>) =>
  mergeListSources([
    `/opportunities${toQueryString({ type: 'grant', q: params?.q })}`,
    `/grants${toQueryString(params)}`,
  ]);

export const updateSeekerProfile = async (id: string, data: any) => {
  return request<any>(`/seekers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
};

export const updateHirerProfile = async (id: string, data: any) => {
  return request<any>(`/hirers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
};


export const toggleSavedItem = async (data: { itemId: string, itemType: string }) => {
  return request<any>(`/users/me/saved`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const getSavedItems = async () => {
  return request<any[]>(`/users/me/saved`);
};


export const getArticles = async (params: any = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request<any[]>(`/articles?${qs}`);
};

export const getNotifications = async () => {
  return request<any[]>(`/notifications`);
};

export const createReport = async (data: any) => {
  return request<any>('/reports', {
    method: 'POST',
    body: JSON.stringify(data)
  });
};

export const getOpportunityById = async (id: string) => {
  return request<Opportunity>(`/opportunities/${id}`);
};

/**
 * Opens a listing from the dashboard (`/opportunities/:id`) and, when no such
 * listing exists (404), the same id in the older separate collection. Other
 * errors are passed on unchanged (GOD-T63).
 */
const getFromOpportunitiesOrCollection = async <T>(id: string, collectionPath: string): Promise<T> => {
  const encodedId = encodeURIComponent(id);
  try {
    return await request<T>(`/opportunities/${encodedId}`);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      return request<T>(`${collectionPath}/${encodedId}`);
    }
    throw error;
  }
};

export const getEventById = async (id: string): Promise<EventItem> =>
  toEventShape(await getFromOpportunitiesOrCollection<EventItem>(id, '/events')) as EventItem;

export const getGrantById = async (id: string) => getFromOpportunitiesOrCollection<Grant>(id, '/grants');

export const requestForgotPassword = async (email: string) => {
  return request<void>('/auth/password/forgot', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
};

export const resetPassword = async (data: { email: string; code: string; newPassword: string }) => {
  return request<{ message: string }>('/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const changePassword = async (data: { currentPassword: string; newPassword: string }) => {
  return request<AuthResponse>('/auth/password', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const deleteMyAccount = async (password: string) => {
  await request('/auth/me', {
    method: 'DELETE',
    body: JSON.stringify({ password, confirmation: 'DELETE MY ACCOUNT' }),
  });
  await clearMobileSession();
};

export const getMyGrantApplications = async () => {
  return request<any[]>('/users/me/grant-applications');
};

export interface UploadResponse {
  url: string;
  publicId: string;
  format: string;
  bytes: number;
  folder?: string;
  originalName?: string;
  mimeType?: string;
}

export const uploadFile = async (
  file: { uri: string; name: string; mimeType?: string },
  purpose: 'cvs' | 'avatars' | 'company-logos' | 'verification-docs' | 'channel-avatars' | 'post-images' = 'cvs'
): Promise<UploadResponse> => {
  const token = await getMobileToken();
  const formData = new FormData();

  // Expo's fetch (SDK 57) no longer accepts React Native's { uri, name, type } parts ("Unsupported FormDataPart implementation");
  // a File from expo-file-system is read from disk and sent as the file part. Its name and type come from the file's own name.
  formData.append('file', new File(file.uri) as unknown as Blob);

  const response = await fetch(`${API_BASE_URL}/upload?purpose=${encodeURIComponent(purpose)}`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const errorMsg = payload?.error?.message || `Upload failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return payload.data;
};

/**
 * Sets (or, with null, removes) the signed-in person's profile picture. The picture must already be uploaded with
 * uploadFile(..., 'avatars'); the server replaces and deletes the previous one. Also updates the profile saved on this phone.
 */
export const updateMyAvatar = async (avatarUrl: string | null): Promise<string | null> => {
  const result = await request<{ avatarUrl: string | null }>('/users/me/avatar', {
    method: 'PATCH',
    body: JSON.stringify({ avatarUrl }),
  });
  const saved = await getMobileUser();
  if (saved) await saveMobileUser({ ...saved, avatarUrl: result.avatarUrl ?? undefined });
  return result.avatarUrl;
};

export const requestEmailVerification = async (
  email?: string
): Promise<{ email: string; expiresInMinutes: number }> => {
  let targetEmail = email;
  if (!targetEmail) {
    const user = await getMobileUser();
    targetEmail = user?.email;
  }
  if (!targetEmail) {
    throw new Error('Email address is required to request verification code');
  }

  return request<{ email: string; expiresInMinutes: number }>('/auth/verification-code/send', {
    method: 'POST',
    body: JSON.stringify({ email: targetEmail }),
  });
};

export const verifyEmail = async (
  code: string,
  email?: string
): Promise<{ email: string; verified: boolean }> => {
  let targetEmail = email;
  if (!targetEmail) {
    const user = await getMobileUser();
    targetEmail = user?.email;
  }
  if (!targetEmail) {
    throw new Error('Email address is required to verify code');
  }

  const result = await request<{ email: string; verified: boolean }>('/auth/verification-code/verify', {
    method: 'POST',
    body: JSON.stringify({ email: targetEmail, code }),
  });

  // Update stored user if matching
  try {
    const currentUser = await getMobileUser();
    if (currentUser) {
      currentUser.emailVerified = true;
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(currentUser));
    }
  } catch {
    // Non-fatal if secure store update fails
  }

  return result;
};

export interface AssistantChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantChatResponse {
  provider?: string;
  model?: string;
  message: string;
}

export const sendAssistantMessage = async (
  messages: AssistantChatMessage[] | string
): Promise<AssistantChatResponse> => {
  const body = typeof messages === 'string'
    ? { message: messages }
    : { messages };

  return request<AssistantChatResponse>('/assistant/chat', {
    method: 'POST',
    body: JSON.stringify(body),
  });
};


// --- Ambassadors, notifications and group chat ---

export type AmbassadorRequestStatus = 'pending' | 'approved' | 'rejected';

export interface AmbassadorRequest {
  id: string;
  status: AmbassadorRequestStatus;
  channelId?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface MyAmbassadorStatus {
  isAmbassador: boolean;
  request: AmbassadorRequest | null;
}

export const createAmbassadorRequest = async (data: { motivation?: string } = {}) => {
  return request<AmbassadorRequest>('/ambassador-requests', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const getMyAmbassadorStatus = async () => {
  return request<MyAmbassadorStatus>('/ambassador-requests/me');
};

export const markNotificationRead = async (id: string) => {
  return request<any>(`/notifications/${id}/read`, { method: 'POST' });
};

export interface ChatMessage {
  id: string;
  channelId: string;
  /** null for an announcement; otherwise the announcement this message replies to. */
  parentId: string | null;
  allowReplies: boolean;
  replyCount: number;
  senderId: string;
  senderName: string;
  senderRole: 'seeker' | 'hirer' | 'admin';
  body: string;
  createdAt: string;
}

/** Announcements of a channel. `canPost` is true only for people who can post (channel admins). */
export const getChannelMessages = async (channelId: string) => {
  return request<{ posts: ChatMessage[]; canPost: boolean }>(`/community/channels/${channelId}/messages`);
};

/** One announcement with its replies. `canReply` is false when the admin turned replies off for it. */
export const getChannelThread = async (channelId: string, messageId: string) => {
  return request<{ post: ChatMessage; replies: ChatMessage[]; canReply: boolean; canManage: boolean }>(`/community/channels/${channelId}/messages/${messageId}/replies`);
};

export const sendChannelMessage = async (channelId: string, body: string, options: { parentId?: string; allowReplies?: boolean } = {}) => {
  return request<ChatMessage>(`/community/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body, ...options }),
  });
};

/** Follow (join) a channel. Public channels are joined straight away; others wait for an admin to accept. */
export const joinChannel = async (channelId: string) => {
  return request<{ accepted: boolean }>(`/community/channels/${channelId}/join-requests`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
};

/** The opportunities of several types in one list (a category such as "Jobs & Internships" holds more than one type). A type that fails is skipped. */
export const getOpportunitiesOfTypes = (types: string[], q?: string): Promise<any[]> =>
  mergeListSources(types.map((type) => `/opportunities${toQueryString({ type, q })}`));

/** How many listings each of the eight opportunity categories holds, by category key (GET /opportunities/category-counts). */
export const getOpportunityCategoryCounts = () => request<Record<string, number>>('/opportunities/category-counts');
