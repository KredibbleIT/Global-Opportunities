/**
 * Migration 003: Backfill app registrations into the admin Database (GOD-T3)
 *
 * Seekers who registered before registration started creating a Database record (lib/app-beneficiaries.js) get one now:
 * origin 'app', linked by userId, or, when staff already added the same email, that record is linked instead of copied.
 * Deleted accounts (role 'deleted') are skipped. Safe to re-run: ensureAppBeneficiary does nothing for a linked user.
 */
import { User } from '../src/models/User.js';
import { SeekerProfile } from '../src/models/Profiles.js';
import { ensureAppBeneficiary } from '../src/lib/app-beneficiaries.js';

export const id = '003_backfill_app_beneficiaries';

/**
 * Creates or links one Database record per live seeker account.
 * @returns {Promise<{ success: true, seekers: number, created: number, linked: number, existing: number }>}
 */
export async function up(_db, _mongoose) {
  const counts = { created: 0, linked: 0, existing: 0 };
  const seekers = await User.find({ role: 'seeker' }).select('_id name email').lean();
  for (const user of seekers) {
    const profile = await SeekerProfile.findOne({ userId: user._id }).select('phone country university').lean();
    const { action } = await ensureAppBeneficiary(user, profile);
    counts[action] += 1;
  }
  return { success: true, seekers: seekers.length, ...counts };
}

export async function down(_db, _mongoose) {
  // Not reversible: a linked staff record and an app record verified since look the same as before the backfill.
  return { success: true };
}
