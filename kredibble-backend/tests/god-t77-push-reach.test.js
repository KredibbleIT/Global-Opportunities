import { jest } from '@jest/globals';
import request from 'supertest';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { signAdminToken } from '../src/middleware/auth.js';
import { countPushRecipients, waitForBackgroundPushes } from '../src/lib/push.js';

// GOD-T77: broadcasts showed in the app but never arrived as phone pushes, and nothing told the sender. The Android app
// was built without Firebase (no google-services.json), so no phone could register for push; the server had nobody to
// push to and said nothing. A broadcast now answers how many phones its push will reach, so "none" is visible at once.
// Every Expo call goes to a mocked fetch. ALL DATA IS FAKE.

const realFetch = globalThis.fetch;
const previousPushEnabled = env.pushEnabled;
const expoToken = (name) => `ExponentPushToken[${name}]`;
const makeUser = (overrides = {}) => User.create({
  name: 'Push Person',
  email: `${Math.random().toString(36).slice(2)}@example.com`,
  role: 'seeker',
  passwordHash: 'x',
  emailVerified: true,
  ...overrides,
});

beforeEach(() => {
  env.pushEnabled = true;
  globalThis.fetch = jest.fn(async (url, init) => new Response(JSON.stringify({ data: JSON.parse(init.body).map((_, index) => ({ status: 'ok', id: `ticket-${index}` })) }), { status: 200 }));
});
afterEach(async () => {
  await waitForBackgroundPushes();
  env.pushEnabled = previousPushEnabled;
  globalThis.fetch = realFetch;
});

const broadcast = async (audience) => {
  const admin = await makeUser({ role: 'admin', email: `root-${Date.now()}@admin.example.com` });
  return request(app)
    .post('/api/v1/admin/notifications')
    .set('Cookie', `kredibble_admin_token=${signAdminToken(admin)}`)
    .send({ title: 'Test broadcast', message: 'Made in a test.', audience });
};

describe('GOD-T77: a broadcast says how many phones its push reaches', () => {
  it('counts the audience\'s phones that can get a push: a token, pushes not turned off, the right role', async () => {
    await makeUser({ pushToken: expoToken('seeker-1') });
    await makeUser({ pushToken: expoToken('seeker-2'), pushPlatform: 'android' });
    await makeUser({ pushToken: expoToken('seeker-muted'), notificationPreferences: { push: false } });
    await makeUser({}); // a seeker whose phone never registered
    await makeUser({ role: 'hirer', pushToken: expoToken('hirer') });

    expect(await countPushRecipients('seekers')).toBe(2);
    expect(await countPushRecipients('hirers')).toBe(1);
    expect(await countPushRecipients('all')).toBe(3);
    expect(await countPushRecipients('nobody')).toBe(0);

    const res = await broadcast('seekers');
    expect(res.status).toBe(201);
    expect(res.body.data.push).toEqual({ enabled: true, phones: 2 });
  });

  it('with no phone registered it answers 0, the case production was in', async () => {
    await makeUser({});
    const res = await broadcast('all');
    expect(res.status).toBe(201);
    expect(res.body.data.push).toEqual({ enabled: true, phones: 0 });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('says when phone pushes are turned off on the server', async () => {
    env.pushEnabled = false;
    await makeUser({ pushToken: expoToken('seeker') });
    const res = await broadcast('all');
    expect(res.body.data.push).toEqual({ enabled: false, phones: 0 });
  });
});
