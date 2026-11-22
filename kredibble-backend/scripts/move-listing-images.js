#!/usr/bin/env node

/**
 * Move listing pictures saved as base64 text into storage (lib/listing-images.js).
 *
 * Until 21 Nov 2026 the admin listing form saved a picked picture inside the listing as a `data:` URL. This stores each
 * one as a file (the folder the admin upload route uses) and saves its link instead. Pictures in a type the server does
 * not store (AVIF, GIF, SVG…) are listed and left: open the listing in the admin and pick the picture again (the browser
 * converts it to WebP).
 *
 * A dry run by default: it prints what it would move and changes nothing. Add --write to do it. Safe to run again.
 * Nothing is sent to the website; saving a listing in the admin does that.
 *
 * Usage (on the VPS, inside the API container, so the files land on its uploads volume):
 *   docker exec god-production-api-1 node scripts/move-listing-images.js
 *   docker exec god-production-api-1 node scripts/move-listing-images.js --write
 */

import mongoose from 'mongoose';
import { connectToDatabase } from '../src/lib/mongodb.js';
import { moveListingImages } from '../src/lib/listing-images.js';
import logger from '../src/lib/logger.js';

const run = async () => {
  const write = process.argv.includes('--write');
  await connectToDatabase();
  const summary = await moveListingImages({ write });
  logger.info({ write, listings: summary.listings, moved: summary.moved, skipped: summary.skipped.length }, 'Listing image move finished');
  console.log(JSON.stringify(summary, null, 2));
  if (!write && summary.moved > 0) console.log('Dry run: nothing changed. Run again with --write to move them.');
  await mongoose.disconnect();
};

run().catch(async (error) => {
  logger.error({ error: error.message }, 'Listing image move failed');
  console.error(error.message);
  try {
    await mongoose.disconnect();
  } catch {
    // Already disconnected: nothing left to close.
  }
  process.exit(1);
});
