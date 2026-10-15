#!/usr/bin/env node

/**
 * Website pull safety net (BE-026).
 *
 * Replays website content changed since a timestamp through the same
 * idempotent upserts as the webhook, so anything the webhook missed (or
 * that predates it) still lands in the app. Run on a schedule (cron / Render
 * cron job); every delivery is journaled as a SyncEvent with source 'pull'.
 *
 * Usage:
 *   npm run sync:website-pull [-- --since=2026-10-01T00:00:00.000Z]
 *
 * Reads WORDPRESS_SYNC_BASE_URL + WORDPRESS_API_KEY (the outbound sync
 * credentials). Exits non-zero when the website cannot be reached.
 */

import mongoose from 'mongoose';
import { connectToDatabase } from '../src/lib/mongodb.js';
import { env } from '../src/config/env.js';
import { fetchWithTimeout } from '../src/lib/fetch.js';
import { applySyncEvent, SYNC_HANDLERS } from '../src/lib/website-sync.js';
import logger from '../src/lib/logger.js';

const RESOURCES = Object.keys(SYNC_HANDLERS);

const parseSince = () => {
  const flag = process.argv.find((arg) => arg.startsWith('--since='));
  if (flag) {
    const date = new Date(flag.slice('--since='.length));
    if (Number.isNaN(date.getTime())) throw new Error('Invalid --since timestamp');
    return date.toISOString();
  }
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
};

const pullResource = async (resource, since) => {
  const baseUrl = env.wordpressSyncBaseUrl.replace(/\/$/, '');
  const url = new URL(`${baseUrl}/${resource}`);
  url.searchParams.set('since', since);
  const response = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${env.wordpressApiKey}`, Accept: 'application/json' },
  }, `Website pull (${resource})`);
  if (!response.ok) throw new Error(`Website returned ${response.status} for ${resource}`);
  const payload = await response.json().catch(() => ({}));
  const items = Array.isArray(payload) ? payload : payload.items || payload.data || [];
  return items;
};

const run = async () => {
  if (!env.wordpressSyncBaseUrl || !env.wordpressApiKey) {
    throw new Error('WORDPRESS_SYNC_BASE_URL and WORDPRESS_API_KEY are required for the website pull');
  }
  const since = parseSince();
  await connectToDatabase();
  const summary = {};
  for (const resource of RESOURCES) {
    const items = await pullResource(resource, since);
    let applied = 0;
    let duplicates = 0;
    let failed = 0;
    for (const item of items) {
      const externalId = String(item.wordpressId || item.referralCode || item.id || item.externalId || '');
      const eventId = `pull-${resource}-${externalId || 'unknown'}-${Date.now()}`;
      try {
        const result = await applySyncEvent({
          eventId,
          resource,
          externalId: externalId || eventId,
          attributes: item.attributes || item,
          source: 'pull',
        });
        if (result.duplicate) duplicates += 1;
        else applied += 1;
      } catch (error) {
        failed += 1;
        logger.warn({ resource, externalId, error: error.message }, 'Website pull item failed');
      }
    }
    summary[resource] = { pulled: items.length, applied, duplicates, failed };
  }
  logger.info({ since, summary }, 'Website pull completed');
  console.log(JSON.stringify({ since, summary }, null, 2));
  await mongoose.disconnect();
};

run().catch(async (error) => {
  logger.error({ error: error.message }, 'Website pull failed');
  console.error(error.message);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect failure on exit
  }
  process.exit(1);
});
