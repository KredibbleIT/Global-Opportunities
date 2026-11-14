/**
 * Staging sample listings (GOD-T60).
 *
 * Adds a handful of published, vetted listings to the STAGING database so the team
 * can see every app screen with content: one event, job, internship, grant,
 * scholarship and fellowship. It creates no accounts (unlike lib/demo-seed.js,
 * which creates admin logins with a known password and must never run on a
 * reachable server).
 *
 * Safe to run more than once: listings are matched by title, so a second run adds
 * nothing. Refuses to run unless APP_ENV is "staging".
 *
 * Usage (on the VPS, inside the staging API container):
 *   docker exec god-staging-api-1 node scripts/seed-staging-listings.js
 *   docker exec god-staging-api-1 node scripts/seed-staging-listings.js --remove
 */
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { connectToDatabase } from '../src/lib/mongodb.js';
import { Opportunity } from '../src/models/Platform.js';

/** Every sample title starts with this, so they are easy to spot and remove. */
export const SAMPLE_PREFIX = '[Staging sample]';

/** Days from now as a Date (deadlines and event dates stay in the future). */
const inDays = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

/**
 * The sample listings. Fields mirror what the admin listing form saves and what
 * the app's list and detail screens read.
 * @returns {object[]}
 */
export const sampleListings = () => {
  const eventDate = inDays(21);
  return [
    {
      title: `${SAMPLE_PREFIX} Youth Careers Fair Accra`,
      type: 'event',
      company: 'Global Opportunity Desk',
      location: 'Accra, Ghana',
      format: 'in-person',
      description: 'A sample event for testing the app. Meet employers, attend CV clinics and hear from young professionals.',
      eventAt: eventDate.toISOString(),
      eventDateTime: eventDate.toISOString(),
      eventRegion: 'Greater Accra',
      eventCategory: 'Career',
      deadline: inDays(20),
    },
    {
      title: `${SAMPLE_PREFIX} Junior Data Analyst`,
      type: 'job',
      company: 'Sample Analytics Ltd',
      location: 'Kumasi, Ghana',
      format: 'hybrid',
      workType: 'Full-time',
      salary: 'GHS 4,000 - 6,000 / month',
      description: 'A sample job for testing the app. Clean and analyse data, build dashboards, and present findings.',
      deadline: inDays(30),
    },
    {
      title: `${SAMPLE_PREFIX} Software Engineering Internship`,
      type: 'internship',
      company: 'Sample Tech Hub',
      location: 'Remote',
      format: 'online',
      durationLabel: '3 months',
      description: 'A sample internship for testing the app. Work with a product team on a real mobile app.',
      deadline: inDays(25),
    },
    {
      title: `${SAMPLE_PREFIX} Young Founders Seed Grant`,
      type: 'grant',
      company: 'Sample Foundation',
      location: 'Ghana',
      format: 'online',
      grantBudgetRange: 'USD 1,000 - 5,000',
      grantSector: 'Technology',
      description: 'A sample grant for testing the app. Seed funding for early-stage ventures led by people under 30.',
      deadline: inDays(40),
    },
    {
      title: `${SAMPLE_PREFIX} Masters Scholarship in Public Health`,
      type: 'scholarship',
      company: 'Sample University',
      location: 'United Kingdom',
      format: 'in-person',
      description: 'A sample scholarship for testing the app. Full tuition and a living stipend for one year.',
      deadline: inDays(45),
    },
    {
      title: `${SAMPLE_PREFIX} Climate Leadership Fellowship`,
      type: 'fellowship',
      company: 'Sample Climate Network',
      location: 'Nairobi, Kenya',
      format: 'hybrid',
      fellowshipDuration: '6 months',
      description: 'A sample fellowship for testing the app. Training, mentoring and a project grant for climate leaders.',
      deadline: inDays(35),
    },
  ];
};

/**
 * What every sample needs to be public in the app: published and vetted. Inserted
 * directly, so nothing is sent to the website (WordPress sync only runs when staff
 * save a listing through the admin).
 */
const publishedFields = (now) => ({
  status: 'published',
  moderationStatus: 'published',
  vetted: true,
  vettedAt: now,
  publishedAt: now,
});

/** Escapes text for use inside a regular expression. */
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Adds the samples that aren't there yet (or, with remove, deletes all of them).
 * @param {{ remove?: boolean }} options
 * @returns {Promise<{ added: string[], skipped: string[], removed: number }>}
 */
export async function seedStagingListings({ remove = false } = {}) {
  if (remove) {
    const result = await Opportunity.deleteMany({ title: { $regex: `^${escapeRegex(SAMPLE_PREFIX)}` } });
    return { added: [], skipped: [], removed: result.deletedCount };
  }

  const now = new Date();
  const added = [];
  const skipped = [];
  for (const listing of sampleListings()) {
    const exists = await Opportunity.exists({ title: listing.title });
    if (exists) {
      skipped.push(listing.title);
      continue;
    }
    await Opportunity.create({ ...listing, ...publishedFields(now), closesAt: listing.deadline });
    added.push(listing.title);
  }
  return { added, skipped, removed: 0 };
}

const isDirectRun = Boolean(process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/seed-staging-listings.js'));
if (isDirectRun) {
  const main = async () => {
    if (env.appEnv !== 'staging') {
      throw new Error(`refusing to run: APP_ENV is "${env.appEnv}", not "staging". Sample listings must never reach production.`);
    }
    await connectToDatabase();
    const result = await seedStagingListings({ remove: process.argv.includes('--remove') });
    if (result.removed) console.log(`Removed ${result.removed} staging sample listing(s).`);
    for (const title of result.added) console.log(`Added: ${title}`);
    for (const title of result.skipped) console.log(`Already there: ${title}`);
    await mongoose.disconnect();
  };
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(`seed-staging-listings: ${error.message}`);
      process.exit(1);
    });
}
