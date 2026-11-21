import { env } from '../config/env.js';
import { fetchWithTimeout } from './fetch.js';

const configured = (value) => value && !value.includes('placeholder');

/** Where the website's G.O.D plugin serves its admin routes, under the site's REST root. */
const PLUGIN_ADMIN_PATH = '/god/v1/admin';

/**
 * The base URL of the plugin's admin routes (`…/wp-json/god/v1/admin`), from WORDPRESS_SYNC_BASE_URL.
 * GOD-T95: production held the site's REST root (`https://globalopportunitydesk.com/wp-json`), so every push went to
 * `/wp-json/opportunities` and WordPress answered "No route was found". The REST root and the bare site address now
 * get the plugin path added; the full plugin base, or any other path, is used as written.
 * @param {string} rawBaseUrl the configured WORDPRESS_SYNC_BASE_URL
 * @returns {string} the base without a trailing slash
 */
export const wordpressAdminBaseUrl = (rawBaseUrl) => {
  const baseUrl = String(rawBaseUrl).trim().replace(/\/+$/, '');
  if (baseUrl.endsWith(PLUGIN_ADMIN_PATH)) return baseUrl;
  if (baseUrl.endsWith('/wp-json')) return `${baseUrl}${PLUGIN_ADMIN_PATH}`;
  if (new URL(baseUrl).pathname === '/') return `${baseUrl}/wp-json${PLUGIN_ADMIN_PATH}`;
  return baseUrl;
};

/**
 * The site's REST root (`…/wp-json`), from WORDPRESS_SYNC_BASE_URL: where the plugin's public routes
 * (`/god/v1/opportunities`) and the WordPress taxonomy routes live. A custom plugin base falls back to the site's `/wp-json`.
 * @param {string} rawBaseUrl the configured WORDPRESS_SYNC_BASE_URL
 * @returns {string} the REST root without a trailing slash
 */
export const wordpressRestRootUrl = (rawBaseUrl) => {
  const adminBase = wordpressAdminBaseUrl(rawBaseUrl);
  if (adminBase.endsWith(PLUGIN_ADMIN_PATH)) return adminBase.slice(0, -PLUGIN_ADMIN_PATH.length);
  return `${new URL(adminBase).origin}/wp-json`;
};

/** True when the WordPress setting is filled in with a real value (the .env.example placeholders don't count). */
export const isWordpressSettingSet = (value) => Boolean(value) && !String(value).includes('placeholder');

const syncUrl = (resource, wordpressId) => {
  const baseUrl = wordpressAdminBaseUrl(env.wordpressSyncBaseUrl);
  return wordpressId ? `${baseUrl}/${resource}/${wordpressId}` : `${baseUrl}/${resource}`;
};

/**
 * The error saved on a record when WordPress refuses a push. A missing route means the URL is wrong rather than the
 * record, so it names the URL and the setting to check instead of only WordPress's generic text.
 */
const wordpressErrorMessage = (url, response, payload) => {
  const message = payload.message || `WordPress returned ${response.status}`;
  if (payload.code === 'rest_no_route') {
    return `${message} (${url}). Check WORDPRESS_SYNC_BASE_URL: it should be the plugin base, such as https://globalopportunitydesk.com/wp-json${PLUGIN_ADMIN_PATH}.`;
  }
  return message;
};

const recordPayload = (document) => {
  const value = document.toJSON ? document.toJSON() : document;
  const { _id, __v, wordpressSync, ...record } = value;
  return { id: _id?.toString(), wordpressId: wordpressSync?.wordpressId, record };
};

const saveSyncState = async (document, state) => {
  document.wordpressSync = { ...document.wordpressSync?.toObject?.(), ...state, lastAttemptAt: new Date() };
  await document.save();
};

export const syncToWordpress = async (resource, document) => {
  if (!configured(env.wordpressSyncBaseUrl) || !configured(env.wordpressApiKey)) {
    await saveSyncState(document, { status: 'pending', lastError: 'WordPress sync is not configured' });
    return { status: 'pending' };
  }

  try {
    const url = syncUrl(resource, document.wordpressSync?.wordpressId);
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.wordpressApiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(recordPayload(document)),
    }, 'WordPress sync');
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(wordpressErrorMessage(url, response, payload));
    const wordpressId = payload.wordpressId || payload.id || payload.data?.wordpressId || payload.data?.id || document.wordpressSync?.wordpressId;
    if (!wordpressId) throw new Error('WordPress sync response did not include a WordPress ID');
    await saveSyncState(document, {
      wordpressId: String(wordpressId),
      status: 'synced',
      lastError: undefined,
    });
    return { status: 'synced', wordpressId: document.wordpressSync.wordpressId, payload };
  } catch (error) {
    await saveSyncState(document, { status: 'failed', lastError: error.message });
    return { status: 'failed', error: error.message };
  }
};

export const deleteFromWordpress = async (resource, document) => {
  if (!configured(env.wordpressSyncBaseUrl) || !configured(env.wordpressApiKey) || !document.wordpressSync?.wordpressId) {
    return { status: 'pending' };
  }
  const response = await fetchWithTimeout(syncUrl(resource, document.wordpressSync.wordpressId), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${env.wordpressApiKey}` },
  }, 'WordPress sync');
  if (!response.ok) throw new Error(`WordPress delete failed with ${response.status}`);
  return { status: 'synced' };
};
