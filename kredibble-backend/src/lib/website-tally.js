import { env } from '../config/env.js';
import { ApiError } from '../utils/http.js';
import { fetchWithTimeout } from './fetch.js';

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

/**
 * Fetch the website snapshot for the tally (opportunities + taxonomy).
 * Best-effort on `/categories` (older sites lack it — categories are then
 * derived from the listings themselves).
 * @throws {ApiError} 502 when the website cannot be reached or configured.
 */
export async function fetchWebsiteSnapshot() {
  const baseUrl = env.wordpressSyncBaseUrl;
  if (!baseUrl || String(baseUrl).includes('placeholder')) {
    throw new ApiError(502, 'Website snapshot is unavailable: WordPress sync is not configured');
  }
  const headers = { Accept: 'application/json' };
  if (env.wordpressApiKey && !String(env.wordpressApiKey).includes('placeholder')) {
    headers.Authorization = `Bearer ${env.wordpressApiKey}`;
  }
  const get = async (path) => {
    const response = await fetchWithTimeout(`${String(baseUrl).replace(/\/$/, '')}${path}`, { headers }, 'Website tally');
    if (!response.ok) throw new Error(`Website returned ${response.status} for ${path}`);
    const payload = await response.json().catch(() => ({}));
    return Array.isArray(payload) ? payload : payload.items || payload.data || [];
  };
  let categories;
  try {
    categories = await get('/categories');
  } catch {
    categories = [];
  }
  const opportunities = await get('/opportunities');
  return { opportunities, categories };
}
