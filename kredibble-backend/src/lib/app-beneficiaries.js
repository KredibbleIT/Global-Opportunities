/**
 * App registrations in the admin Database (GOD-T3).
 *
 * The admin review found registered app users missing from the Database (Seekers listed five accounts, the Database none):
 * the Database lists Beneficiary records, and only staff created those. A seeker's registration now creates one, marked
 * origin 'app' and linked by userId; migration 003 does the same for the accounts that registered before.
 *
 * Copy-on-write rather than a read-time merge of two collections: verification (verified / verifiedAt) needs a record to
 * live on, the "Beneficiaries verified" KPI and the pace gauge already count Beneficiary records, and the Database list
 * keeps its server-side paging, search and filters. The cost is a second copy of a few profile fields, so account
 * deletion and the data export include it (userDataFilters.beneficiaries).
 *
 * Idempotent, and never a duplicate:
 * 1. a record already linked to the user: nothing to do;
 * 2. a record with the same email (staff added the person first): link it (userId), keep its origin, source and verification;
 * 3. otherwise: create { origin 'app', source 'organic', verified false }.
 */
import { Beneficiary, normalizeEmail } from '../models/AdminPortal.js';

/**
 * Makes sure the seeker has one Database record.
 * @param {{ _id: unknown, name?: string, email?: string }} user the User document
 * @param {{ phone?: string, country?: string, university?: string } | null | undefined} profile the SeekerProfile, when known
 * @returns {Promise<{ action: 'existing' | 'linked' | 'created', id: string }>}
 */
export async function ensureAppBeneficiary(user, profile) {
  const linked = await Beneficiary.findOne({ userId: user._id }).select('_id').lean();
  if (linked) return { action: 'existing', id: String(linked._id) };

  const email = normalizeEmail(user.email);
  if (email) {
    const sameEmail = await Beneficiary.findOneAndUpdate(
      { email, $or: [{ userId: { $exists: false } }, { userId: null }] },
      { $set: { userId: user._id } },
      { new: true },
    ).select('_id').lean();
    if (sameEmail) return { action: 'linked', id: String(sameEmail._id) };
  }

  // phoneNormalized and createdAtDate are filled in by the model's pre-save hook.
  const record = await Beneficiary.create({
    fullName: user.name || email || 'App user',
    email: email || undefined,
    phone: profile?.phone ? String(profile.phone).trim() : undefined,
    country: profile?.country || undefined,
    institution: profile?.university || undefined,
    source: 'organic',
    origin: 'app',
    userId: user._id,
    verified: false,
  });
  return { action: 'created', id: String(record._id) };
}
