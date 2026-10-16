/**
 * Migration 002: Backfill Stakeholder Segments (BE-023)
 *
 * Idempotently defaults every pre-existing user to the `general` segment
 * and every pre-existing channel to `['general']`, and ensures the indexes
 * the segment filters read by. Safe to re-run: only documents missing the
 * field are touched.
 */

export const id = '002_backfill_segments';

export async function up(db, _mongoose) {
  const users = db.collection('users');
  await users.createIndex({ segment: 1 });
  const userResult = await users.updateMany(
    { segment: { $exists: false } },
    { $set: { segment: 'general' } },
  );

  const channels = db.collection('channels');
  await channels.createIndex({ segments: 1 });
  const channelResult = await channels.updateMany(
    { segments: { $exists: false } },
    { $set: { segments: ['general'] } },
  );

  return {
    success: true,
    usersBackfilled: userResult.modifiedCount,
    channelsBackfilled: channelResult.modifiedCount,
  };
}

export async function down(_db, _mongoose) {
  // Backfill is not reversible (the previous absence is unrecoverable).
  return { success: true };
}
