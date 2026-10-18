import { jest } from '@jest/globals';
import request from 'supertest';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { User, RefreshToken, hashRefreshToken } from '../src/models/User.js';
import { Notification, PushTicket } from '../src/models/Content.js';
import { signToken, signAdminToken } from '../src/middleware/auth.js';
import {
  EXPO_PUSH_SEND_URL,
  EXPO_PUSH_RECEIPTS_URL,
  PUSH_BATCH_SIZE,
  RECEIPT_DELAY_MS,
  isExpoPushToken,
  sendPushMessages,
  sendPushToUsers,
  checkPushReceipts,
  waitForBackgroundPushes,
} from '../src/lib/push.js';
import { deliverDueNotifications } from '../src/lib/notification-scheduler.js';
import { notifyUser } from '../src/lib/user-notify.js';

// SEC-138: every Expo call in this file goes to a mocked fetch. Push is off in
// tests by default; this suite turns it on and puts it back afterwards.
const realFetch = globalThis.fetch;
const previousPushEnabled = env.pushEnabled;
let fetchMock;
let ticketCounter = 0;

const jsonResponse = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

/** Expo accepts every message and hands back a fresh ticket id for each. */
const expoAcceptsEverything = async (url, init) => {
  if (url === EXPO_PUSH_SEND_URL) {
    const messages = JSON.parse(init.body);
    return jsonResponse({ data: messages.map(() => ({ status: 'ok', id: `ticket-${(ticketCounter += 1)}` })) });
  }
  return jsonResponse({ data: {} });
};

const sendCalls = () => fetchMock.mock.calls.filter(([url]) => url === EXPO_PUSH_SEND_URL);
const sentMessages = () => sendCalls().flatMap(([, init]) => JSON.parse(init.body));
const expoToken = (name) => `ExponentPushToken[${name}]`;

const makeUser = (overrides = {}) => User.create({
  name: overrides.name || 'Push Person',
  email: overrides.email || `${Math.random().toString(36).slice(2)}@example.com`,
  role: 'seeker',
  passwordHash: 'x',
  emailVerified: true,
  ...overrides,
});

beforeAll(() => {
  env.pushEnabled = true;
});

afterAll(() => {
  env.pushEnabled = previousPushEnabled;
  globalThis.fetch = realFetch;
});

beforeEach(() => {
  fetchMock = jest.fn(expoAcceptsEverything);
  globalThis.fetch = fetchMock;
});

afterEach(async () => {
  // Nothing started by one test may still be writing when the next one begins.
  await waitForBackgroundPushes();
});

describe('SEC-138: sending through Expo', () => {
  it('recognises Expo push tokens and nothing else', () => {
    expect(isExpoPushToken('ExponentPushToken[abc123]')).toBe(true);
    expect(isExpoPushToken('ExpoPushToken[abc123]')).toBe(true);
    expect(isExpoPushToken('fcm-device-token')).toBe(false);
    expect(isExpoPushToken('')).toBe(false);
    expect(isExpoPushToken(undefined)).toBe(false);
  });

  it('sends in batches of at most 100 and stores a ticket per accepted push', async () => {
    const messages = Array.from({ length: 205 }, (_, index) => ({
      to: expoToken(`batch-${index}`),
      title: 'Hello',
      body: 'World',
    }));

    const summary = await sendPushMessages(messages);

    expect(summary).toEqual({ sent: 205, failed: 0, removedTokens: 0 });
    expect(sendCalls().map(([, init]) => JSON.parse(init.body).length)).toEqual([PUSH_BATCH_SIZE, PUSH_BATCH_SIZE, 5]);
    expect(await PushTicket.countDocuments()).toBe(205);
  });

  it('skips anything that is not an Expo token', async () => {
    const summary = await sendPushMessages([{ to: 'not-a-token', title: 'x', body: 'y' }]);
    expect(summary.sent).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shortens long messages to fit the 4 KB push limit and maps priority', async () => {
    await sendPushMessages([{ to: expoToken('long'), title: 'Long', body: 'a'.repeat(5000), priority: 'urgent' }]);
    const [message] = sentMessages();
    expect(message.body.length).toBe(500);
    expect(message.priority).toBe('high');
    expect(message.channelId).toBe('default');
  });

  it('removes a token when its ticket says DeviceNotRegistered', async () => {
    const gone = await makeUser({ pushToken: expoToken('uninstalled'), pushPlatform: 'ios' });
    fetchMock.mockImplementation(async () => jsonResponse({
      data: [{ status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } }],
    }));

    const summary = await sendPushMessages([{ to: expoToken('uninstalled'), title: 'x', body: 'y' }]);

    expect(summary).toEqual({ sent: 0, failed: 1, removedTokens: 1 });
    const reloaded = await User.findById(gone._id).lean();
    expect(reloaded.pushToken).toBeUndefined();
    expect(reloaded.pushPlatform).toBeUndefined();
  });

  it('does not throw when Expo is unreachable or answers 5xx', async () => {
    fetchMock.mockImplementationOnce(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(sendPushMessages([{ to: expoToken('a'), title: 'x', body: 'y' }]))
      .resolves.toEqual({ sent: 0, failed: 1, removedTokens: 0 });

    fetchMock.mockImplementationOnce(async () => jsonResponse({ errors: [{ code: 'INTERNAL' }] }, 503));
    await expect(sendPushMessages([{ to: expoToken('b'), title: 'x', body: 'y' }]))
      .resolves.toEqual({ sent: 0, failed: 1, removedTokens: 0 });
  });

  it('sends nothing while push is disabled', async () => {
    env.pushEnabled = false;
    try {
      await makeUser({ pushToken: expoToken('disabled') });
      await sendPushMessages([{ to: expoToken('disabled'), title: 'x', body: 'y' }]);
      await notifyUser((await User.findOne())._id, { title: 'x', message: 'y' });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      env.pushEnabled = true;
    }
  });
});

describe('SEC-138: who gets a push', () => {
  it('notifyUser pushes to that one person, with the notification id for the tap', async () => {
    const target = await makeUser({ pushToken: expoToken('target') });
    await makeUser({ pushToken: expoToken('bystander') });

    const notification = await notifyUser(target._id, { title: 'Ambassador request approved', message: 'Welcome!', type: 'ambassador' });
    await waitForBackgroundPushes();

    expect(sentMessages()).toEqual([expect.objectContaining({
      to: expoToken('target'),
      title: 'Ambassador request approved',
      body: 'Welcome!',
      data: { notificationId: String(notification._id), type: 'ambassador' },
    })]);
  });

  it('skips people who turned pushes off or have no token', async () => {
    const muted = await makeUser({ pushToken: expoToken('muted'), notificationPreferences: { push: false } });
    const noToken = await makeUser();

    const summary = await sendPushToUsers([muted._id, noToken._id], { title: 'x', body: 'y' });

    expect(summary.sent).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('an immediate broadcast reaches only its audience, in the background', async () => {
    const admin = await makeUser({ role: 'admin', email: 'root@admin.example.com', pushToken: expoToken('staff') });
    await makeUser({ role: 'seeker', pushToken: expoToken('seeker') });
    await makeUser({ role: 'hirer', pushToken: expoToken('hirer') });
    await makeUser({ role: 'seeker', pushToken: expoToken('seeker-muted'), notificationPreferences: { push: false } });
    await makeUser({ role: 'deleted', pushToken: expoToken('deleted') });

    await request(app)
      .post('/api/v1/admin/notifications')
      .set('Cookie', `kredibble_admin_token=${signAdminToken(admin)}`)
      .send({ title: 'Seekers only', message: 'New grants are open.', audience: 'seekers' })
      .expect(201);
    await waitForBackgroundPushes();

    expect(sentMessages().map((message) => message.to)).toEqual([expoToken('seeker')]);
  });

  it('a broadcast to everyone reaches seekers and hirers but not staff', async () => {
    const admin = await makeUser({ role: 'admin', email: 'root2@admin.example.com', pushToken: expoToken('staff') });
    await makeUser({ role: 'seeker', pushToken: expoToken('seeker') });
    await makeUser({ role: 'hirer', pushToken: expoToken('hirer') });

    await request(app)
      .post('/api/v1/admin/notifications')
      .set('Cookie', `kredibble_admin_token=${signAdminToken(admin)}`)
      .send({ title: 'Everyone', message: 'Hello all.', audience: 'all' })
      .expect(201);
    await waitForBackgroundPushes();

    expect(sentMessages().map((message) => message.to).sort()).toEqual([expoToken('hirer'), expoToken('seeker')]);
  });
});

describe('SEC-138: scheduled broadcasts', () => {
  it('a scheduled broadcast is not pushed or shown until it is due, then is sent once', async () => {
    const admin = await makeUser({ role: 'admin', email: 'root3@admin.example.com' });
    const seeker = await makeUser({ role: 'seeker', pushToken: expoToken('seeker') });
    const seekerAuth = ['Authorization', `Bearer ${signToken(seeker)}`];
    const sendAt = new Date(Date.now() + 60 * 60 * 1000);

    const created = await request(app)
      .post('/api/v1/admin/notifications')
      .set('Cookie', `kredibble_admin_token=${signAdminToken(admin)}`)
      .send({ title: 'Later', message: 'Coming soon.', audience: 'seekers', scheduledFor: sendAt.toISOString() })
      .expect(201);
    await waitForBackgroundPushes();
    expect(fetchMock).not.toHaveBeenCalled();

    // Before its time: no push and nothing in the feed.
    expect((await deliverDueNotifications({ now: new Date() })).delivered).toBe(0);
    const before = await request(app).get('/api/v1/notifications').set(...seekerAuth).expect(200);
    expect(before.body.data.map((item) => item.id)).not.toContain(created.body.data.id);

    // Two instances run the job at the same moment once it is due.
    const due = new Date(sendAt.getTime() + 1000);
    const runs = await Promise.all([deliverDueNotifications({ now: due }), deliverDueNotifications({ now: due })]);
    expect(runs[0].delivered + runs[1].delivered).toBe(1);
    expect(sentMessages()).toEqual([expect.objectContaining({ to: expoToken('seeker'), title: 'Later' })]);

    const stored = await Notification.findById(created.body.data.id).lean();
    expect(stored.status).toBe('sent');
    expect(stored.sentAt).toEqual(due);

    const after = await request(app).get('/api/v1/notifications').set(...seekerAuth).expect(200);
    expect(after.body.data.map((item) => item.id)).toContain(created.body.data.id);
  });

  it('a cancelled broadcast is never sent', async () => {
    await Notification.create({
      title: 'Cancelled',
      message: 'Never mind.',
      audience: 'all',
      status: 'cancelled',
      scheduledFor: new Date(Date.now() - 1000),
    });
    expect((await deliverDueNotifications()).delivered).toBe(0);
  });
});

describe('SEC-138: delivery receipts', () => {
  it('removes tokens whose receipt says DeviceNotRegistered and keeps unanswered tickets', async () => {
    const gone = await makeUser({ pushToken: expoToken('gone') });
    const fine = await makeUser({ pushToken: expoToken('fine') });
    const now = new Date();
    const old = new Date(now.getTime() - RECEIPT_DELAY_MS - 1000);
    await PushTicket.create([
      { ticketId: 'old-gone', token: expoToken('gone'), userId: gone._id, createdAt: old },
      { ticketId: 'old-fine', token: expoToken('fine'), userId: fine._id, createdAt: old },
      { ticketId: 'old-pending', token: expoToken('fine'), userId: fine._id, createdAt: old },
      { ticketId: 'fresh', token: expoToken('fine'), userId: fine._id, createdAt: now },
    ]);
    fetchMock.mockImplementation(async (url, init) => {
      expect(url).toBe(EXPO_PUSH_RECEIPTS_URL);
      expect(JSON.parse(init.body).ids.sort()).toEqual(['old-fine', 'old-gone', 'old-pending']);
      return jsonResponse({
        data: {
          'old-gone': { status: 'error', details: { error: 'DeviceNotRegistered' } },
          'old-fine': { status: 'ok' },
        },
      });
    });

    const summary = await checkPushReceipts({ now });

    expect(summary).toEqual({ checked: 2, failed: 1, removedTokens: 1 });
    expect((await User.findById(gone._id).lean()).pushToken).toBeUndefined();
    expect((await User.findById(fine._id).lean()).pushToken).toBe(expoToken('fine'));
    expect((await PushTicket.find().lean()).map((ticket) => ticket.ticketId).sort()).toEqual(['fresh', 'old-pending']);
  });

  it('does not throw when the receipt request fails', async () => {
    await PushTicket.create({ ticketId: 'old', token: expoToken('x'), createdAt: new Date(Date.now() - RECEIPT_DELAY_MS - 1000) });
    fetchMock.mockImplementation(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(checkPushReceipts()).resolves.toEqual({ checked: 0, failed: 0, removedTokens: 0 });
    expect(await PushTicket.countDocuments()).toBe(1);
  });
});

describe('SEC-138: one phone, one account', () => {
  it('registering a token takes it off every other account', async () => {
    const previous = await makeUser({ pushToken: expoToken('shared-phone') });
    const current = await makeUser();

    await request(app)
      .post('/api/v1/users/me/push-token')
      .set('Authorization', `Bearer ${signToken(current)}`)
      .send({ token: expoToken('shared-phone'), platform: 'android' })
      .expect(200);

    expect((await User.findById(previous._id).lean()).pushToken).toBeUndefined();
    expect((await User.findById(current._id).lean()).pushToken).toBe(expoToken('shared-phone'));
  });

  const signInOnDevice = async (user) => {
    const rawRefreshToken = `refresh-${user._id}`;
    await RefreshToken.create({
      userId: user._id,
      tokenHash: hashRefreshToken(rawRefreshToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    return rawRefreshToken;
  };

  it('logout clears the token of the phone signing out, even with an expired access token', async () => {
    const user = await makeUser({ pushToken: expoToken('this-phone'), pushPlatform: 'ios' });
    const refreshToken = await signInOnDevice(user);

    await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', 'Bearer expired.or.invalid')
      .send({ refreshToken, pushToken: expoToken('this-phone') })
      .expect(204);

    const reloaded = await User.findById(user._id).lean();
    expect(reloaded.pushToken).toBeUndefined();
    expect(reloaded.pushPlatform).toBeUndefined();
  });

  it('logout from another phone leaves this phone registered', async () => {
    const user = await makeUser({ pushToken: expoToken('newer-phone') });
    const refreshToken = await signInOnDevice(user);

    await request(app)
      .post('/api/v1/auth/logout')
      .send({ refreshToken, pushToken: expoToken('older-phone') })
      .expect(204);

    expect((await User.findById(user._id).lean()).pushToken).toBe(expoToken('newer-phone'));
  });

  it('logout from an app that sends no push token clears the account token', async () => {
    const user = await makeUser({ pushToken: expoToken('old-app') });

    await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${signToken(user)}`)
      .send({})
      .expect(204);

    expect((await User.findById(user._id).lean()).pushToken).toBeUndefined();
  });

  it('account deletion clears the token', async () => {
    const user = await makeUser({ pushToken: expoToken('deleting') });
    const { deleteAccount } = await import('../src/lib/account-deletion.js');
    await deleteAccount(user, { deleteMedia: async () => true });
    const reloaded = await User.findById(user._id).lean();
    expect(reloaded.role).toBe('deleted');
    expect(reloaded.pushToken).toBeUndefined();
  });
});

describe('SEC-138: push preference', () => {
  it('turns pushes off and on for the caller only', async () => {
    const user = await makeUser({ pushToken: expoToken('pref') });
    const auth = ['Authorization', `Bearer ${signToken(user)}`];

    const off = await request(app).patch('/api/v1/users/me/notification-preferences').set(...auth).send({ push: false }).expect(200);
    expect(off.body.data).toEqual({ push: false });
    expect((await User.findById(user._id).lean()).notificationPreferences.push).toBe(false);

    await sendPushToUsers([user._id], { title: 'x', body: 'y' });
    expect(fetchMock).not.toHaveBeenCalled();

    const on = await request(app).patch('/api/v1/users/me/notification-preferences').set(...auth).send({ push: true }).expect(200);
    expect(on.body.data).toEqual({ push: true });
    await sendPushToUsers([user._id], { title: 'x', body: 'y' });
    expect(sentMessages()).toHaveLength(1);
  });

  it('rejects a missing, non-boolean or unknown field', async () => {
    const user = await makeUser();
    const auth = ['Authorization', `Bearer ${signToken(user)}`];
    for (const body of [{}, { push: 'no' }, { push: true, digest: false }]) {
      await request(app).patch('/api/v1/users/me/notification-preferences').set(...auth).send(body).expect(400);
    }
  });

  it('requires a signed-in caller', async () => {
    await request(app).patch('/api/v1/users/me/notification-preferences').send({ push: false }).expect(401);
  });
});
