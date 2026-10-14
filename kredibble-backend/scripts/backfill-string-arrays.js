#!/usr/bin/env node
/**
 * Idempotent backfill script for SEC-037 String → [String] migration.
 * 
 * Converts JSON-string fields to native arrays in-place.
 * Run manually: node scripts/backfill-string-arrays.js
 * 
 * Fields converted:
 * - SeekerProfile: technicalSkills, softSkills, tools, certifications
 * - Candidate: skills
 * - Opportunity: experienceLevels
 * 
 * Run with: MONGODB_URI=... node scripts/backfill-string-arrays.js
 */

import mongoose from 'mongoose';
import { SeekerProfile, Candidate } from '../src/models/Profiles.js';
import { Opportunity } from '../src/models/Platform.js';

const SEEKER_FIELDS = ['technicalSkills', 'softSkills', 'tools', 'certifications'];
const CANDIDATE_FIELDS = ['skills'];
const OPPORTUNITY_FIELDS = ['experienceLevels'];

function parseArrayField(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      // If parsing fails, treat as single-element array
      return [trimmed];
    }
  }
  return [value];
}

async function backfillModel(Model, fields, modelName) {
  console.log(`\n=== Backfilling ${modelName} ===`);
  let scanned = 0;
  let converted = 0;
  let skipped = 0;
  let errors = 0;

  const cursor = Model.find({}).cursor();
  for await (const doc of cursor) {
    scanned++;
    let modified = false;
    const updates = {};

    for (const field of fields) {
      const currentValue = doc.get(field);
      if (currentValue != null && typeof currentValue === 'string') {
        const parsed = parseArrayField(currentValue);
        updates[field] = parsed;
        modified = true;
      }
    }

    if (modified) {
      try {
        await Model.updateOne({ _id: doc._id }, { $set: updates });
        converted++;
        console.log(`  Converted ${modelName} ${doc._id}: ${Object.keys(updates).join(', ')}`);
      } catch (e) {
        errors++;
        console.error(`  Error updating ${modelName} ${doc._id}:`, e.message);
      }
    } else {
      skipped++;
    }

    if (scanned % 100 === 0) {
      console.log(`  Progress: ${scanned} scanned, ${converted} converted, ${skipped} skipped`);
    }
  }

  console.log(`${modelName} summary: ${scanned} scanned, ${converted} converted, ${skipped} skipped, ${errors} errors`);
  return { scanned, converted, skipped, errors };
}

async function main() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/kredibble';
  
  console.log('Starting SEC-037 String→[String] backfill...');
  console.log(`Connecting to ${mongoUri}...`);
  
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  const results = await Promise.all([
    backfillModel(SeekerProfile, SEEKER_FIELDS, 'SeekerProfile'),
    backfillModel(Candidate, CANDIDATE_FIELDS, 'Candidate'),
    backfillModel(Opportunity, OPPORTUNITY_FIELDS, 'Opportunity'),
  ]);

  const total = results.reduce((acc, r) => ({
    scanned: acc.scanned + r.scanned,
    converted: acc.converted + r.converted,
    skipped: acc.skipped + r.skipped,
    errors: acc.errors + r.errors,
  }), { scanned: 0, converted: 0, skipped: 0, errors: 0 });

  console.log('\n=== BACKFILL COMPLETE ===');
  console.log(`Total scanned: ${total.scanned}`);
  console.log(`Total converted: ${total.converted}`);
  console.log(`Total skipped: ${total.skipped}`);
  console.log(`Total errors: ${total.errors}`);

  if (total.errors > 0) {
    console.error('\n⚠️  Some errors occurred. Review logs above.');
    process.exit(1);
  } else {
    console.log('\n✅ Backfill completed successfully.');
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});