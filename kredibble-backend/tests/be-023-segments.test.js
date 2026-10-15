import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../src/app.js';
import { User, AuditLog } from '../src/models/User.js';
import { Channel, ChannelPost, CommunityMembership } from '../src/models/Community.js';
import { signAdminToken, signToken } from '../src/middleware/auth.js';
import {
  resolveSegments,
  sharesSegment,
  segmentsClause,
  normalizeSegments,
  moveUserSegment,
} from '../src/lib/segments.js';
import { up as backfillSegments } from '../migrations/002_backfill_segments.js';

const api = (path) => `/api/v1${path}`;
const bearer = (user) => ({ Authorization: `Bearer ${signToken(user)}` });
const adminCookie = (admin) => `kredibble_admin_token=${signAdminToken(admin)}`;

const createAdmin = () => User.create({ name: 'Ada Admin', email: 'ada@example.com', role: 'admin', passwordHash: 'x' });
const createSeeker = (email = 'ama@example.com') =>
  User.create({ name: 'Ama Mensah', email, role: 'seeker', passwordHash: 'x' });

const applyAs = (user) =>
  request(app).post(api('/ambassador-requests')).set(bearer(user)).send({
    motivation: 'I would love to represent Kredibble at my campus and beyond',
  });

describe('BE-023 segments library', () => {
  it('defaults missing users to the general segment; ambassadors belong to both', () => {
    expect(resolveSegments(null)).toEqual(['general']);
    expect(resolveSegments({})).toEqual(['general']);
    expect(resolveSegments({ segment: 'general' })).toEqual(['general']);
    expect(resolveSegments({ segment: 'ambassador' })).toEqual(['general', 'ambassador']);
  });

  it('matches channels with a shared segment and treats legacy channels as general', () => {
    expect(sharesSegment(['general'], { segments: ['general'] })).toBe(true);
    expect(sharesSegment(['general'], { segments: ['ambassador'] })).toBe(false);
    expect(sharesSegment(['general', 'ambassador'], { segments: ['ambassador'] })).toBe(true);
    expect(sharesSegment(['general'], {})).toBe(true);
  });

  it('builds a legacy-safe mongo clause', () => {
    const clause = segmentsClause(['general']);
    expect(clause.$or).toHaveLength(2);
    expect(clause.$or[1]).toEqual({ segments: { $exists: false } });
  });

  it('validates caller-supplied segments', () => {
    expect(normalizeSegments(['ambassador'])).toEqual(['ambassador']);
    expect(normalizeSegments('general')).toEqual(['general']);
    expect(() => normalizeSegments([])).toThrow(/segments must be/);
    expect(() => normalizeSegments(['everyone'])).toThrow(/segments must be/);
  });
});

describe('BE-023 user segment field', () => {
  it('defaults new users to general and rejects unknown segments', async () => {
    const user = await createSeeker();
    expect(user.segment).toBe('general');

    user.segment = 'everyone';
    await expect(user.save()).rejects.toThrow();
  });

  it('migration 002 backfills raw documents missing the field', async () => {
    const db = mongoose.connection.db;
    const { insertedId } = await db.collection('users').insertOne({
      name: 'Legacy User',
      email: 'legacy@example.com',
      emailNormalized: 'legacy@example.com',
      role: 'seeker',
    });
    await db.collection('channels').insertOne({ name: 'Legacy', category: 'General' });

    const result = await backfillSegments(db);
    expect(result.success).toBe(true);

    expect((await User.findById(insertedId).lean()).segment).toBe('general');
    expect((await Channel.findOne({ name: 'Legacy' }).lean()).segments).toEqual(['general']);

    // Idempotent: a second run changes nothing.
    const again = await backfillSegments(db);
    expect(again.usersBackfilled).toBe(0);
    expect(again.channelsBackfilled).toBe(0);
  });

  it('exposes segment on GET /auth/me', async () => {
    const user = await createSeeker();
    const res = await request(app).get(api('/auth/me')).set(bearer(user));
    expect(res.status).toBe(200);
    expect(res.body.data.segment).toBe('general');
  });
});

describe('BE-023 ambassador approval flips the segment (audited)', () => {
  it('approve moves to ambassador; revoke moves back; both write audit rows', async () => {
    const admin = await createAdmin();
    const user = await createSeeker();
    const pending = (await applyAs(user)).body.data;

    const approved = await request(app)
      .post(api(`/admin/ambassador-requests/${pending.id}/approve`))
      .set('Cookie', adminCookie(admin))
      .send({});
    expect(approved.status).toBe(200);
    expect((await User.findById(user._id).lean()).segment).toBe('ambassador');

    const approveAudit = await AuditLog.findOne({ action: 'user.segment.change', resourceId: user._id }).lean();
    expect(approveAudit).toMatchObject({ outcome: 'success' });
    expect(approveAudit.metadata).toMatchObject({ previous: 'general', segment: 'ambassador' });

    const revoked = await request(app)
      .post(api(`/admin/ambassador-requests/${pending.id}/revoke`))
      .set('Cookie', adminCookie(admin))
      .send({});
    expect(revoked.status).toBe(200);
    expect((await User.findById(user._id).lean()).segment).toBe('general');

    const audits = await AuditLog.find({ action: 'user.segment.change', resourceId: user._id }).lean();
    expect(audits).toHaveLength(2);
    expect(audits[1].metadata).toMatchObject({ previous: 'ambassador', segment: 'general' });
  });

  it('reject leaves the segment alone and writes no segment audit', async () => {
    const admin = await createAdmin();
    const user = await createSeeker();
    const pending = (await applyAs(user)).body.data;

    const rejected = await request(app)
      .post(api(`/admin/ambassador-requests/${pending.id}/reject`))
      .set('Cookie', adminCookie(admin))
      .send({});
    expect(rejected.status).toBe(200);
    expect((await User.findById(user._id).lean()).segment).toBe('general');
    expect(await AuditLog.countDocuments({ action: 'user.segment.change' })).toBe(0);
  });
});

describe('BE-023 manual segment moves', () => {
  it('admin moves a user; same-value moves are a no-op without audit', async () => {
    const admin = await createAdmin();
    const user = await createSeeker();

    const moved = await request(app)
      .patch(api(`/admin/users/${user._id}/segment`))
      .set('Cookie', adminCookie(admin))
      .send({ segment: 'ambassador', reason: 'joined via campus drive' });
    expect(moved.status).toBe(200);
    expect(moved.body.data).toMatchObject({ previous: 'general', segment: 'ambassador', changed: true });
    expect((await User.findById(user._id).lean()).segment).toBe('ambassador');

    const noop = await request(app)
      .patch(api(`/admin/users/${user._id}/segment`))
      .set('Cookie', adminCookie(admin))
      .send({ segment: 'ambassador' });
    expect(noop.body.data.changed).toBe(false);
    expect(await AuditLog.countDocuments({ action: 'user.segment.change' })).toBe(1);
  });

  it('rejects unauthenticated, non-admin and invalid callers', async () => {
    const admin = await createAdmin();
    const user = await createSeeker();
    const other = await createSeeker('kofi@example.com');

    expect((await request(app).patch(api(`/admin/users/${user._id}/segment`)).send({ segment: 'ambassador' })).status).toBe(401);
    // Authenticated but without staff access: forbidden, not unauthenticated.
    expect((await request(app).patch(api(`/admin/users/${user._id}/segment`)).set(bearer(other)).send({ segment: 'ambassador' })).status).toBe(403);
    expect(
      (await request(app).patch(api(`/admin/users/${user._id}/segment`)).set('Cookie', adminCookie(admin)).send({ segment: 'everyone' })).status,
    ).toBe(400);
    expect(
      (await request(app).patch(api('/admin/users/0123456789abcdef01234567/segment')).set('Cookie', adminCookie(admin)).send({ segment: 'ambassador' })).status,
    ).toBe(404);
    expect((await User.findById(user._id).lean()).segment).toBe('general');
  });
});

describe('BE-023 ambassador-only channels', () => {
  const seedChannels = async (admin) => {
    const general = await Channel.create({ name: 'General Hub', category: 'General', visibility: 'public', createdBy: admin._id });
    const ambassadorsOnly = await Channel.create({
      name: 'Ambassadors Circle',
      category: 'Ambassadors',
      visibility: 'public',
      segments: ['ambassador'],
      createdBy: admin._id,
    });
    return { general, ambassadorsOnly };
  };

  it('lists ambassador channels only for the ambassador segment (admins see all)', async () => {
    const admin = await createAdmin();
    const seeker = await createSeeker();
    const ambassadorUser = await createSeeker('amb@example.com');
    await moveUserSegment(ambassadorUser._id, 'ambassador', {});
    const { general, ambassadorsOnly } = await seedChannels(admin);

    const names = (body) => body.data.map((c) => c.name);
    const seekerList = await request(app).get(api('/community/channels')).set(bearer(seeker));
    const ambassadorList = await request(app).get(api(`/community/channels`)).set(bearer(ambassadorUser));
    // The public list route only reads user Bearer tokens; staff moderate
    // through the admin namespace, which is unfiltered by segment.
    const adminList = await request(app).get(api('/admin/community/channels')).set('Cookie', adminCookie(admin));
    const anonList = await request(app).get(api('/community/channels'));

    expect(names(seekerList.body)).toContain(general.name);
    expect(names(seekerList.body)).not.toContain(ambassadorsOnly.name);
    expect(names(ambassadorList.body)).toEqual(expect.arrayContaining([general.name, ambassadorsOnly.name]));
    expect(names(adminList.body)).toEqual(expect.arrayContaining([general.name, ambassadorsOnly.name]));
    expect(names(anonList.body)).toContain(general.name);
    expect(names(anonList.body)).not.toContain(ambassadorsOnly.name);
  });

  it('denies detail, posts and new posts to the general segment with 403', async () => {
    const admin = await createAdmin();
    const seeker = await createSeeker();
    const ambassadorUser = await createSeeker('amb2@example.com');
    await moveUserSegment(ambassadorUser._id, 'ambassador', {});
    const { ambassadorsOnly } = await seedChannels(admin);
    await ChannelPost.create({ channelId: ambassadorsOnly._id, authorId: admin._id, authorName: 'Ada', body: 'hello ambassadors' });

    const id = String(ambassadorsOnly._id);
    expect((await request(app).get(api(`/community/channels/${id}`)).set(bearer(seeker))).status).toBe(403);
    expect((await request(app).get(api(`/community/channels/${id}`)).set(bearer(ambassadorUser))).status).toBe(200);
    expect((await request(app).get(api(`/community/channels/${id}/posts`)).set(bearer(seeker))).status).toBe(403);
    expect(
      (await request(app).post(api(`/community/channels/${id}/posts`)).set(bearer(seeker)).send({ body: 'hi' })).status,
    ).toBe(403);
    expect(
      (await request(app).post(api(`/community/channels/${id}/posts`)).set(bearer(ambassadorUser)).send({ body: 'hi all' })).status,
    ).toBe(201);
  });

  it('keeps explicit members working: a general member still sees the channel', async () => {
    const admin = await createAdmin();
    const seeker = await createSeeker();
    const { ambassadorsOnly } = await seedChannels(admin);
    await CommunityMembership.create({ channelId: ambassadorsOnly._id, userId: seeker._id, role: 'member', status: 'active' });

    const id = String(ambassadorsOnly._id);
    const list = await request(app).get(api('/community/channels')).set(bearer(seeker));
    expect(list.body.data.map((c) => c.name)).toContain(ambassadorsOnly.name);
    expect((await request(app).get(api(`/community/channels/${id}`)).set(bearer(seeker))).status).toBe(200);
  });

  it('scopes the generic posts feed by segment', async () => {
    const admin = await createAdmin();
    const seeker = await createSeeker();
    const ambassadorUser = await createSeeker('amb3@example.com');
    await moveUserSegment(ambassadorUser._id, 'ambassador', {});
    const { general, ambassadorsOnly } = await seedChannels(admin);
    await ChannelPost.create({ channelId: general._id, authorId: admin._id, authorName: 'Ada', body: 'hello everyone' });
    await ChannelPost.create({ channelId: ambassadorsOnly._id, authorId: admin._id, authorName: 'Ada', body: 'hello ambassadors' });

    const bodies = async (user) =>
      (await request(app).get(api('/community/posts')).set(bearer(user))).body.data.map((p) => p.body);
    expect(await bodies(seeker)).toEqual(['hello everyone']);
    expect(await bodies(ambassadorUser)).toEqual(expect.arrayContaining(['hello everyone', 'hello ambassadors']));
  });

  it('creates channels with segments and rejects unknown values', async () => {
    const admin = await createAdmin();
    const seeker = await createSeeker();

    const created = await request(app)
      .post(api('/community/channels'))
      .set(bearer(seeker))
      .send({ name: 'Campus Reps', category: 'Ambassadors', visibility: 'private', segments: ['ambassador'] });
    expect(created.status).toBe(201);
    expect(created.body.data.segments).toEqual(['ambassador']);

    const bad = await request(app)
      .post(api('/community/channels'))
      .set(bearer(seeker))
      .send({ name: 'Bad', category: 'General', segments: ['everyone'] });
    expect(bad.status).toBe(400);

    const adminCreated = await request(app)
      .post(api('/admin/channels'))
      .set('Cookie', adminCookie(admin))
      .send({ name: 'HQ Circle', category: 'Ambassadors', visibility: 'private', segments: ['ambassador'] });
    expect(adminCreated.status).toBe(201);
    expect(adminCreated.body.data.segments).toEqual(['ambassador']);
  });

  it('lets owners retarget channels; the generic update path validates too', async () => {
    const seeker = await createSeeker();
    const channel = await Channel.create({ name: 'Open Forum', category: 'General', visibility: 'public', createdBy: seeker._id });

    const retarget = await request(app)
      .patch(api(`/community/channels/${channel._id}`))
      .set(bearer(seeker))
      .send({ segments: ['ambassador'] });
    expect(retarget.status).toBe(200);
    expect(retarget.body.data.segments).toEqual(['ambassador']);

    const bad = await request(app)
      .patch(api(`/community/channels/${channel._id}`))
      .set(bearer(seeker))
      .send({ segments: ['everyone'] });
    expect(bad.status).toBe(400);

    // A stranger cannot retarget someone else's channel.
    const stranger = await createSeeker('stranger@example.com');
    expect(
      (await request(app).patch(api(`/community/channels/${channel._id}`)).set(bearer(stranger)).send({ segments: ['general'] })).status,
    ).toBe(403);
  });
});
