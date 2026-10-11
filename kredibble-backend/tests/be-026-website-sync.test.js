import request from 'supertest';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { User, AuditLog } from '../src/models/User.js';
import { Opportunity } from '../src/models/Platform.js';
import { Ambassador, AmbassadorAmplification, SyncEvent } from '../src/models/AdminPortal.js';
import { signAdminToken, signToken } from '../src/middleware/auth.js';
import {
  signWebhookPayload,
  verifyWebhookRequest,
  retrySyncEvent,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
} from '../src/lib/website-sync.js';

const api = (path) => `/api/v1${path}`;
const bearer = (user) => ({ Authorization: `Bearer ${signToken(user)}` });
const adminCookie = (admin) => `kredibble_admin_token=${signAdminToken(admin)}`;

const TEST_SECRET = 'website-webhook-test-secret-0123456789abcdef';

const createAdmin = () => User.create({ name: 'Ada Admin', email: 'ada@example.com', role: 'admin', passwordHash: 'x' });
const createSeeker = (email = 'ama@example.com') =>
  User.create({ name: 'Ama Mensah', email, role: 'seeker', passwordHash: 'x' });

const opportunityAttrs = (overrides = {}) => ({
  title: 'Ghana Tech Fellowship',
  type: 'fellowship',
  company: 'Ghana Tech Lab',
  location: 'Accra',
  description: 'A twelve-week fellowship for builders.',
  deadline: '2026-12-31',
  applyUrl: 'https://example.com/apply',
  ...overrides,
});

const ambassadorAttrs = (overrides = {}) => ({
  fullName: 'Kofi Boateng',
  email: 'kofi@example.com',
  phone: '+233201112222',
  country: 'Ghana',
  city: 'Kumasi',
  campus: 'KNUST',
  ...overrides,
});

/** POST a signed webhook delivery with byte-exact raw-body signing. */
const deliver = ({ eventId, resource, externalId, attributes, secret = TEST_SECRET, timestamp, rawOverrides } = {}) => {
  const payload = { eventId, resource, externalId, attributes, ...rawOverrides };
  const rawBody = JSON.stringify(payload);
  const ts = timestamp !== undefined ? timestamp : String(Math.floor(Date.now() / 1000));
  const signature = signWebhookPayload({ timestamp: ts, rawBody, secret });
  return request(app)
    .post(api('/sync/website-webhook'))
    .set(WEBHOOK_SIGNATURE_HEADER, signature)
    .set(WEBHOOK_TIMESTAMP_HEADER, ts)
    .set('Content-Type', 'application/json')
    .send(rawBody);
};

beforeAll(() => {
  env.websiteWebhookSecret = TEST_SECRET;
});

describe('BE-026 webhook signature', () => {
  it('round-trips a valid signature and rejects tampering, staleness and misconfiguration', () => {
    const rawBody = JSON.stringify({ hello: 'world' });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signWebhookPayload({ timestamp, rawBody, secret: TEST_SECRET });

    const expect401 = (fn) => {
      try {
        fn();
      } catch (error) {
        expect(error.status || error.statusCode).toBe(401);
        return;
      }
      throw new Error('expected a 401 ApiError');
    };

    expect(verifyWebhookRequest({ rawBody, signature, timestamp })).toBe(true);
    expect401(() => verifyWebhookRequest({ rawBody: `${rawBody} `, signature, timestamp }));
    expect401(() => verifyWebhookRequest({ rawBody, signature: 'v1=deadbeef', timestamp }));
    expect401(() => verifyWebhookRequest({ rawBody, signature, timestamp: '1' }));
    expect401(() => verifyWebhookRequest({ rawBody, signature, timestamp: 'not-a-time' }));

    env.websiteWebhookSecret = undefined;
    expect401(() => verifyWebhookRequest({ rawBody, signature, timestamp }));
    env.websiteWebhookSecret = TEST_SECRET;
  });

  it('answers 401 to anonymous, unsigned, stale and tampered deliveries', async () => {
    const anon = await request(app).post(api('/sync/website-webhook')).send({});
    expect(anon.status).toBe(401);

    const stale = await deliver({
      eventId: 'evt-stale', resource: 'opportunity', externalId: 'wp-1',
      attributes: opportunityAttrs(), timestamp: '1',
    });
    expect(stale.status).toBe(401);

    const wrongSecret = await deliver({
      eventId: 'evt-bad-secret', resource: 'opportunity', externalId: 'wp-1',
      attributes: opportunityAttrs(), secret: 'wrong-secret',
    });
    expect(wrongSecret.status).toBe(401);
    expect(await SyncEvent.countDocuments()).toBe(0);
  });
});

describe('BE-026 opportunity inbound', () => {
  it('creates unvetted drafts with sync state and journals the event', async () => {
    const res = await deliver({
      eventId: 'evt-opp-1', resource: 'opportunity', externalId: 'wp-1001', attributes: opportunityAttrs(),
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'applied', eventId: 'evt-opp-1', created: true });

    const doc = await Opportunity.findOne({ 'wordpressSync.wordpressId': 'wp-1001' }).lean();
    expect(doc).toMatchObject({ title: 'Ghana Tech Fellowship', status: 'draft', moderationStatus: 'pending', vetted: false });
    expect(doc.wordpressSync.status).toBe('synced');

    const event = await SyncEvent.findOne({ eventId: 'evt-opp-1' }).lean();
    expect(event).toMatchObject({ resource: 'opportunity', externalId: 'wp-1001', status: 'applied', source: 'webhook' });
    expect(await AuditLog.countDocuments({ action: 'website_sync.event', outcome: 'success' })).toBe(1);
  });

  it('is idempotent on eventId and upserts on externalId without republishing', async () => {
    await deliver({ eventId: 'evt-opp-2', resource: 'opportunity', externalId: 'wp-1002', attributes: opportunityAttrs() });
    const doc = await Opportunity.findOne({ 'wordpressSync.wordpressId': 'wp-1002' });
    await Opportunity.findByIdAndUpdate(doc._id, {
      $set: { 'views.website': 41, 'applications.app': 7, createdBy: doc._id },
      $inc: { applicantsCount: 3 },
    });

    const duplicate = await deliver({ eventId: 'evt-opp-2', resource: 'opportunity', externalId: 'wp-1002', attributes: opportunityAttrs() });
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.data.status).toBe('duplicate');
    expect(await Opportunity.countDocuments({ 'wordpressSync.wordpressId': 'wp-1002' })).toBe(1);

    // A new event for the same website id updates content but keeps
    // app-owned moderation, ownership and counters.
    const update = await deliver({
      eventId: 'evt-opp-3', resource: 'opportunity', externalId: 'wp-1002',
      attributes: opportunityAttrs({ title: 'Ghana Tech Fellowship 2.0', status: 'published', vetted: true }),
    });
    expect(update.body.data).toMatchObject({ status: 'applied', created: false });
    const after = await Opportunity.findOne({ 'wordpressSync.wordpressId': 'wp-1002' }).lean();
    expect(after).toMatchObject({
      title: 'Ghana Tech Fellowship 2.0',
      status: 'draft',
      moderationStatus: 'pending',
      vetted: false,
      applicantsCount: 3,
    });
    expect(after.views.website).toBe(41);
    expect(after.applications.app).toBe(7);
  });

  it('fails events with missing fields or unknown types for admin retry', async () => {
    const missing = await deliver({
      eventId: 'evt-opp-bad', resource: 'opportunity', externalId: 'wp-1003',
      attributes: opportunityAttrs({ title: '' }),
    });
    expect(missing.status).toBe(400);

    const unknownType = await deliver({
      eventId: 'evt-opp-bad-type', resource: 'opportunity', externalId: 'wp-1004',
      attributes: opportunityAttrs({ type: 'teleportation' }),
    });
    expect(unknownType.status).toBe(400);

    const event = await SyncEvent.findOne({ eventId: 'evt-opp-bad' }).lean();
    expect(event).toMatchObject({ status: 'failed' });
    expect(event.error).toMatch(/title/);
    expect(await Opportunity.countDocuments({ 'wordpressSync.wordpressId': 'wp-1003' })).toBe(0);
  });

  it('rejects unknown resources and malformed payloads', async () => {
    const unknown = await deliver({
      eventId: 'evt-nope', resource: 'spaceship', externalId: 'x-1', attributes: {},
    });
    expect(unknown.status).toBe(400);
    expect(await SyncEvent.countDocuments({ eventId: 'evt-nope' })).toBe(0);
  });
});

describe('BE-026 ambassador inbound', () => {
  it('creates by referral code and preserves app-owned activity on update', async () => {
    const created = await deliver({
      eventId: 'evt-amb-1', resource: 'ambassador', externalId: 'GOD-ABC123', attributes: ambassadorAttrs(),
    });
    expect(created.body.data).toMatchObject({ status: 'applied', created: true });
    const doc = await Ambassador.findOne({ referralCode: 'GOD-ABC123' }).lean();
    expect(doc).toMatchObject({ fullName: 'Kofi Boateng', status: 'active' });

    // App-owned activity must survive a website re-delivery.
    const user = await createSeeker();
    await Ambassador.updateOne({ referralCode: 'GOD-ABC123' }, { $set: { linkedUserId: user._id, tier: 'senior' } });
    await AmbassadorAmplification.create({ ambassadorId: doc._id, channel: 'whatsapp', clicks: 12 });
    const updated = await deliver({
      eventId: 'evt-amb-2', resource: 'ambassador', externalId: 'GOD-ABC123',
      attributes: ambassadorAttrs({ phone: '+233209998887', tier: 'lead' }),
    });
    expect(updated.body.data.created).toBe(false);
    const after = await Ambassador.findOne({ referralCode: 'GOD-ABC123' }).lean();
    expect(after.phone).toBe('+233209998887');
    expect(String(after.linkedUserId)).toBe(String(user._id));
    expect(after.tier).toBe('senior');
    expect(await AmbassadorAmplification.countDocuments({ ambassadorId: doc._id })).toBe(1);
  });

  it('links pre-existing ambassadors by email instead of duplicating', async () => {
    await Ambassador.create({ fullName: 'Kofi Boateng', email: 'kofi@example.com', memberType: 'graduate', status: 'active' });
    const res = await deliver({
      eventId: 'evt-amb-3', resource: 'ambassador', externalId: 'GOD-XYZ789', attributes: ambassadorAttrs(),
    });
    expect(res.status).toBe(201);
    expect(await Ambassador.countDocuments({ email: 'kofi@example.com' })).toBe(1);
    expect((await Ambassador.findOne({ email: 'kofi@example.com' }).lean()).referralCode).toBe('GOD-XYZ789');
  });
});

describe('BE-026 admin sync events', () => {
  it('lists events with filters and retries failures', async () => {
    const admin = await createAdmin();
    const seeker = await createSeeker();
    await deliver({ eventId: 'evt-list-1', resource: 'opportunity', externalId: 'wp-2001', attributes: opportunityAttrs() });
    await deliver({ eventId: 'evt-list-2', resource: 'opportunity', externalId: 'wp-2002', attributes: opportunityAttrs({ title: '' }) });

    const all = await request(app).get(api('/admin/sync/events')).set('Cookie', adminCookie(admin));
    expect(all.status).toBe(200);
    expect(all.body.data).toHaveLength(2);

    const failed = await request(app).get(api('/admin/sync/events?status=failed')).set('Cookie', adminCookie(admin));
    expect(failed.body.data.map((e) => e.eventId)).toEqual(['evt-list-2']);

    expect((await request(app).get(api('/admin/sync/events')).set(bearer(seeker))).status).toBe(403);
    expect((await request(app).get(api('/admin/sync/events'))).status).toBe(401);

    // Retrying the still-invalid payload fails again and stays failed.
    const retryFailed = await request(app).post(api('/admin/sync/events/evt-list-2/retry')).set('Cookie', adminCookie(admin)).send({});
    expect(retryFailed.status).toBe(400);
    expect((await SyncEvent.findOne({ eventId: 'evt-list-2' }).lean()).status).toBe('failed');

    // Retrying an applied event is a no-op.
    const noop = await request(app).post(api('/admin/sync/events/evt-list-1/retry')).set('Cookie', adminCookie(admin)).send({});
    expect(noop.status).toBe(200);
    expect(noop.body.data.retried).toBe(false);

    expect((await request(app).post(api('/admin/sync/events/nope/retry')).set('Cookie', adminCookie(admin)).send({})).status).toBe(404);
  });

  it('retries a corrected event to applied at the lib level', async () => {
    await SyncEvent.create({
      eventId: 'evt-retry-ok', resource: 'opportunity', externalId: 'wp-3001',
      status: 'failed', error: 'boom', attributes: opportunityAttrs(), source: 'webhook',
    });
    const { event, noop } = await retrySyncEvent('evt-retry-ok');
    expect(noop).toBe(false);
    expect(event.status).toBe('applied');
    expect(await Opportunity.countDocuments({ 'wordpressSync.wordpressId': 'wp-3001' })).toBe(1);
  });
});
