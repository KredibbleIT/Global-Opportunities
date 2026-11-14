import { jest } from '@jest/globals';
import request from 'supertest';
import { app } from '../src/app.js';
import { User } from '../src/models/User.js';
import { env } from '../src/config/env.js';
import { ApiError } from '../src/utils/http.js';

// GOD-T66: Cloudflare replaces an origin 502 or 504 with its own plain-text page, so
// callers never saw our JSON; and in production every 5xx message became "Internal
// server error", even ones written for users. These force an error inside login (as
// sec-064.test.js does) and look at what a production caller receives.
const loginFailingWith = async (error) => {
  jest.spyOn(User, 'findOne').mockReturnValueOnce({
    select: () => { throw error; },
  });
  return request(app).post('/api/v1/auth/login').send({ email: 'someone@example.com', password: 'password123' });
};

describe('GOD-T66: 5xx responses survive Cloudflare and say what users need', () => {
  const wasDevelopment = env.isDevelopment;

  beforeEach(() => {
    env.isDevelopment = false; // production behaviour
  });

  afterEach(() => {
    env.isDevelopment = wasDevelopment;
    jest.restoreAllMocks();
  });

  it('a 502 is sent as 503, so Cloudflare passes the JSON through', async () => {
    const res = await loginFailingWith(new ApiError(502, 'internal detail'));
    expect(res.status).toBe(503);
    expect(res.body.error.message).toBe('Internal server error');
  });

  it('a 504 is sent as 503 too', async () => {
    const res = await loginFailingWith(new ApiError(504, 'internal detail'));
    expect(res.status).toBe(503);
  });

  it('a message marked expose reaches the user in production', async () => {
    const res = await loginFailingWith(new ApiError(503, 'We could not send the verification email. Please try again later.', { expose: true }));
    expect(res.status).toBe(503);
    expect(res.body.error.message).toBe('We could not send the verification email. Please try again later.');
  });

  it('an unmarked 5xx message stays hidden in production (SEC-064)', async () => {
    const res = await loginFailingWith(new ApiError(503, 'Service Unavailable: Database connection failed. secret host'));
    expect(res.status).toBe(503);
    expect(res.body.error.message).toBe('Internal server error');
  });

  it('a plain Error is still a hidden 500', async () => {
    const res = await loginFailingWith(new Error('SUPER_SECRET'));
    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe('Internal server error');
  });
});
