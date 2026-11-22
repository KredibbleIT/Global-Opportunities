import request from 'supertest';
import { app } from '../src/app.js';
import { User } from '../src/models/User.js';
import { signToken } from '../src/middleware/auth.js';

// The alert switches a seeker or hirer sets in Manage notifications are saved on their account. ALL DATA IS FAKE.

const api = (route) => `/api/v1${route}`;

describe('alert preferences', () => {
  let seeker;
  let other;
  const bearer = (person) => ['Authorization', `Bearer ${signToken(person)}`];

  beforeEach(async () => {
    const stamp = Date.now();
    seeker = await User.create({ name: 'Test Seeker', email: `alerts-seeker-${stamp}@example.com`, role: 'seeker', passwordHash: 'x' });
    other = await User.create({ name: 'Test Other', email: `alerts-other-${stamp}@example.com`, role: 'hirer', passwordHash: 'x' });
  });

  it('starts with the usual defaults, which the account reports', async () => {
    const me = await request(app).get(api('/auth/me')).set(...bearer(seeker)).expect(200);
    expect(me.body.data.notificationPreferences.alerts).toMatchObject({ jobAlerts: true, jobActivity: false, marketingUpdates: false, savedJobs: true });
  });

  it('saves only the switches that are sent, and the account reports them afterwards', async () => {
    const res = await request(app).patch(api('/users/me/alert-preferences')).set(...bearer(seeker)).send({ jobAlerts: false, marketingUpdates: true }).expect(200);
    expect(res.body.data).toMatchObject({ jobAlerts: false, marketingUpdates: true, savedJobs: true });
    const me = await request(app).get(api('/auth/me')).set(...bearer(seeker)).expect(200);
    expect(me.body.data.notificationPreferences.alerts).toMatchObject({ jobAlerts: false, marketingUpdates: true, savedJobs: true });
    expect(me.body.data.notificationPreferences.push).toBe(true); // the push switch is untouched
  });

  it('keeps each person\'s switches to themselves', async () => {
    await request(app).patch(api('/users/me/alert-preferences')).set(...bearer(seeker)).send({ newPosts: false }).expect(200);
    const them = await request(app).get(api('/auth/me')).set(...bearer(other)).expect(200);
    expect(them.body.data.notificationPreferences.alerts.newPosts).toBe(true);
  });

  it('rejects an unknown or non-boolean switch, an empty change and an anonymous caller', async () => {
    for (const body of [{}, { jobAlerts: 'no' }, { jobAlerts: true, digest: false }, { push: false }]) {
      await request(app).patch(api('/users/me/alert-preferences')).set(...bearer(seeker)).send(body).expect(400);
    }
    await request(app).patch(api('/users/me/alert-preferences')).send({ jobAlerts: false }).expect(401);
  });
});
