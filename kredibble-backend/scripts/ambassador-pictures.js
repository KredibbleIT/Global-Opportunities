#!/usr/bin/env node

/**
 * Ambassador picture copies (BE-029).
 *
 * Copies imported ambassadors' Google Drive pictures into our own storage:
 * every picture still pending, every failure with attempts left, and every
 * copy a restart interrupted. The import starts these copies itself right
 * after it answers; this run is the safety net. Run on a schedule (cron /
 * Render cron job).
 *
 * Usage:
 *   npm run sync:ambassador-pictures [-- --limit=200]
 *
 * Needs CLOUDINARY_* (the copies are stored there). Exits non-zero when the
 * database cannot be reached.
 */

import mongoose from 'mongoose';
import { connectToDatabase } from '../src/lib/mongodb.js';
import { processAmbassadorPictures } from '../src/lib/ambassador-pictures.js';
import logger from '../src/lib/logger.js';

const parseLimit = () => {
  const flag = process.argv.find((arg) => arg.startsWith('--limit='));
  if (!flag) return 200;
  const limit = Number(flag.slice('--limit='.length));
  if (!Number.isInteger(limit) || limit < 1 || limit > 5000) throw new Error('--limit must be a whole number from 1 to 5000');
  return limit;
};

const run = async () => {
  const limit = parseLimit();
  await connectToDatabase();
  const summary = await processAmbassadorPictures({ limit });
  logger.info({ limit, summary }, 'Ambassador picture copies completed');
  console.log(JSON.stringify({ limit, summary }, null, 2));
  await mongoose.disconnect();
};

run().catch(async (error) => {
  logger.error({ error: error.message }, 'Ambassador picture copies failed');
  console.error(error.message);
  try {
    await mongoose.disconnect();
  } catch {
    // Already disconnected: nothing left to close.
  }
  process.exit(1);
});
