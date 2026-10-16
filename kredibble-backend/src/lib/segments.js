import { User } from '../models/User.js';
import { ApiError } from '../utils/http.js';
import { auditLog, auditReq, AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from './audit.js';

/**
 * Stakeholder segments (BE-023).
 *
 * Every user belongs to the `general` stakeholder community. Approved
 * ambassadors additionally belong to the `ambassador` segment, so an
 * ambassador always sees general content too (open question 7, resolved
 * as: a user can be in both at once). Channels carry the segment(s) they
 * are visible to; callers only list channels intersecting their own
 * effective segments (membership, ownership and admin override).
 */

export const GENERAL_SEGMENT = 'general';
export const AMBASSADOR_SEGMENT = 'ambassador';
export const SEGMENTS = [GENERAL_SEGMENT, AMBASSADOR_SEGMENT];

/** Stored segment, defaulting missing/legacy documents to `general`. */
export const storedSegment = (user) => user?.segment || GENERAL_SEGMENT;

/**
 * Effective segments for access checks. Ambassadors belong to both
 * communities; everyone else (including legacy documents without the
 * field) sees the general community only.
 */
export const resolveSegments = (user) =>
  storedSegment(user) === AMBASSADOR_SEGMENT
    ? [GENERAL_SEGMENT, AMBASSADOR_SEGMENT]
    : [GENERAL_SEGMENT];

/** Segments stored on a channel, defaulting legacy channels to general. */
export const channelSegments = (channel) =>
  Array.isArray(channel?.segments) && channel.segments.length > 0
    ? channel.segments
    : [GENERAL_SEGMENT];

/** Whether any of the caller's effective segments intersects the channel's. */
export const sharesSegment = (callerSegments, channel) => {
  const mine = new Set(callerSegments?.length ? callerSegments : [GENERAL_SEGMENT]);
  return channelSegments(channel).some((segment) => mine.has(segment));
};

/**
 * Mongo clause matching channels visible to `effectiveSegments`.
 * Legacy channels stored before BE-023 have no `segments` field and count
 * as general, so they stay visible to everyone with or without migration 002.
 */
export const segmentsClause = (effective, extraOr = []) => ({
  $or: [
    { segments: { $in: effective?.length ? effective : [GENERAL_SEGMENT] } },
    { segments: { $exists: false } },
    ...extraOr,
  ],
});

/**
 * Validate a caller-supplied segments array (channel create/update).
 * @throws {ApiError} 400 when the value is not a non-empty array of known segments.
 */
export const normalizeSegments = (value) => {
  const list = Array.isArray(value) ? value : [value];
  const cleaned = [...new Set(list.map((segment) => String(segment).trim().toLowerCase()))];
  if (cleaned.length === 0 || cleaned.some((segment) => !SEGMENTS.includes(segment))) {
    throw new ApiError(400, `segments must be a non-empty array of: ${SEGMENTS.join(', ')}`);
  }
  return cleaned;
};

/** Validate a single stored user segment. @throws {ApiError} 400 on unknown values. */
export const normalizeSegment = (value) => {
  const segment = String(value ?? '').trim().toLowerCase();
  if (!SEGMENTS.includes(segment)) {
    throw new ApiError(400, `segment must be one of: ${SEGMENTS.join(', ')}`);
  }
  return segment;
};

/** Load the caller's stored segment for access checks (defaults to general). */
export const callerSegment = async (userId) => {
  if (!userId) return GENERAL_SEGMENT;
  const user = await User.findById(userId).select('segment').lean();
  return storedSegment(user);
};

/** Effective segments for a caller id (an ambassador belongs to both). */
export const callerSegments = async (userId) => resolveSegments({ segment: await callerSegment(userId) });

/**
 * Move a user between stakeholder segments with an audit trail.
 * Idempotent: moving to the current segment returns `{ changed: false }`
 * and writes no audit row.
 */
export async function moveUserSegment(userId, toSegment, { actorId = null, reason = null, req = null } = {}) {
  const next = normalizeSegment(toSegment);
  const user = await User.findById(userId).select('segment role');
  if (!user || user.role === 'deleted') throw new ApiError(404, 'User not found');
  const previous = storedSegment(user);
  if (previous === next) return { user, previous, segment: next, changed: false };

  user.segment = next;
  await user.save();

  const entry = {
    actorId,
    action: AUDIT_ACTIONS.SEGMENT_CHANGE,
    resourceType: AUDIT_RESOURCE_TYPES.USER,
    resourceId: user._id,
    outcome: 'success',
    metadata: { previous, segment: next, ...(reason ? { reason } : {}) },
  };
  if (req) await auditReq(req, entry);
  else await auditLog(entry);

  return { user, previous, segment: next, changed: true };
}
