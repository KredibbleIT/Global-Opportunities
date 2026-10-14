#!/usr/bin/env node

/**
 * Website↔app tally (BE-021).
 *
 * Exports the website's opportunities and categories, compares them with the
 * app's, and prints the report: in both, only on the website, only in the
 * app, and category names that differ. With `--write`, website categories
 * missing from the mapping table are stored as unmapped (`appCategory: null`)
 * for staff curation.
 *
 * Usage:
 *   npm run sync:website-tally [-- --write]
 */

import mongoose from 'mongoose';
import { connectToDatabase } from '../src/lib/mongodb.js';
import { Opportunity } from '../src/models/Platform.js';
import { CategoryMap } from '../src/models/AdminPortal.js';
import { buildTallyReport, fetchWebsiteSnapshot } from '../src/lib/website-tally.js';
import logger from '../src/lib/logger.js';

const run = async () => {
  const write = process.argv.includes('--write');
  await connectToDatabase();

  const { opportunities: websiteOpportunities, categories: websiteCategories } = await fetchWebsiteSnapshot();
  const [appOpportunities, mappings] = await Promise.all([
    Opportunity.find({}).select('title type wordpressSync').lean(),
    CategoryMap.find({}).lean(),
  ]);
  const report = buildTallyReport({ websiteOpportunities, websiteCategories, appOpportunities, mappings });

  let stored = 0;
  if (write) {
    const known = new Set(mappings.map((row) => String(row.websiteCategory).trim().toLowerCase()));
    const missing = [
      ...report.categories.onlyWebsite,
      ...report.categories.unmapped,
    ].filter((entry) => !known.has(String(entry.websiteCategory).trim().toLowerCase()));
    for (const entry of missing) {
      await CategoryMap.updateOne(
        { websiteCategory: entry.websiteCategory },
        { $setOnInsert: { websiteCategory: entry.websiteCategory, appCategory: null } },
        { upsert: true },
      );
      stored += 1;
    }
  }

  const summary = {
    websiteOpportunities: websiteOpportunities.length,
    appOpportunities: appOpportunities.length,
    opportunities: {
      inBoth: report.opportunities.inBoth.length,
      onlyWebsite: report.opportunities.onlyWebsite.length,
      onlyApp: report.opportunities.onlyApp.length,
    },
    categories: {
      inBoth: report.categories.inBoth.length,
      onlyWebsite: report.categories.onlyWebsite.length,
      onlyApp: report.categories.onlyApp.length,
      differing: report.categories.differing.length,
      unmapped: report.categories.unmapped.length,
    },
    mappingsStored: stored,
  };
  logger.info(summary, 'Website tally completed');
  console.log(JSON.stringify({ summary, report }, null, 2));
  await mongoose.disconnect();
};

run().catch(async (error) => {
  logger.error({ error: error.message }, 'Website tally failed');
  console.error(error.message);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect failure on exit
  }
  process.exit(1);
});
