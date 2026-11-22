import http from 'http';
import request from 'supertest';
import { io as ClientIO } from 'socket.io-client';
import { app } from '../src/app.js';
import { initSocket } from '../src/socket.js';
import { User } from '../src/models/User.js';
import { Notification, NotificationRead } from '../src/models/Content.js';
import { signToken, signAdminToken } from '../src/middleware/auth.js';

// An admin sends a message to seekers or hirers: the open apps are told at once, and each person's "read" is remembered by the server. ALL DATA IS FAKE.

const api = (path) => `/api/v1${path}`;
const bearer = (user) => ['Authorization', `Bearer ${signToken(user)}`];

describe('admin broadcast: live bell and read state', () => {
  let server;
  let serverUrl;
  let io;
  let admin;
  let seeker;
  let seeker2;
  let hirer;
  const sockets = [];

  beforeAll(async () => {
    server = http.createServer(app);
    io = initSocket(server);
    await new Promise((resolve) => server.listen(0, resolve));
    serverUrl = `http://localhost:${server.address().port}`;
  }, 15000);

  // The test setup empties the database between tests, so the people are made fresh for each one.
  beforeEach(async () => {
    const stamp = Date.now();
    admin = await User.create({ name: 'Test Admin', email: `nb-admin-${stamp}@example.com`, role: 'admin', passwordHash: 'x' });
    seeker = await User.create({ name: 'Test Seeker', email: `nb-seeker-${stamp}@example.com`, role: 'seeker', passwordHash: 'x' });
    seeker2 = await User.create({ name: 'Test Seeker Two', email: `nb-seeker2-${stamp}@example.com`, role: 'seeker', passwordHash: 'x' });
    hirer = await User.create({ name: 'Test Hirer', email: `nb-hirer-${stamp}@example.com`, role: 'hirer', passwordHash: 'x' });
  });

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

  const send = (body) => request(app).post(api('/admin/notifications')).set('Cookie', `kredibble_admin_token=${signAdminToken(admin)}`).send(body);
  const listFor = async (user) => (await request(app).get(api('/notifications')).set(...bearer(user)).expect(200)).body.data;

  it('tells open apps at once, with only the id and never the message', async () => {
    const open = await connect(seeker);
    const wait = nextEvent(open, 'notification');
    const res = await send({ title: 'Test Live Title', message: 'Test live message body', audience: 'seekers' }).expect(201);
    const payload = await wait;
    expect(payload).toEqual({ id: String(res.body.data.id) });
    expect(JSON.stringify(payload)).not.toContain('Test live message body');
  });

  it('tells nobody about a scheduled broadcast until it is sent', async () => {
    const open = await connect(seeker);
    const wait = nextEvent(open, 'notification', 800);
    await send({ title: 'Test Later Title', message: 'Test later message', audience: 'seekers', scheduledFor: new Date(Date.now() + 3600_000).toISOString() }).expect(201);
    expect(await wait).toBeNull();
  });

  it('remembers who read a broadcast, for each person on their own', async () => {
    const res = await send({ title: 'Test Read Title', message: 'Test read message', audience: 'seekers' }).expect(201);
    const id = String(res.body.data.id);
    const find = (list) => list.find((item) => item.id === id);

    expect(find(await listFor(seeker)).readAt).toBeUndefined();
    await request(app).post(api(`/notifications/${id}/read`)).set(...bearer(seeker)).expect(200);

    // read for the person who read it, still new for another seeker, and nobody sees who read it
    expect(find(await listFor(seeker)).readAt).toBeTruthy();
    expect(find(await listFor(seeker2)).readAt).toBeUndefined();
    expect(JSON.stringify(await listFor(seeker2))).not.toContain(String(seeker._id));

    // reading it again changes nothing
    await request(app).post(api(`/notifications/${id}/read`)).set(...bearer(seeker)).expect(200);
    expect(await NotificationRead.countDocuments({ notificationId: id, userId: seeker._id })).toBe(1);
  });

  it('does not let a person mark a broadcast for someone else\'s audience, or one that does not exist', async () => {
    const res = await send({ title: 'Test Hirers Only', message: 'Test hirers message', audience: 'hirers' }).expect(201);
    const id = String(res.body.data.id);
    await request(app).post(api(`/notifications/${id}/read`)).set(...bearer(seeker)).expect(404);
    await request(app).post(api(`/notifications/${id}/read`)).set(...bearer(hirer)).expect(200);
    await request(app).post(api('/notifications/64b7f1c2a1b2c3d4e5f60718/read')).set(...bearer(seeker)).expect(404);
    expect(await NotificationRead.countDocuments({ notificationId: id, userId: seeker._id })).toBe(0);
  });

  it('still marks a personal notification read on the notification itself', async () => {
    const personal = await Notification.create({ title: 'Test Personal', message: 'Test personal message', audience: 'user', userId: seeker._id, isActive: true });
    await request(app).post(api(`/notifications/${personal._id}/read`)).set(...bearer(seeker)).expect(200);
    expect((await Notification.findById(personal._id)).readAt).toBeTruthy();
    await request(app).post(api(`/notifications/${personal._id}/read`)).set(...bearer(seeker2)).expect(404);
  });

  it('forgets the read marks when the admin deletes the broadcast', async () => {
    const res = await send({ title: 'Test Delete Title', message: 'Test delete message', audience: 'both' }).expect(201);
    const id = String(res.body.data.id);
    await request(app).post(api(`/notifications/${id}/read`)).set(...bearer(seeker)).expect(200);
    await request(app).delete(api(`/admin/notifications/${id}`)).set('Cookie', `kredibble_admin_token=${signAdminToken(admin)}`).expect(200);
    expect(await NotificationRead.countDocuments({ notificationId: id })).toBe(0);
  });
});
