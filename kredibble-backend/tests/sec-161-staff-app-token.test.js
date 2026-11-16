import http from 'node:http';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { io as ClientIO } from 'socket.io-client';
import { app } from '../src/app.js';
import { initSocket } from '../src/socket.js';
import { User, StaffMember, RefreshToken, hashRefreshToken } from '../src/models/User.js';
import { Opportunity } from '../src/models/Platform.js';
import { signToken, generateRefreshToken, STAFF_APP_SIGN_IN_MESSAGE } from '../src/middleware/auth.js';
import { RESOURCE_POLICIES, ADMIN, AUTHENTICATED } from '../src/lib/policies.js';
import { ROLE_IDS, invalidateTogglesCache } from '../src/lib/permissions.js';

/**
 * SEC-161: every staff User has role `admin`, and the general `/api/v1` routes read that role as full admin. A staffer
 * signed in through the app's `POST /auth/login` got a Bearer token with role admin and used it to read every user's
 * email and to publish a pending posting, whatever their staff roles. Now:
 * - `POST /auth/login` refuses an account with a staff record (403, STAFF_ACCOUNT; inactive staff keep BE-028's 401);
 * - `POST /auth/refresh` refuses to mint an app token for one (401), without touching the refresh token;
 * - `requireAuth` refuses an app token that names a staff account (401), `optionalAuth` reads it as anonymous, and the
 *   socket handshake refuses it, so a token issued before the fix is no use either.
 * The root admin (role admin, no staff record) is unchanged: resolveStaffRoles treats it as super_admin everywhere.
 * ALL DATA IS FAKE.
 */

const api = (path) => `/api/v1${path}`;
const PASSWORD = 'Password123';
const FAKE_ID = '64b7f1c2a1b2c3d4e5f60718';

let sequence = 0;

/**
 * A staff User as BE-028 creates one (role admin) with a staff record, or the root admin when `roles` is null.
 * @param {{ roles?: string[] | null, status?: string, password?: boolean }} options
 */
const createAdminUser = async ({ roles = ['partnerships_officer'], status = 'active', password = false } = {}) => {
  sequence += 1;
  const user = await User.create({
    name: `Admin ${sequence}`,
    email: `sec161-${sequence}@example.com`,
    role: 'admin',
    emailVerified: true,
    passwordHash: password ? await bcrypt.hash(PASSWORD, 12) : 'x',
  });
  if (roles) await StaffMember.create({ userId: user._id, name: user.name, email: user.email, roles, status });
  return user;
};

const signIn = (email, password = PASSWORD) => request(app).post(api('/auth/login')).send({ email, password });
const bearer = (user) => ['Authorization', `Bearer ${signToken(user)}`];

/** An app refresh token stored the way `issueSession` stores one (an app session from before the fix). */
const storeAppRefreshToken = async (user) => {
  const refreshToken = generateRefreshToken();
  await RefreshToken.create({ userId: user._id, tokenHash: hashRefreshToken(refreshToken), expiresAt: new Date(Date.now() + 86_400_000) });
  return refreshToken;
};

const createPendingPosting = () =>
  Opportunity.create({
    title: 'Pending role', type: 'job', company: 'Example Org', location: 'Accra', description: 'Awaiting review.', moderationStatus: 'pending', vetted: false,
  });

beforeEach(() => invalidateTogglesCache());

describe('SEC-161: the reproduction is now refused', () => {
  it('a Partnerships Officer cannot sign in to the app', async () => {
    const staffer = await createAdminUser({ password: true });
    const res = await signIn(staffer.email);
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe(STAFF_APP_SIGN_IN_MESSAGE);
    expect(res.body.error.code).toBe('STAFF_ACCOUNT');
    expect(res.body.data).toBeUndefined();
    expect(await RefreshToken.countDocuments({ userId: staffer._id })).toBe(0);
  });

  it('an app token issued before the fix neither reads the users nor publishes a pending posting', async () => {
    const staffer = await createAdminUser();
    await User.create({ name: 'Ama Seeker', email: 'ama161@example.com', role: 'seeker', passwordHash: 'x' });
    const posting = await createPendingPosting();

    const users = await request(app).get(api('/users')).set(...bearer(staffer));
    expect(users.status).toBe(401);
    expect(users.body.error.code).toBe('STAFF_ACCOUNT');
    expect(JSON.stringify(users.body)).not.toContain('ama161@example.com');

    const publish = await request(app).patch(api(`/opportunities/${posting._id}`)).set(...bearer(staffer)).send({ moderationStatus: 'published' });
    expect(publish.status).toBe(401);
    expect((await Opportunity.findById(posting._id).lean()).moderationStatus).toBe('pending');
  });

  it('on public reads the token counts as no token: no unpublished postings', async () => {
    const staffer = await createAdminUser();
    await createPendingPosting();
    const res = await request(app).get(api('/opportunities')).set(...bearer(staffer));
    expect(res.status).toBe(200);
    expect(res.body.data.map((opportunity) => opportunity.title)).not.toContain('Pending role');
  });

  it('the same staffer still works through the admin session, within their staff roles', async () => {
    const staffer = await createAdminUser({ password: true });
    const login = await request(app).post(api('/auth/admin/login')).send({ email: staffer.email, password: PASSWORD });
    expect(login.status).toBe(200);
    const cookie = ['Cookie', login.headers['set-cookie'].map((value) => value.split(';')[0]).join('; ')];

    const me = await request(app).get(api('/auth/admin/me')).set(...cookie);
    expect(me.status).toBe(200);
    expect(me.body.data.roles).toEqual(['partnerships_officer']);
    expect((await request(app).get(api('/admin/partners')).set(...cookie)).status).toBe(200);
    // The matrix still refuses what the role lacks (SEC-131).
    expect((await request(app).get(api('/admin/seekers')).set(...cookie)).status).toBe(403);
  });
});

describe('SEC-161: sign-in and refresh', () => {
  it.each(ROLE_IDS)('refuses an active %s at the app sign-in', async (role) => {
    const staffer = await createAdminUser({ roles: [role], password: true });
    expect((await signIn(staffer.email)).status).toBe(403);
  });

  it.each(['invited', 'deactivated', 'suspended'])('keeps the generic 401 for a %s staffer (BE-028)', async (status) => {
    const staffer = await createAdminUser({ status, password: true });
    const res = await signIn(staffer.email);
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('keeps the generic 401 for a staffer with a wrong password', async () => {
    const staffer = await createAdminUser({ password: true });
    const res = await signIn(staffer.email, 'Wrong-password-1');
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('refuses to refresh an app session that began before the fix, and leaves the token alone', async () => {
    const staffer = await createAdminUser();
    const refreshToken = await storeAppRefreshToken(staffer);
    const res = await request(app).post(api('/auth/refresh')).send({ refreshToken });
    expect(res.status).toBe(401);
    expect(res.body.data).toBeUndefined();
    const stored = await RefreshToken.findOne({ tokenHash: hashRefreshToken(refreshToken) }).lean();
    expect(stored.revokedAt ?? null).toBeNull();
    expect(stored.replacedBy ?? null).toBeNull();
  });

  it('refuses the admin session refresh token posted to the app refresh, and the dashboard stays signed in', async () => {
    const staffer = await createAdminUser({ password: true });
    const login = await request(app).post(api('/auth/admin/login')).send({ email: staffer.email, password: PASSWORD });
    const refreshCookie = login.headers['set-cookie'].find((value) => value.startsWith('kredibble_admin_refresh=')).split(';')[0];
    const refreshToken = refreshCookie.split('=')[1];

    expect((await request(app).post(api('/auth/refresh')).send({ refreshToken })).status).toBe(401);
    expect((await request(app).post(api('/auth/admin/refresh')).set('Cookie', refreshCookie)).status).toBe(200);
  });

  it('still signs in and refreshes the root admin, seekers and hirers', async () => {
    const root = await createAdminUser({ roles: null, password: true });
    const seeker = await User.create({ name: 'Kofi', email: 'kofi161@example.com', role: 'seeker', emailVerified: true, passwordHash: await bcrypt.hash(PASSWORD, 12) });
    const hirer = await User.create({ name: 'Efua', email: 'efua161@example.com', role: 'hirer', emailVerified: true, passwordHash: await bcrypt.hash(PASSWORD, 12) });

    for (const user of [root, seeker, hirer]) {
      const login = await signIn(user.email);
      expect(login.status).toBe(200);
      const refreshed = await request(app).post(api('/auth/refresh')).send({ refreshToken: login.body.data.refreshToken });
      expect(refreshed.status).toBe(200);
      const me = await request(app).get(api('/auth/me')).set('Authorization', `Bearer ${refreshed.body.data.token}`);
      expect(me.status).toBe(200);
      expect(me.body.data.email).toBe(user.email);
    }
  });

  it('a seeker who also has a staff record (not an admin) keeps their seeker sign-in', async () => {
    const user = await User.create({ name: 'Yaw', email: 'yaw161@example.com', role: 'seeker', emailVerified: true, passwordHash: await bcrypt.hash(PASSWORD, 12) });
    await StaffMember.create({ userId: user._id, name: user.name, email: user.email, roles: ['support'], status: 'active' });
    expect((await signIn(user.email)).status).toBe(200);
    // ...and the token stays a seeker's: no admin-only route.
    expect((await request(app).get(api('/users')).set(...bearer(user))).status).toBe(403);
  });
});

// ---- The live route tree (same walk as security.p0's SEC-002 manifest) ---------------------------------------
const mountPrefixOf = (layer) => {
  if (!layer.regexp?.source) return '';
  const decoded = layer.regexp.source.replace(/^\^/, '').replace(/\\/g, '');
  const match = decoded.match(/^(.*?)\/\?\(\?=\/\|\$\)$/);
  return match ? match[1] : '';
};
const enumerateRoutes = (root) => {
  const found = [];
  const walk = (stack, prefix) => {
    for (const layer of stack || []) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods || {})) {
          if (['get', 'post', 'patch', 'put', 'delete'].includes(method)) found.push({ method, path: `${prefix}${layer.route.path}` });
        }
      } else if (layer.handle?.stack) {
        walk(layer.handle.stack, `${prefix}${mountPrefixOf(layer)}`);
      }
    }
  };
  walk(root.stack, '');
  return found;
};
const concretize = (path) => path.replace(/:[A-Za-z0-9_]+\??/g, FAKE_ID).replace(/\/+$/, '') || '/';

const LIVE_ROUTES = enumerateRoutes(app._router);
const isMounted = (method, url) => LIVE_ROUTES.some((route) => route.method === method && concretize(route.path) === url);

/** Policy actions no app user may take: every `ADMIN_ONLY` action, and the ones nobody may take (`[]`). */
const NON_USER_ROLES = new Set([ADMIN]);
const POLICY_REQUESTS = Object.entries(RESOURCE_POLICIES).flatMap(([policyKey, policy]) =>
  ['read', 'create', 'update', 'delete']
    .filter((action) => policy[action] !== AUTHENTICATED && Array.isArray(policy[action]) && policy[action].every((role) => NON_USER_ROLES.has(role)))
    .flatMap((action) => {
      const collection = api(`/${policyKey}`);
      const item = `${collection}/${FAKE_ID}`;
      const requests = {
        read: [{ method: 'get', url: collection }, { method: 'get', url: item }],
        create: [{ method: 'post', url: collection }],
        update: [{ method: 'patch', url: item }],
        delete: [{ method: 'delete', url: item }],
      }[action];
      return requests.map((entry) => ({ ...entry, policyKey, action, rootAllowed: policy[action].includes(ADMIN) }));
    }));
const ADMIN_ONLY_REQUESTS = POLICY_REQUESTS.filter(({ method, url }) => isMounted(method, url));

describe('SEC-161 manifest: admin-only general routes', () => {
  it('derives the admin-only requests from the policy table', () => {
    expect(ADMIN_ONLY_REQUESTS.length).toBeGreaterThan(30);
    expect(ADMIN_ONLY_REQUESTS).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: 'get', url: api('/users') }),
      expect.objectContaining({ method: 'get', url: api('/grant-applications') }),
      expect.objectContaining({ method: 'patch', url: api(`/events/${FAKE_ID}`) }),
    ]));
    // `event-attendees` has no collection mount: bookings live under /events/:eventId/attendees (hand-written, guarded
    // by the same policy, and covered by the route-tree sweep below), and its update and delete have no route at all.
    const unmounted = POLICY_REQUESTS.filter(({ method, url }) => !isMounted(method, url));
    expect([...new Set(unmounted.map(({ policyKey }) => policyKey))]).toEqual(['event-attendees']);
  });

  it.each(['partnerships_officer', 'support', 'super_admin'])('a %s app token gets 401 or 403 on every one', async (role) => {
    const staffer = await createAdminUser({ roles: [role] });
    const leaks = [];
    for (const { method, url } of ADMIN_ONLY_REQUESTS) {
      const res = await request(app)[method](url).set(...bearer(staffer)).send({});
      if (res.status !== 401 && res.status !== 403) leaks.push(`${method.toUpperCase()} ${url} -> ${res.status}`);
    }
    expect(leaks).toEqual([]);
  });

  it('the root admin app token still gets past the guard on each one its policy allows', async () => {
    const root = await createAdminUser({ roles: null });
    const refused = [];
    for (const { method, url, rootAllowed } of ADMIN_ONLY_REQUESTS) {
      if (!rootAllowed) continue;
      const res = await request(app)[method](url).set(...bearer(root)).send({});
      if (res.status === 401 || res.status === 403) refused.push(`${method.toUpperCase()} ${url} -> ${res.status}`);
    }
    expect(refused).toEqual([]);
  });
});

describe('SEC-161 manifest: the whole general route tree', () => {
  // The admin realm (`/admin/*`, `/auth/admin/*`) has its own guards and matrix (SEC-131, SEC-132); the website sync
  // authenticates with HMAC (BE-026). Every other /api/v1 route is in scope.
  const GENERAL_ROUTES = LIVE_ROUTES.filter(({ path }) => path.startsWith('/api/v1/')
    && !path.startsWith('/api/v1/admin')
    && !path.startsWith('/api/v1/auth/admin')
    && !path.startsWith('/api/v1/sync'));

  it('finds the general routes', () => {
    expect(GENERAL_ROUTES.length).toBeGreaterThan(80);
  });

  it('a staff app token never gets further than no token at all', async () => {
    const staffer = await createAdminUser({ roles: ['support'] });
    const leaks = [];
    for (const { method, path } of GENERAL_ROUTES) {
      const url = concretize(path);
      const withToken = await request(app)[method](url).set(...bearer(staffer)).send({});
      if (withToken.status === 401 || withToken.status === 403) continue;
      const anonymous = await request(app)[method](url).send({});
      if (withToken.status !== anonymous.status) leaks.push(`${method.toUpperCase()} ${url} -> ${withToken.status} (anonymous ${anonymous.status})`);
    }
    expect(leaks).toEqual([]);
  });
});

describe('SEC-161: realtime', () => {
  let server;
  let io;
  let serverUrl;

  beforeAll(async () => {
    server = http.createServer(app);
    io = initSocket(server);
    await new Promise((resolve) => server.listen(0, resolve));
    serverUrl = `http://localhost:${server.address().port}`;
  });

  afterAll(async () => {
    io.close();
    await new Promise((resolve) => server.close(resolve));
    server.unref();
  });

  /** Resolves 'connected' or the handshake's error message; the client never reconnects (see socket.integration). */
  const connect = (token) => new Promise((resolve) => {
    const client = ClientIO(serverUrl, { auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false, timeout: 10000 });
    client.on('connect', () => { client.close(); resolve('connected'); });
    client.on('connect_error', (error) => { client.close(); resolve(error.message); });
  });

  it('the socket handshake refuses a staff app token and accepts the root admin', async () => {
    const staffer = await createAdminUser({ roles: ['support'] });
    const root = await createAdminUser({ roles: null });
    expect(await connect(signToken(staffer))).toMatch(/^UNAUTHORIZED: Team accounts/);
    expect(await connect(signToken(root))).toBe('connected');
  });
});
