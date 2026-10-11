import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { ApiError } from '../utils/http.js';
import { Opportunity, opportunityTypes } from '../models/Platform.js';
import { Ambassador, SyncEvent, SYNC_EVENT_RESOURCES } from '../models/AdminPortal.js';
import { auditLog, AUDIT_ACTIONS } from './audit.js';

/**
 * Inbound website sync (BE-026) — the return path for the outbound
 * WordPress push (`syncToWordpress`). The website notifies the API of new or
 * changed content via a signed webhook; a scheduled pull (`scripts/website-pull.js`)
 * replays anything the webhook missed.
 *
 * Conflict rule (open question 5, resolved as proposed): the website is the
 * source of truth for *content* (titles, descriptions, profile fields) while
 * the app owns *activity and moderation state*. Concretely:
 * - Opportunities: content fields are overwritten, but `status`,
 *   `moderationStatus`, `vetted`, counters (`views`, `applications`,
 *   `applicantsCount`) and ownership (`createdBy`, `hirerId`) are never
 *   taken from the website. Inbound listings always land as unvetted drafts
 *   awaiting staff moderation (BE-011 invariant).
 * - Ambassadors: profile content is overwritten, but referral activity,
 *   `linkedUserId`, status lifecycle and dormancy stay app-owned.
 *
 * News has no store yet — its receiver plugs into SYNC_HANDLERS when BE-022
 * lands; the transport (signature, journal, retry) is resource-agnostic.
 */

export const WEBHOOK_SIGNATURE_VERSION = 'v1';
export const WEBHOOK_TIMESTAMP_HEADER = 'x-kredibble-timestamp';
export const WEBHOOK_SIGNATURE_HEADER = 'x-kredibble-signature';

const configuredSecret = () => {
  const secret = env.websiteWebhookSecret;
  return secret && !String(secret).includes('placeholder') ? String(secret) : null;
};

/** HMAC-SHA256 over `<timestamp>.<rawBody>`. Shared with the website plugin. */
export const signWebhookPayload = ({ timestamp, rawBody, secret }) =>
  `${WEBHOOK_SIGNATURE_VERSION}=${crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`;

/**
 * Verify an inbound webhook delivery. Every failure — unconfigured secret,
 * stale or missing timestamp, signature mismatch — answers 401 with the same
 * message, so callers (including the SEC-002 route-manifest sweep) can neither
 * reach the handler nor probe whether sync is configured.
 */
export function verifyWebhookRequest({ rawBody, signature, timestamp }) {
  const secret = configuredSecret();
  const ts = Number(timestamp);
  const fresh = Number.isFinite(ts) && Math.abs(Date.now() / 1000 - ts) <= env.websiteWebhookSkewSeconds;
  let valid = Boolean(secret) && fresh;
  if (valid) {
    const expected = signWebhookPayload({ timestamp: String(timestamp), rawBody, secret });
    const a = Buffer.from(expected);
    const b = Buffer.from(String(signature || ''));
    valid = a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  if (!valid) {
    throw new ApiError(401, 'Invalid webhook signature');
  }
  return true;
}

/** Persist the per-record sync state (status + last error) used by the admin panel. */
export const recordSyncState = async (document, { status, error = null }) => {
  document.wordpressSync = {
    ...document.wordpressSync?.toObject?.(),
    status,
    lastError: error || undefined,
    lastAttemptAt: new Date(),
  };
  await document.save();
};

const asDateOrUndefined = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

/** Normalize a website category into the Opportunity type enum. @throws {ApiError} 400 */
export const normalizeOpportunityType = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (opportunityTypes.includes(raw)) return raw;
  // Accept the obvious singular/plural swap (job <-> jobs) before failing.
  const swapped = raw.endsWith('s') ? raw.slice(0, -1) : `${raw}s`;
  if (opportunityTypes.includes(swapped)) return swapped;
  throw new ApiError(400, `Unknown opportunity type: ${value}`);
};

const OPPORTUNITY_CONTENT_FIELDS = [
  'title', 'type', 'company', 'offeringOrganization', 'organizationLogo', 'location',
  'description', 'workType', 'salary', 'experienceLevels', 'applicationUrl', 'applicationLink',
  'applyUrl', 'costLabel', 'durationLabel', 'format', 'country', 'deadline', 'closesAt',
  'eligibility', 'benefits', 'organizer', 'coverImage', 'logoUrl', 'imageUrl', 'images',
  'externalReferenceUrl', 'competitionCategory', 'prizeDetails', 'submissionRequirements',
  'fellowshipDuration', 'fellowshipFormat', 'stipendDetails', 'trainingFormat',
  'trainingDuration', 'registrationFee', 'certificateOffered', 'eventDateTime',
  'eventRegion', 'eventCategory', 'grantBudgetRange', 'grantSector',
];

/** Map website attributes onto Opportunity content fields (never moderation/activity). */
export function mapOpportunityAttributes(attributes = {}) {
  const mapped = {};
  for (const field of OPPORTUNITY_CONTENT_FIELDS) {
    if (attributes[field] !== undefined) mapped[field] = attributes[field];
  }
  if (mapped.type !== undefined) mapped.type = normalizeOpportunityType(mapped.type);
  if (mapped.deadline !== undefined) mapped.deadline = asDateOrUndefined(mapped.deadline);
  if (mapped.closesAt !== undefined) mapped.closesAt = asDateOrUndefined(mapped.closesAt);
  for (const required of ['title', 'company', 'location', 'description']) {
    if (!String(mapped[required] || '').trim()) {
      throw new ApiError(400, `Opportunity is missing required field: ${required}`);
    }
  }
  return mapped;
}

/** Idempotent opportunity upsert keyed by the website id. */
export async function applyOpportunitySync(externalId, attributes = {}) {
  if (!externalId) throw new ApiError(400, 'An external id is required');
  const content = mapOpportunityAttributes(attributes);
  let document = await Opportunity.findOne({ 'wordpressSync.wordpressId': String(externalId) });
  if (!document) {
    document = new Opportunity({
      ...content,
      status: 'draft',
      moderationStatus: 'pending',
      vetted: false,
      wordpressSync: { wordpressId: String(externalId), status: 'pending' },
    });
    await document.save();
    await recordSyncState(document, { status: 'synced' });
    return { document, created: true };
  }
  // Website owns content; moderation, ownership and counters stay app-owned.
  Object.assign(document, content);
  document.status = 'draft';
  document.moderationStatus = 'pending';
  document.vetted = false;
  document.vettedBy = undefined;
  document.vettedAt = undefined;
  document.publishedAt = undefined;
  await document.save();
  await recordSyncState(document, { status: 'synced' });
  return { document, created: false };
}

const AMBASSADOR_CONTENT_FIELDS = [
  'fullName', 'email', 'phone', 'country', 'city', 'profilePhoto', 'memberType',
  'description', 'roleTitle', 'campus',
];

/** Map website attributes onto Ambassador profile content (never activity). */
export function mapAmbassadorAttributes(attributes = {}) {
  const mapped = {};
  for (const field of AMBASSADOR_CONTENT_FIELDS) {
    if (attributes[field] !== undefined) mapped[field] = attributes[field];
  }
  if (!String(mapped.fullName || '').trim()) {
    throw new ApiError(400, 'Ambassador is missing required field: fullName');
  }
  if (!/^\S+@\S+\.\S+$/.test(String(mapped.email || ''))) {
    throw new ApiError(400, 'Ambassador requires a valid email');
  }
  mapped.email = String(mapped.email).trim().toLowerCase();
  return mapped;
}

/**
 * Idempotent ambassador upsert keyed by referral code (falling back to
 * email so pre-existing ambassadors get linked, not duplicated). Profile
 * content is overwritten; referral activity, linked user, status lifecycle
 * and dormancy stay app-owned.
 */
export async function applyAmbassadorSync(externalId, attributes = {}) {
  const referralCode = String(externalId || '').trim().toUpperCase();
  if (!referralCode) throw new ApiError(400, 'A referral code is required');
  const content = mapAmbassadorAttributes(attributes);
  let document = await Ambassador.findOne({ referralCode });
  if (!document && content.email) {
    // Link by email so pre-existing ambassadors are not duplicated. The
    // website's code is the published one, so it replaces any placeholder
    // code (a code already held by someone else fails visibly for retry).
    document = await Ambassador.findOne({ email: content.email });
    if (document) {
      const clash = await Ambassador.findOne({ referralCode, _id: { $ne: document._id } }).lean();
      if (clash) throw new ApiError(400, `Referral code ${referralCode} is already in use`);
      document.referralCode = referralCode;
    }
  }
  if (!document) {
    document = new Ambassador({
      ...content,
      referralCode,
      status: ['applicant', 'onboarding', 'active', 'dormant'].includes(attributes.status) ? attributes.status : 'active',
      wordpressSync: { wordpressId: attributes.wordpressId ? String(attributes.wordpressId) : undefined, status: 'pending' },
    });
    await document.save();
    await recordSyncState(document, { status: 'synced' });
    return { document, created: true };
  }
  Object.assign(document, content);
  if (!document.referralCode) document.referralCode = referralCode;
  if (attributes.wordpressId && !document.wordpressSync?.wordpressId) {
    document.wordpressSync = { ...document.wordpressSync?.toObject?.(), wordpressId: String(attributes.wordpressId) };
  }
  await document.save();
  await recordSyncState(document, { status: 'synced' });
  return { document, created: false };
}

export const SYNC_HANDLERS = {
  opportunity: applyOpportunitySync,
  ambassador: applyAmbassadorSync,
};

/**
 * Journal then apply one inbound sync event. Duplicate `eventId`s return
 * `{ duplicate: true }` without touching data (safe webhook retries).
 * Validation/upsert failures are recorded on the event (`failed`) and
 * re-thrown so the caller returns the right status.
 */
export async function applySyncEvent({ eventId, resource, externalId, attributes = {}, source = 'webhook', auditContext = null }) {
  if (!SYNC_EVENT_RESOURCES.includes(resource)) {
    throw new ApiError(400, `Unknown sync resource: ${resource}`);
  }
  if (!eventId || !externalId) {
    throw new ApiError(400, 'eventId and externalId are required');
  }
  const existing = await SyncEvent.findOne({ eventId: String(eventId) }).lean();
  if (existing) return { duplicate: true, event: existing };

  const event = await SyncEvent.create({
    eventId: String(eventId),
    resource,
    externalId: String(externalId),
    status: 'received',
    attributes,
    source,
  });

  try {
    const handler = SYNC_HANDLERS[resource];
    const { document, created } = await handler(String(externalId), attributes || {});
    event.status = 'applied';
    event.appliedAt = new Date();
    await event.save();
    await auditLog({
      actorRole: 'anonymous',
      action: AUDIT_ACTIONS.WEBSITE_SYNC_EVENT,
      resourceType: resource,
      resourceId: document._id,
      outcome: 'success',
      requestId: auditContext?.requestId || null,
      metadata: { eventId: event.eventId, externalId: event.externalId, source, created },
    });
    return { duplicate: false, event, document, created };
  } catch (error) {
    event.status = 'failed';
    event.error = error.message || 'Sync failed';
    await event.save();
    await auditLog({
      actorRole: 'anonymous',
      action: AUDIT_ACTIONS.WEBSITE_SYNC_EVENT,
      resourceType: resource,
      outcome: 'failure',
      requestId: auditContext?.requestId || null,
      metadata: { eventId: event.eventId, externalId: event.externalId, source, error: event.error },
    });
    throw error;
  }
}

/** Re-run a failed event with its stored attributes (admin retry). */
export async function retrySyncEvent(eventId, auditContext = null) {
  const event = await SyncEvent.findOne({ eventId: String(eventId) });
  if (!event) throw new ApiError(404, 'Sync event not found');
  if (event.status === 'applied') return { event, noop: true };
  const handler = SYNC_HANDLERS[event.resource];
  if (!handler) throw new ApiError(400, `Unknown sync resource: ${event.resource}`);
  try {
    const { document } = await handler(event.externalId, event.attributes || {});
    event.status = 'applied';
    event.error = null;
    event.appliedAt = new Date();
    await event.save();
    await auditLog({
      action: AUDIT_ACTIONS.WEBSITE_SYNC_EVENT,
      resourceType: event.resource,
      resourceId: document._id,
      outcome: 'success',
      requestId: auditContext?.requestId || null,
      metadata: { eventId: event.eventId, externalId: event.externalId, retried: true },
    });
    return { event, document, noop: false };
  } catch (error) {
    event.status = 'failed';
    event.error = error.message || 'Sync failed';
    await event.save();
    throw error;
  }
}
