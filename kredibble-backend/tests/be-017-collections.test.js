import request from 'supertest';
import { app } from '../src/app.js';
import { User, StaffMember, AuditLog } from '../src/models/User.js';
import { Notification } from '../src/models/Content.js';
import { ReferenceDataList } from '../src/models/AdminPortal.js';
import { Channel, ChannelPost } from '../src/models/Community.js';
import { signToken, signAdminToken } from '../src/middleware/auth.js';

describe('BE-017: Remaining Collections Integration', () => {
  let adminUser;
  let adminCookie;
  let superAdminUser;
  let superAdminToken;
  let commsUser;
  let commsStaff;
  let commsToken;
  let supportUser;
  let supportStaff;
  let supportToken;
  let seekerUser;
  let seekerToken;

  beforeEach(async () => {
    // 1. Admin account with admin secret token
    adminUser = await User.create({
      name: 'Root Admin',
      email: 'root@admin.com',
      role: 'admin',
      emailVerified: true,
      tokenVersion: 0,
    });
    adminCookie = `kredibble_admin_token=${signAdminToken(adminUser)}`;

    // 2. Super Admin staff
    superAdminUser = await User.create({
      name: 'Super Admin Person',
      email: 'superadmin@kredibble.com',
      role: 'seeker',
      emailVerified: true,
      tokenVersion: 0,
    });
    await StaffMember.create({
      userId: superAdminUser._id,
      name: superAdminUser.name,
      email: superAdminUser.email,
      roles: ['super_admin'],
      status: 'active',
      joinedDate: '2026-01-01',
    });
    superAdminToken = `Bearer ${signToken(superAdminUser)}`;

    // 3. Communications Officer staff (permissions: notifications, testimonials, career_resources)
    commsUser = await User.create({
      name: 'Comms Lead',
      email: 'comms@kredibble.com',
      role: 'seeker',
      emailVerified: true,
      tokenVersion: 0,
    });
    commsStaff = await StaffMember.create({
      userId: commsUser._id,
      name: commsUser.name,
      email: commsUser.email,
      roles: ['communications_officer'],
      status: 'active',
      joinedDate: '2026-02-01',
    });
    commsToken = `Bearer ${signToken(commsUser)}`;

    // 4. Support staff (no broadcast, no channels moderate, no team edit by default)
    supportUser = await User.create({
      name: 'Support Person',
      email: 'support@kredibble.com',
      role: 'seeker',
      emailVerified: true,
      tokenVersion: 0,
    });
    supportStaff = await StaffMember.create({
      userId: supportUser._id,
      name: supportUser.name,
      email: supportUser.email,
      roles: ['support'],
      status: 'active',
      joinedDate: '2026-03-01',
    });
    supportToken = `Bearer ${signToken(supportUser)}`;

    // 5. Normal seeker
    seekerUser = await User.create({
      name: 'Normal Seeker',
      email: 'seeker@kredibble.com',
      role: 'seeker',
      emailVerified: true,
      tokenVersion: 0,
    });
    seekerToken = `Bearer ${signToken(seekerUser)}`;
  });

  // ==========================================================================
  // Part 1: Team & Staff Management
  // ==========================================================================

  describe('Part 1: Team & Staff Management', () => {
    it('GET /api/v1/admin/staff lists staff members with pagination and search', async () => {
      const res = await request(app)
        .get('/api/v1/admin/staff?q=Comms')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].email).toBe('comms@kredibble.com');
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.total).toBe(1);
    });

    it('enforces role access: regular seeker cannot view staff list (403)', async () => {
      await request(app)
        .get('/api/v1/admin/staff')
        .set('Authorization', seekerToken)
        .expect(403);
    });

    it('allows super admin to view staff list', async () => {
      const res = await request(app)
        .get('/api/v1/admin/staff')
        .set('Authorization', superAdminToken)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    });

    it('POST /api/v1/admin/staff/invite invites a new member with 1 role and creates user', async () => {
      const res = await request(app)
        .post('/api/v1/admin/staff/invite')
        .set('Cookie', adminCookie)
        .send({
          name: 'Ama Boateng',
          email: 'ama@kredibble.com',
          roles: ['partnerships_officer'],
        })
        .expect(201);

      expect(res.body.data.email).toBe('ama@kredibble.com');
      expect(res.body.data.roles).toEqual(['partnerships_officer']);
      expect(res.body.data.status).toBe('active');

      const createdUser = await User.findOne({ emailNormalized: 'ama@kredibble.com' });
      expect(createdUser).toBeTruthy();
      expect(createdUser.name).toBe('Ama Boateng');

      const audit = await AuditLog.findOne({ 'metadata.staffInvite': true });
      expect(audit).toBeTruthy();
    });

    it('POST /api/v1/admin/staff/invite invites with 2 roles (up to MAX_STAFF_ROLES)', async () => {
      const res = await request(app)
        .post('/api/v1/admin/staff/invite')
        .set('Cookie', adminCookie)
        .send({
          name: 'Kofi Mensah',
          email: 'kofi@kredibble.com',
          roles: ['moderator', 'support'],
        })
        .expect(201);

      expect(res.body.data.roles).toEqual(['moderator', 'support']);
    });

    it('POST /api/v1/admin/staff/invite rejects more than 2 roles', async () => {
      await request(app)
        .post('/api/v1/admin/staff/invite')
        .set('Cookie', adminCookie)
        .send({
          name: 'Invalid Roles',
          email: 'invalid@kredibble.com',
          roles: ['moderator', 'support', 'desk_lead'],
        })
        .expect(400);
    });

    it('POST /api/v1/admin/staff/invite rejects duplicate staff email (409)', async () => {
      await request(app)
        .post('/api/v1/admin/staff/invite')
        .set('Cookie', adminCookie)
        .send({
          name: 'Comms Duplicate',
          email: 'comms@kredibble.com',
          roles: ['moderator'],
        })
        .expect(409);
    });

    it('PATCH /api/v1/admin/staff/:id updates roles and toggles status to suspended', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/staff/${commsStaff._id}`)
        .set('Cookie', adminCookie)
        .send({
          status: 'suspended',
          roles: ['communications_officer', 'social_media_manager'],
        })
        .expect(200);

      expect(res.body.data.status).toBe('suspended');
      expect(res.body.data.roles).toEqual(['communications_officer', 'social_media_manager']);

      const updated = await StaffMember.findById(commsStaff._id);
      expect(updated.status).toBe('suspended');
      expect(updated.roles).toEqual(['communications_officer', 'social_media_manager']);
    });

    it('DELETE /api/v1/admin/staff/:id removes staff member and audits', async () => {
      const res = await request(app)
        .delete(`/api/v1/admin/staff/${supportStaff._id}`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.data.removed).toBe(true);

      const found = await StaffMember.findById(supportStaff._id);
      expect(found).toBeNull();
    });
  });

  // ==========================================================================
  // Part 2: Notifications Collection
  // ==========================================================================

  describe('Part 2: Notifications Collection (Compose, Schedule, History)', () => {
    it('POST /api/v1/admin/notifications composes and sends broadcast immediately', async () => {
      const res = await request(app)
        .post('/api/v1/admin/notifications')
        .set('Cookie', adminCookie)
        .send({
          title: 'Welcome to Kredibble',
          message: 'Explore new opportunities on the platform.',
          audience: 'both',
        })
        .expect(201);

      expect(res.body.data.title).toBe('Welcome to Kredibble');
      expect(res.body.data.audience).toBe('both');
      expect(res.body.data.status).toBe('sent');
      expect(res.body.data.sentAt).toBeDefined();

      const audit = await AuditLog.findOne({ action: 'notification.broadcast' });
      expect(audit).toBeTruthy();
    });

    it('POST /api/v1/admin/notifications schedules a future broadcast', async () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const res = await request(app)
        .post('/api/v1/admin/notifications')
        .set('Cookie', adminCookie)
        .send({
          title: 'Upcoming Scheduled Broadcast',
          message: 'This will be delivered tomorrow.',
          audience: 'seekers',
          scheduledFor: futureDate,
        })
        .expect(201);

      expect(res.body.data.status).toBe('scheduled');
      expect(res.body.data.sentAt).toBeNull();
      expect(new Date(res.body.data.scheduledFor).toISOString()).toBe(futureDate);
    });

    it('allows Communications Officer to send notifications (screen: notifications edit)', async () => {
      await request(app)
        .post('/api/v1/admin/notifications')
        .set('Authorization', commsToken)
        .send({
          title: 'Comms Message',
          message: 'From the communications officer.',
          audience: 'hirers',
        })
        .expect(201);
    });

    it('rejects Support without broadcast permission from composing notification (403)', async () => {
      await request(app)
        .post('/api/v1/admin/notifications')
        .set('Authorization', supportToken)
        .send({
          title: 'Unauthorized Message',
          message: 'This should fail.',
          audience: 'both',
        })
        .expect(403);
    });

    it('GET /api/v1/admin/notifications returns paginated broadcast history with search', async () => {
      await Notification.create([
        { title: 'Alpha Update', message: 'First announcement', audience: 'seekers', status: 'sent', sentAt: new Date() },
        { title: 'Beta Update', message: 'Second announcement', audience: 'hirers', status: 'sent', sentAt: new Date() },
        { title: 'Gamma Update', message: 'Third announcement', audience: 'both', status: 'scheduled', scheduledFor: new Date() },
      ]);

      const res = await request(app)
        .get('/api/v1/admin/notifications?q=Alpha')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].title).toBe('Alpha Update');
      expect(res.body.pagination.total).toBe(1);
    });

    it('DELETE /api/v1/admin/notifications/:id deletes notification', async () => {
      const notif = await Notification.create({
        title: 'To Delete',
        message: 'Remove me',
        audience: 'both',
        status: 'scheduled',
      });

      const res = await request(app)
        .delete(`/api/v1/admin/notifications/${notif._id}`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.data.removed).toBe(true);
      const found = await Notification.findById(notif._id);
      expect(found).toBeNull();
    });
  });

  // ==========================================================================
  // Part 3: Reference Data Lists
  // ==========================================================================

  describe('Part 3: Reference Data Lists Collection', () => {
    it('GET /api/v1/admin/reference-data returns default seeded groups and lists', async () => {
      const res = await request(app)
        .get('/api/v1/admin/reference-data')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);

      const seekerGroup = res.body.data.find((g) => g.key === 'seeker');
      expect(seekerGroup).toBeDefined();
      expect(seekerGroup.lists.length).toBeGreaterThanOrEqual(4);

      const universitiesList = seekerGroup.lists.find((l) => l.key === 'universities');
      expect(universitiesList).toBeDefined();
      expect(universitiesList.items.length).toBe(21);
      expect(universitiesList.items).toContain('Ashesi University');

      const countriesList = seekerGroup.lists.find((l) => l.key === 'countries');
      expect(countriesList).toBeDefined();
      expect(countriesList.items).toContain('Ghana');
    });

    it('GET /api/v1/admin/reference-data/:group/:key returns specific list with search and pagination', async () => {
      const res = await request(app)
        .get('/api/v1/admin/reference-data/seeker/universities?q=Ghana')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.data.key).toBe('universities');
      expect(res.body.data.items).toEqual(['University of Ghana']);
      expect(res.body.data.total).toBe(1);
    });

    it('PUT /api/v1/admin/reference-data/:group/:key updates list items and creates audit log', async () => {
      const newUniversities = [
        'Ashesi University',
        'University of Ghana',
        'KNUST',
        'Academic City University College',
      ];

      const res = await request(app)
        .put('/api/v1/admin/reference-data/seeker/universities')
        .set('Cookie', adminCookie)
        .send({
          items: newUniversities,
        })
        .expect(200);

      expect(res.body.data.items).toEqual(newUniversities);

      const updated = await ReferenceDataList.findOne({ group: 'seeker', key: 'universities' });
      expect(updated.items).toEqual(newUniversities);

      const audit = await AuditLog.findOne({ action: 'reference_data.update' });
      expect(audit).toBeTruthy();
    });

    it('rejects regular seeker from editing reference data (403)', async () => {
      await request(app)
        .put('/api/v1/admin/reference-data/seeker/universities')
        .set('Authorization', seekerToken)
        .send({ items: ['Test University'] })
        .expect(403);
    });

    it('GET /api/v1/reference-data is publicly accessible for app/web consumption', async () => {
      const res = await request(app)
        .get('/api/v1/reference-data')
        .expect(200);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.length).toBe(3); // seeker, hirer, grants
    });
  });

  // ==========================================================================
  // Part 4: Community Channels Moderation
  // ==========================================================================

  describe('Part 4: Community Channels Moderation', () => {
    let testChannel;
    let testPost;

    beforeEach(async () => {
      testChannel = await Channel.create({
        name: 'Tech Innovators',
        category: 'Technology',
        bio: 'Channel for developers and builders',
        visibility: 'public',
        status: 'active',
        postsCount: 1,
        createdBy: superAdminUser._id,
      });

      testPost = await ChannelPost.create({
        channelId: testChannel._id,
        authorId: commsUser._id,
        authorName: 'Comms Member',
        title: 'Welcome to Tech',
        body: 'Check out the new SDK release.',
        flagged: false,
      });
    });

    it('GET /api/v1/admin/community/channels lists channels with search and status', async () => {
      const res = await request(app)
        .get('/api/v1/admin/community/channels?q=Innovators')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].name).toBe('Tech Innovators');
    });

    it('PATCH /api/v1/admin/community/channels/:id flags a channel for moderation', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/community/channels/${testChannel._id}`)
        .set('Cookie', adminCookie)
        .send({ status: 'flagged' })
        .expect(200);

      expect(res.body.data.status).toBe('flagged');

      const updated = await Channel.findById(testChannel._id);
      expect(updated.status).toBe('flagged');

      const audit = await AuditLog.findOne({ action: 'channel.moderate' });
      expect(audit).toBeTruthy();
    });

    it('DELETE /api/v1/admin/community/channels/:id marks channel as removed', async () => {
      const res = await request(app)
        .delete(`/api/v1/admin/community/channels/${testChannel._id}`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.data.status).toBe('removed');

      const updated = await Channel.findById(testChannel._id);
      expect(updated.status).toBe('removed');
    });

    it('GET /api/v1/admin/community/channels/:id/posts lists channel posts', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/community/channels/${testChannel._id}/posts`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].title).toBe('Welcome to Tech');
    });

    it('PATCH /api/v1/admin/community/posts/:id flags an offending post', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/community/posts/${testPost._id}`)
        .set('Cookie', adminCookie)
        .send({ flagged: true })
        .expect(200);

      expect(res.body.data.flagged).toBe(true);

      const updated = await ChannelPost.findById(testPost._id);
      expect(updated.flagged).toBe(true);
    });

    it('DELETE /api/v1/admin/community/channels/:channelId/posts/:postId removes post and decrements postsCount', async () => {
      const res = await request(app)
        .delete(`/api/v1/admin/community/channels/${testChannel._id}/posts/${testPost._id}`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.data.removed).toBe(true);

      const foundPost = await ChannelPost.findById(testPost._id);
      expect(foundPost).toBeNull();

      const updatedChannel = await Channel.findById(testChannel._id);
      expect(updatedChannel.postsCount).toBe(0);

      const audit = await AuditLog.findOne({ action: 'channel_post.remove' });
      expect(audit).toBeTruthy();
    });
  });
});
