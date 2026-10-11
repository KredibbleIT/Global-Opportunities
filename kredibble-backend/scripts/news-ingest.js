#!/usr/bin/env node

/**
 * News ingest (BE-022).
 *
 * Pulls Insight Ghana and The African Journal WordPress feeds into the
 * `NewsItem` store with stable external ids (re-runs update, never
 * duplicate). Staff-hidden items stay hidden.
 *
 * Usage:
 *   npm run sync:news-ingest
 */

import mongoose from 'mongoose';
import { connectToDatabase } from '../src/lib/mongodb.js';
import { ingestAllSources } from '../src/lib/news-ingest.js';
import logger from '../src/lib/logger.js';

const run = async () => {
  await connectToDatabase();
  const results = await ingestAllSources({ perPage: 20 });
  const summary = Object.fromEntries(results.map((r) => [r.source, r]));
  logger.info({ summary }, 'News ingest completed');
  console.log(JSON.stringify({ summary }, null, 2));
  await mongoose.disconnect();
};

run().catch(async (error) => {
  logger.error({ error: error.message }, 'News ingest failed');
  console.error(error.message);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect failure on exit
  }
  process.exit(1);
});
