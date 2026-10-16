import crypto from 'node:crypto';
import { env } from '../config/env.js';

// BE-028: team invite token helpers. The raw token is 32 random bytes (64
// hex chars) shown once in the invite link; only the keyed HMAC hash is
// stored, so a database read alone cannot mint or brute-force invites.

export const INVITE_HOURS = 48;

/** Keyed HMAC-SHA256 (same construction as verification/reset codes). */
export const hashInviteToken = (token) =>
  crypto.createHmac('sha256', env.jwtSecret).update(String(token)).digest('hex');

export const mintInviteToken = () => crypto.randomBytes(32).toString('hex');

/** Constant-time comparison of two hex digests. */
export const inviteTokensMatch = (a, b) => {
  const left = Buffer.from(String(a), 'hex');
  const right = Buffer.from(String(b), 'hex');
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
};
