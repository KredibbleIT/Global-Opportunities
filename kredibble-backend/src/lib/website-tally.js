import { env } from '../config/env.js';
import { ApiError } from '../utils/http.js';
import { fetchWithTimeout } from './fetch.js';
import { isWordpressSettingSet, wordpressRestRootUrl } from './wordpress-sync.js';

/**
 * Website↔app tally (BE-021): compare the website's opportunities and
 * categories with the app's and report what is in both, only on one side,
 * or named differently. All comparison is pure (`buildTallyReport`) so it is
 * unit-testable without network; `fetchWebsiteSnapshot` supplies the website
 * side for the script and the admin endpoint.
 */

/** Canonical form for category-name comparison. */
export const normalizeCategoryName = (value) =>
  String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ').trim();

const normalizeTitle = (value) =>
  String(value || '').trim().toLowerCase().replace(/\s+/g, ' ').trim();

const uniqueNames = (values) => {
  const seen = new Map();
  for (const value of values || []) {
    const name = String(value?.name ?? value ?? '').trim();
    if (!name) continue;
    const key = normalizeCategoryName(name);
    if (!seen.has(key)) seen.set(key, name);
  }
  return [...seen.entries()].map(([key, name]) => ({ key, name }));
};

/**
 * Build the tally report from snapshots.
 *
 * @param {Array} websiteOpportunities website listings ({id|wordpressId|externalId, title, category|type})
 * @param {Array} websiteCategories website taxonomy ({name|slug} or strings)
 * @param {Array} appOpportunities app listings ({wordpressSyncwordpressId?, title, type}; lean objects or docs)
 * @param {Array} mappings CategoryMap rows ({websiteCategory, appCategory|null})
 */
export function buildTallyReport({ websiteOpportunities = [], websiteCategories = [], appOpportunities = [], mappings = [] } = {}) {
  // --- Opportunities: match by website id, then by normalized title. ---
  const appByExternalId = new Map();
  const appByTitle = new Map();
  for (const opp of appOpportunities) {
    const wordpressId = opp?.wordpressSync?.wordpressId;
    if (wordpressId) appByExternalId.set(String(wordpressId), opp);
    const title = normalizeTitle(opp?.title);
    if (title && !appByTitle.has(title)) appByTitle.set(title, opp);
  }

  const oppInBoth = [];
  const oppOnlyWebsite = [];
  for (const item of websiteOpportunities) {
    const externalId = String(item?.wordpressId ?? item?.externalId ?? item?.id ?? '');
    const title = normalizeTitle(item?.title);
    const match = (externalId && appByExternalId.get(externalId)) || (title && appByTitle.get(title));
    const entry = { externalId: externalId || null, title: item?.title || '' };
    if (match) {
      oppInBoth.push(entry);
      if (externalId) appByExternalId.delete(externalId);
      if (title) appByTitle.delete(title);
    } else {
      oppOnlyWebsite.push(entry);
    }
  }
  const oppOnlyApp = [...appByExternalId.values(), ...appByTitle.values()].map((opp) => ({
    id: String(opp?._id || opp?.id || ''),
    title: opp?.title || '',
  }));

  // --- Categories: resolve each website name through the mapping table. ---
  const websiteCats = uniqueNames([
    ...websiteCategories,
    ...websiteOpportunities.map((item) => item?.category ?? item?.type).filter(Boolean),
  ]);
  const appCats = new Map();
  for (const opp of appOpportunities) {
    const type = String(opp?.type || '').trim();
    if (!type) continue;
    const key = normalizeCategoryName(type);
    if (!appCats.has(key)) appCats.set(key, type);
  }
  const mappingByWebsite = new Map(
    (mappings || []).map((row) => [normalizeCategoryName(row?.websiteCategory), row]),
  );

  const catInBoth = [];
  const catOnlyWebsite = [];
  const catDiffering = [];
  const catUnmapped = [];
  const coveredAppCats = new Set();
  for (const { key, name } of websiteCats) {
    const mapping = mappingByWebsite.get(key);
    const resolved = mapping?.appCategory ? normalizeCategoryName(mapping.appCategory) : null;
    const exact = !mapping && appCats.has(key) ? key : null;
    const hit = resolved || exact;
    if (hit && appCats.has(hit)) {
      coveredAppCats.add(hit);
      if (normalizeCategoryName(appCats.get(hit)) !== key) {
        catDiffering.push({ websiteCategory: name, appCategory: appCats.get(hit) });
      } else {
        catInBoth.push({ websiteCategory: name, appCategory: appCats.get(hit) });
      }
    } else if (mapping && !mapping.appCategory) {
      catUnmapped.push({ websiteCategory: name, appCategory: null });
    } else {
      catOnlyWebsite.push({ websiteCategory: name, appCategory: resolved ? mapping.appCategory : null });
    }
  }
  // A mapped-but-uncurated row for a website category that no longer exists
  // upstream still counts as unmapped rather than website-only.
  for (const row of mappings || []) {
    const key = normalizeCategoryName(row?.websiteCategory);
    if (!row?.appCategory && !websiteCats.some((c) => c.key === key)) {
      catUnmapped.push({ websiteCategory: row.websiteCategory, appCategory: null });
    }
  }
  const catOnlyApp = [...appCats.entries()]
    .filter(([key]) => !coveredAppCats.has(key))
    .map(([, appCategory]) => ({ appCategory }));

  return {
    opportunities: { inBoth: oppInBoth, onlyWebsite: oppOnlyWebsite, onlyApp: oppOnlyApp },
    categories: {
      inBoth: catInBoth,
      onlyWebsite: catOnlyWebsite,
      onlyApp: catOnlyApp,
      differing: catDiffering,
      unmapped: catUnmapped,
    },
  };
}

/** The page size the plugin's public list allows, and a ceiling on pages so a bad `pages` value can't loop for long. */
const WEBSITE_PAGE_SIZE = 50;
const WEBSITE_MAX_PAGES = 100;

/** WordPress sends names HTML-escaped ("Jobs &amp; Internships", "Women&#8217;s"); the tally compares plain text. */
const decodeHtmlEntities = (value) =>
  String(value ?? '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** The first category name of a website listing (`types` holds names; a term object also works). */
const firstType = (types) => {
  const first = Array.isArray(types) ? types[0] : types;
  return first ? decodeHtmlEntities(typeof first === 'object' ? first.name ?? first.slug : first) : undefined;
};

/**
 * Fetch the website snapshot for the tally: every listing on the website and its category list.
 * Reads the plugin's public list (`/wp-json/god/v1/opportunities`, `{ items, total, pages }`, 50 a page) and the
 * `god_opportunity_type` taxonomy, both public, so no key is sent. Until 21 Nov 2026 this asked `GET <plugin base>/opportunities`,
 * which the plugin serves only as POST, so the tally never worked. The category list is best effort (categories are then
 * taken from the listings).
 * @throws {ApiError} 503 when the website is not configured or does not answer (GOD-T66: not 502, which Cloudflare replaces).
 */
export async function fetchWebsiteSnapshot() {
  if (!isWordpressSettingSet(env.wordpressSyncBaseUrl)) {
    throw new ApiError(503, 'Website snapshot is unavailable: WordPress sync is not configured', { expose: true });
  }
  let restRoot;
  try {
    restRoot = wordpressRestRootUrl(env.wordpressSyncBaseUrl);
  } catch (error) {
    throw new ApiError(503, `Website snapshot is unavailable: WORDPRESS_SYNC_BASE_URL is not a valid address (${error.message})`, { expose: true });
  }
  const getJson = async (url) => {
    let response;
    try {
      response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 'Website tally');
    } catch (error) {
      if (error instanceof ApiError) throw error; // a timeout is already a readable 503
      throw new ApiError(503, `Could not reach the website at ${url}: ${error.message}`, { expose: true });
    }
    if (!response.ok) throw new ApiError(503, `The website answered ${response.status} for ${url}`, { expose: true });
    return response.json().catch(() => ({}));
  };

  const opportunities = [];
  for (let page = 1, pages = 1; page <= pages && page <= WEBSITE_MAX_PAGES; page += 1) {
    const payload = await getJson(`${restRoot}/god/v1/opportunities?per_page=${WEBSITE_PAGE_SIZE}&page=${page}`);
    const items = Array.isArray(payload) ? payload : payload.items || [];
    for (const item of items) {
      opportunities.push({ id: String(item.id ?? ''), title: decodeHtmlEntities(item.title), category: firstType(item.types) });
    }
    pages = Number(payload.pages) || 1;
  }

  let categories;
  try {
    const terms = await getJson(`${restRoot}/wp/v2/god_opportunity_type?per_page=100`);
    categories = (Array.isArray(terms) ? terms : []).map((term) => ({ name: decodeHtmlEntities(term.name) }));
  } catch {
    categories = [];
  }
  return { opportunities, categories };
}
