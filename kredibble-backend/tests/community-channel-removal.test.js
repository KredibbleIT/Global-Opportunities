import http from 'http';
import request from 'supertest';
import { io as ClientIO } from 'socket.io-client';
import { app } from '../src/app.js';
import { initSocket } from '../src/socket.js';
import { User, AuditLog } from '../src/models/User.js';
import { Channel, CommunityMembership } from '../src/models/Community.js';
import { signToken, signAdminToken } from '../src/middleware/auth.js';

// An admin deletes a channel a person made, for example because it does not fit what the app is about. ALL DATA IS FAKE.

const api = (path) => `/api/v1${path}`;

describe('admin deletes a user-made channel', () => {
  let admin;
  let owner;
  let member;
  let channel;
  let adminCookie;
  const bearer = (user) => ['Authorization', `Bearer ${signToken(user)}`];

  beforeEach(async () => {
    const stamp = Date.now();
    admin = await User.create({ name: 'Test Admin', email: `chrm-admin-${stamp}@example.com`, role: 'admin', passwordHash: 'x' });
    owner = await User.create({ name: 'Test Owner', email: `chrm-owner-${stamp}@example.com`, role: 'seeker', passwordHash: 'x' });
    member = await User.create({ name: 'Test Member', email: `chrm-member-${stamp}@example.com`, role: 'seeker', passwordHash: 'x' });
    channel = await Channel.create({ name: 'Test Off Topic Chat', category: 'Chat', bio: 'Not about opportunities.', visibility: 'public', status: 'active', createdBy: owner._id });
    await CommunityMembership.create({ channelId: channel._id, userId: member._id, status: 'active', role: 'member' });
    adminCookie = `kredibble_admin_token=${signAdminToken(admin)}`;
  });

  const listedFor = async (user) => {
    const res = await request(app).get(api('/community/channels')).set(...bearer(user)).expect(200);
    return res.body.data.map((entry) => entry.id);
  };

  it('is visible to people before it is deleted', async () => {
    expect(await listedFor(member)).toContain(String(channel._id));
    await request(app).get(api(`/community/channels/${channel._id}`)).set(...bearer(member)).expect(200);
  });

  it('takes the channel away for everyone in the app, its owner and its members included', async () => {
    const res = await request(app).delete(api(`/admin/community/channels/${channel._id}`)).set('Cookie', adminCookie).expect(200);
    expect(res.body.data).toEqual({ id: String(channel._id), status: 'removed' });

    for (const person of [owner, member]) {
      expect(await listedFor(person)).not.toContain(String(channel._id));
      await request(app).get(api(`/community/channels/${channel._id}`)).set(...bearer(person)).expect(404);
    }
  });

  it('keeps the record for the audit trail, with who made the channel', async () => {
    await request(app).delete(api(`/admin/community/channels/${channel._id}`)).set('Cookie', adminCookie).expect(200);
    expect((await Channel.findById(channel._id)).status).toBe('removed');
    const audit = await AuditLog.findOne({ action: 'channel.remove', resourceId: channel._id });
    expect(audit).toBeTruthy();
    expect(audit.metadata).toMatchObject({ name: 'Test Off Topic Chat', createdBy: String(owner._id), members: 1 });
  });

  it('is for admins: a person cannot delete a channel through the admin API, and an unknown channel is not found', async () => {
    await request(app).delete(api(`/admin/community/channels/${channel._id}`)).set(...bearer(owner)).expect(403);
    expect((await Channel.findById(channel._id)).status).toBe('active');
    await request(app).delete(api('/admin/community/channels/64b7f1c2a1b2c3d4e5f60718')).set('Cookie', adminCookie).expect(404);
    await request(app).delete(api('/admin/community/channels/not-an-id')).set('Cookie', adminCookie).expect(404);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Live: the apps are told at once
// ---------------------------------------------------------------------------------------------------------------------------------------------
describe('admin deletes a user-made channel: connected apps are told at once', () => {
  let server;
  let serverUrl;
  let io;
  const sockets = [];

  beforeAll(async () => {
    server = http.createServer(app);
    io = initSocket(server);
    await new Promise((resolve) => server.listen(0, resolve));
    serverUrl = `http://localhost:${server.address().port}`;
  }, 15000);

  afterAll(async () => {
    sockets.forEach((socket) => socket.close());
    io.close();
    await new Promise((resolve) => server.close(resolve));
    server.unref();
  }, 10000);

  const connect = (user) =>
    new Promise((resolve, reject) => {
      const socket = ClientIO(serverUrl, { auth: { token: signToken(user) }, transports: ['websocket'], forceNew: true, reconnection: false, timeout: 10000 });
      sockets.push(socket);
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', reject);
    });

  const nextEvent = (socket, event, ms = 4000) =>
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), ms);
      socket.once(event, (payload) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

  it('sends channel_removed with only the id to a member inside the chat, a member outside it and someone who is not a member', async () => {
    const stamp = Date.now();
    const admin = await User.create({ name: 'Test Admin', email: `live-admin-${stamp}@example.com`, role: 'admin', passwordHash: 'x' });
    const owner = await User.create({ name: 'Test Owner', email: `live-owner-${stamp}@example.com`, role: 'seeker', passwordHash: 'x' });
    const outsider = await User.create({ name: 'Test Outsider', email: `live-outsider-${stamp}@example.com`, role: 'seeker', passwordHash: 'x' });
    const channel = await Channel.create({ name: 'Test Live Chat', category: 'Chat', visibility: 'public', status: 'active', createdBy: owner._id });
    await CommunityMembership.create({ channelId: channel._id, userId: owner._id, status: 'active', role: 'admin' });

    const inside = await connect(owner);
    await new Promise((resolve) => inside.emit('join_channel', String(channel._id), resolve));
    const away = await connect(outsider);
    const waits = [nextEvent(inside, 'channel_removed'), nextEvent(away, 'channel_removed')];

    await request(app).delete(api(`/admin/community/channels/${channel._id}`)).set('Cookie', `kredibble_admin_token=${signAdminToken(admin)}`).expect(200);

    for (const payload of await Promise.all(waits)) expect(payload).toEqual({ channelId: String(channel._id) });
  });

  it('sends nothing when the delete is refused', async () => {
    const stamp = Date.now();
    const owner = await User.create({ name: 'Test Owner', email: `live-refused-${stamp}@example.com`, role: 'seeker', passwordHash: 'x' });
    const channel = await Channel.create({ name: 'Test Kept Chat', category: 'Chat', visibility: 'public', status: 'active', createdBy: owner._id });
    const listener = await connect(owner);
    const wait = nextEvent(listener, 'channel_removed', 1200);
    await request(app).delete(api(`/admin/community/channels/${channel._id}`)).set('Authorization', `Bearer ${signToken(owner)}`).expect(403);
    expect(await wait).toBeNull();
  });
});
