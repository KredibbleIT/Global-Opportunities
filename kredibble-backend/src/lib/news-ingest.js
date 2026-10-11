import { env } from '../config/env.js';
import { fetchWithTimeout } from './fetch.js';
import { NewsItem, NEWS_SOURCES } from '../models/Content.js';

/**
 * News ingest (BE-022): pull Insight Ghana and The African Journal WordPress
 * feeds on a schedule (`npm run sync:news-ingest`) into the `NewsItem` store
 * with stable external ids, so re-runs update instead of duplicating. The
 * public feed (`GET /api/v1/news`) reads the store; staff hide items with
 * `PATCH /api/v1/admin/news/:id` and ingest never unhides them.
 */

export { NEWS_SOURCES };

const sourceConfig = () => ({
  insight_ghana: { name: 'Insight Ghana', url: env.insightGhanaWordpressUrl },
  african_journal: { name: 'The African Journal', url: env.africanJournalWordpressUrl },
});

export const isSourceConfigured = (baseUrl) => Boolean(baseUrl) && !String(baseUrl).includes('placeholder');

const withoutHtml = (value = '') => String(value ?? '').replace(/<[^>]*>/g, '').trim();

const asDateOrNull = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Pure mapping from one WordPress post onto NewsItem fields. */
export function mapWordPressPost(sourceKey, sourceName, post) {
  return {
    externalId: `${sourceKey}:${post?.id}`,
    source: sourceKey,
    title: withoutHtml(post?.title?.rendered).slice(0, 300) || 'Untitled',
    summary: withoutHtml(post?.excerpt?.rendered).slice(0, 2000),
    content: withoutHtml(post?.content?.rendered).slice(0, 20000),
    link: post?.link || '',
    imageUrl: post?._embedded?.['wp:featuredmedia']?.[0]?.source_url || null,
    publishedAt: asDateOrNull(post?.date_gmt || post?.date),
    sourceName,
  };
}

/** Fetch one source's latest posts (empty when unconfigured — the other source still ingests). */
export async function fetchSourcePosts(sourceKey, { page = 1, perPage = 20 } = {}) {
  const source = sourceConfig()[sourceKey];
  if (!source) throw new Error(`Unknown news source: ${sourceKey}`);
  if (!isSourceConfigured(source.url)) return [];
  const endpoint = new URL('/wp-json/wp/v2/posts', source.url);
  endpoint.searchParams.set('page', String(page));
  endpoint.searchParams.set('per_page', String(Math.min(50, Math.max(1, perPage))));
  endpoint.searchParams.set('_embed', '1');
  const response = await fetchWithTimeout(endpoint, { headers: { Accept: 'application/json' } }, source.name);
  if (!response.ok) throw new Error(`${source.name} returned ${response.status}`);
  const posts = await response.json().catch(() => []);
  return (Array.isArray(posts) ? posts : []).map((post) => mapWordPressPost(sourceKey, source.name, post));
}

/**
 * Upsert mapped posts: content fields refresh and `lastSeenAt` advances, but
 * a staff `hidden` decision is never overwritten.
 */
export async function storePosts(mappedPosts) {
  let stored = 0;
  for (const item of mappedPosts) {
    const existing = await NewsItem.findOne({ externalId: item.externalId }).select('_id').lean();
    if (existing) {
      const { sourceName: _sourceName, ...updatable } = item;
      await NewsItem.updateOne(
        { _id: existing._id },
        { $set: { ...updatable, lastSeenAt: new Date() } },
      );
    } else {
      const { sourceName: _sourceName, ...fields } = item;
      await NewsItem.create({ ...fields, lastSeenAt: new Date() });
    }
    stored += 1;
  }
  return stored;
}

/** Ingest one source end to end. */
export async function ingestSource(sourceKey, options = {}) {
  const posts = await fetchSourcePosts(sourceKey, options);
  const stored = await storePosts(posts);
  return { source: sourceKey, fetched: posts.length, stored };
}

/** Ingest every configured source; unconfigured ones report zero without failing the run. */
export async function ingestAllSources(options = {}) {
  const results = [];
  for (const sourceKey of NEWS_SOURCES) {
    if (!isSourceConfigured(sourceConfig()[sourceKey].url)) {
      results.push({ source: sourceKey, fetched: 0, stored: 0, skipped: true });
      continue;
    }
    results.push({ ...(await ingestSource(sourceKey, options)), skipped: false });
  }
  return results;
}

/** Public shape for one stored item (matches the pre-BE-022 proxy contract). */
export const toPublicNewsItem = (doc) => {
  const value = doc?.toJSON ? doc.toJSON() : doc;
  const sources = sourceConfig();
  return {
    id: String(value._id || value.id),
    source: value.source,
    sourceName: sources[value.source]?.name || value.source,
    title: value.title,
    summary: value.summary,
    content: value.content,
    publishedAt: value.publishedAt,
    url: value.link,
    imageUrl: value.imageUrl,
  };
};
