import crypto from 'node:crypto';
import { JobLock } from '../models/AdminPortal.js';

const DUPLICATE_KEY = 11000;

/**
 * Takes the named lock for `ttlMs`, or returns null when someone else holds
 * it. Works across API instances: a free or expired lock is taken by one
 * atomic update, and when the lock is held the upsert tries to insert a second
 * row with the same `_id`, which MongoDB refuses (duplicate key). The lease
 * expires on its own, so a crashed holder never blocks the next caller for
 * longer than `ttlMs`.
 *
 * @param {string} name - lock name, e.g. 'ambassador-import'
 * @param {number} ttlMs - how long the lease lasts if it is never released
 * @returns {Promise<{ name: string, holder: string } | null>}
 */
export async function acquireLock(name, ttlMs) {
  const holder = crypto.randomUUID();
  const now = new Date();
  try {
    await JobLock.findOneAndUpdate(
      { _id: name, lockedUntil: { $lte: now } },
      { $set: { holder, lockedUntil: new Date(now.getTime() + ttlMs) } },
      { upsert: true, returnDocument: 'after' },
    );
    return { name, holder };
  } catch (error) {
    if (error?.code === DUPLICATE_KEY) return null;
    throw error;
  }
}

/**
 * Releases a lock taken by acquireLock. Only the holder's own lease is
 * removed, so a release after the lease expired (and someone else took it)
 * does nothing.
 *
 * @param {{ name: string, holder: string }} lease
 * @returns {Promise<void>}
 */
export async function releaseLock(lease) {
  await JobLock.deleteOne({ _id: lease.name, holder: lease.holder });
}
