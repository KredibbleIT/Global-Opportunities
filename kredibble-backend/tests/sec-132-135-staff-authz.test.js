import mongoose from 'mongoose';
import request from 'supertest';
import { app } from '../src/app.js';
import { User, StaffMember } from '../src/models/User.js';
import { Partner, Program } from '../src/models/AdminPortal.js';
import { signAdminToken, signToken } from '../src/middleware/auth.js';
import { ROLE_IDS, roleCan, invalidateTogglesCache } from '../src/lib/permissions.js';

/**
 * SEC-132 to SEC-135: the gaps left after SEC-131.
 * - SEC-132: no /admin route takes an admin session alone, and no route lets a
 *   non-Super-Admin create a staff record or change one's roles.
 * - SEC-133: the BE-001 matrix is the only authority (Moderator moderates the
 *   opportunities queue; Admin Support can't change targets).
 * - Revoked sessions: once SEC-134 ends a removed staffer's sessions, every staff
 *   guard refuses the old one (SEC-134's own rules have their own test file).
 * - SEC-135: the Partners and Programs pages read their lookups under their own
 *   grants.
 * ALL DATA IS FAKE.
 */

const api = (path) => `/api/v1${path}`;
const randomId = () => new mongoose.Types.ObjectId().toString();

let sequence = 0;
/** A staff User as BE-028 creates one (role admin), with a staff record unless `roles` is null (the root admin). */
const createStaffUser = async ({ roles, status = 'active' } = {}) => {
  sequence += 1;
  const user = await User.create({ name: `Staff ${sequence}`, email: `sec132-${sequence}@example.com`, role: 'admin', passwordHash: 'x' });
  if (roles) await StaffMember.create({ userId: user._id, name: user.name, email: user.email, roles, status });
  return user;
};
const cookieOf = (user) => `kredibble_admin_token=${signAdminToken(user)}`;
const as = (user) => ({
  get: (path) => request(app).get(api(path)).set('Cookie', cookieOf(user)),
  post: (path, body = {}) => request(app).post(api(path)).set('Cookie', cookieOf(user)).send(body),
  patch: (path, body = {}) => request(app).patch(api(path)).set('Cookie', cookieOf(user)).send(body),
  put: (path, body = {}) => request(app).put(api(path)).set('Cookie', cookieOf(user)).send(body),
  delete: (path) => request(app).delete(api(path)).set('Cookie', cookieOf(user)),
});

beforeEach(() => invalidateTogglesCache());

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
const concretize = (path) => path.replace(/:[A-Za-z0-9_]+\??/g, '64b7f1c2a1b2c3d4e5f60718').replace(/\/+$/, '') || '/';

describe('SEC-132: no /admin route takes an admin session alone', () => {
  const adminRoutes = enumerateRoutes(app._router).filter(({ path }) => path.startsWith('/api/v1/admin'));

  it('finds the admin routes', () => {
    expect(adminRoutes.length).toBeGreaterThan(100);
  });

  it.each(['suspended', 'deactivated', 'invited'])('a %s staffer\'s admin session gets 403 on every /admin route', async (status) => {
    // Passes requireAdminAuth (a valid admin session) but holds no roles: a route
    // guarded by the session alone answers something other than 403.
    const user = await createStaffUser({ roles: ['super_admin'], status });
    const leaks = [];
    for (const { method, path } of adminRoutes) {
      const url = concretize(path);
      const res = await request(app)[method](url).set('Cookie', cookieOf(user)).send({});
      if (res.status !== 403) leaks.push(`${method.toUpperCase()} ${url} -> ${res.status}`);
    }
    expect(leaks).toEqual([]);
  });
});

describe('SEC-132: the /admin data collections follow the matrix', () => {
  const DATA_ROUTES = [
    { screen: 'overview', level: 'view', method: 'get', path: '/admin/analytics' },
    { screen: 'seekers', level: 'view', method: 'get', path: '/admin/seekers' },
    { screen: 'seekers', level: 'edit', method: 'patch', path: () => `/admin/seekers/${randomId()}` },
    { screen: 'hirers', level: 'view', method: 'get', path: '/admin/hirers' },
    { screen: 'verification', level: 'view', method: 'get', path: '/admin/verification/companies' },
    { screen: 'verification', level: 'edit', method: 'patch', path: () => `/admin/verification/documents/${randomId()}` },
    { screen: 'events', level: 'view', method: 'get', path: '/admin/events' },
    { screen: 'grants', level: 'edit', method: 'post', path: '/admin/grants' },
    { screen: 'career_resources', level: 'view', method: 'get', path: '/admin/articles' },
    { screen: 'reports_queue', level: 'view', method: 'get', path: '/admin/reports' },
    { screen: 'channels', level: 'view', method: 'get', path: '/admin/community/posts' },
    { screen: 'channels', level: 'edit', method: 'post', path: '/admin/channels' },
    { screen: 'network', level: 'view', method: 'get', path: '/admin/ambassador-requests' },
    { screen: 'network', level: 'edit', method: 'post', path: () => `/admin/ambassador-requests/${randomId()}/reject` },
    { screen: 'team', level: 'view', method: 'get', path: () => `/admin/staff/${randomId()}` },
  ];

  it.each(ROLE_IDS)('%s gets exactly its matrix screens on the data routes', async (role) => {
    const user = await createStaffUser({ roles: [role] });
    const wrong = [];
    for (const route of DATA_ROUTES) {
      const path = typeof route.path === 'function' ? route.path() : route.path;
      const res = await as(user)[route.method](path);
      const allowed = roleCan([role], route.screen, route.level);
      if (allowed && [401, 403].includes(res.status)) wrong.push(`${route.method} ${path}: expected access, got ${res.status}`);
      if (!allowed && res.status !== 403) wrong.push(`${route.method} ${path}: expected 403, got ${res.status}`);
    }
    expect(wrong).toEqual([]);
  });
});

describe('SEC-132: nobody but a Super Admin creates staff or changes roles', () => {
  it('the 2026-10-17 probe: an Admin Support staffer cannot make anyone a Super Admin', async () => {
    const support = await createStaffUser({ roles: ['admin_support'] });
    const target = await createStaffUser({ roles: ['support'] });
    const outsider = await User.create({ name: 'Test Outsider', email: 'sec132-outsider@example.com', role: 'admin', passwordHash: 'x' });
    const targetRecord = await StaffMember.findOne({ userId: target._id });

    // The old /admin/staff collection: writes are Super Admin only.
    expect((await as(support).post('/admin/staff', { userId: String(outsider._id), name: 'X', email: outsider.email, role: 'super_admin' })).status).toBe(403);
    // The staff portal: invites and role changes are Super Admin only.
    expect((await as(support).post('/admin/staff/invite', { email: outsider.email, roles: ['super_admin'] })).status).toBe(403);
    expect((await as(support).patch(`/admin/staff/${targetRecord._id}`, { roles: ['super_admin'] })).status).toBe(403);
    expect((await as(support).put(`/admin/staff/${targetRecord._id}`, { status: 'suspended' })).status).toBe(403);
    // Team edit still renames.
    expect((await as(support).patch(`/admin/staff/${targetRecord._id}`, { name: 'Renamed Staffer' })).status).toBe(200);

    expect((await StaffMember.findById(targetRecord._id).lean()).roles).toEqual(['support']);
    expect(await StaffMember.exists({ userId: outsider._id })).toBeNull();
  });

  it('a Super Admin may change roles, but not their own, and the collection never sets roles or status', async () => {
    const boss = await createStaffUser({ roles: ['super_admin'] });
    await createStaffUser({ roles: ['super_admin'] }); // so the boss is not the last Super Admin
    const target = await createStaffUser({ roles: ['support'] });
    const record = await StaffMember.findOne({ userId: target._id });
    expect((await as(boss).patch(`/admin/staff/${record._id}`, { roles: ['desk_lead'] })).status).toBe(200);
    expect((await StaffMember.findById(record._id).lean()).roles).toEqual(['desk_lead']);

    const own = await StaffMember.findOne({ userId: boss._id });
    const self = await as(boss).patch(`/admin/staff/${own._id}`, { roles: ['support'] });
    expect(self.status).toBe(403);
    expect(self.body.error.message).toMatch(/your own roles/);

    // Through the old collection, role and status are not writable fields.
    const lone = await User.create({ name: 'Test Lone', email: 'sec132-lone@example.com', role: 'admin', passwordHash: 'x' });
    const made = await as(boss).post('/admin/staff', { userId: String(lone._id), name: 'Test Lone', email: lone.email, role: 'super_admin', status: 'active' });
    expect(made.status).not.toBe(500);
    // Either refused (a staff record needs roles, which this route no longer takes) or saved without them.
    expect(await StaffMember.exists({ userId: lone._id, $or: [{ roles: 'super_admin' }, { role: 'super_admin' }] })).toBeNull();
  });

  it('/users cannot set a role, so it cannot turn an account into an admin with no staff record', async () => {
    const staffer = await createStaffUser({ roles: ['support'] });
    const victim = await User.create({ name: 'Test Second Account', email: 'sec132-second@example.com', role: 'seeker', passwordHash: 'x' });
    await request(app)
      .patch(api(`/users/${victim._id}`))
      .set('Authorization', `Bearer ${signToken(staffer)}`)
      .send({ role: 'admin', name: 'Test Second Account' });
    expect((await User.findById(victim._id).lean()).role).toBe('seeker');
  });
});

describe('SEC-133: the matrix alone decides', () => {
  it('a moderator with an admin session lists and moderates the opportunities queue', async () => {
    const moderator = await createStaffUser({ roles: ['moderator'] });
    expect((await as(moderator).get('/admin/opportunities')).status).toBe(200);
    // Moderating is a PATCH of moderationStatus/vetted: past the guard, stopped by the unknown id.
    const moderated = await as(moderator).patch(`/admin/opportunities/${new mongoose.Types.ObjectId()}`, { moderationStatus: 'rejected' });
    expect(moderated.status).toBe(404);
    // SEC-137: creating a listing is listings_curate's, which a Moderator does not hold.
    expect((await as(moderator).post('/admin/opportunities', {})).status).toBe(403);
  });

  it('Admin Support cannot change a monthly target; Desk Lead can reach the route', async () => {
    const support = await createStaffUser({ roles: ['admin_support'] });
    const lead = await createStaffUser({ roles: ['desk_lead'] });
    expect((await as(support).put('/admin/targets/partners_onboarded', {})).status).toBe(403);
    expect((await as(lead).put('/admin/targets/partners_onboarded', {})).status).not.toBe(403);
  });
});

describe('Revoked admin sessions are refused by every staff guard (with SEC-134)', () => {
  // SEC-134's own rules (who may remove whom) are in sec-134-staff-access-changes.test.js.
  it('after a Super Admin removes a staffer, the old session gets 401 and a fresh one holds no roles', async () => {
    const boss = await createStaffUser({ roles: ['super_admin'] });
    const victim = await createStaffUser({ roles: ['support'] });
    const oldCookie = cookieOf(victim);
    const record = await StaffMember.findOne({ userId: victim._id });
    expect((await as(boss).delete(`/admin/staff/${record._id}`)).status).toBe(200);

    expect((await request(app).get(api('/admin/roles-permissions')).set('Cookie', oldCookie)).status).toBe(401);
    const fresh = await User.findById(victim._id);
    expect((await as(fresh).get('/admin/roles-permissions')).status).toBe(403);
    expect((await request(app).get(api('/auth/admin/me')).set('Cookie', cookieOf(fresh))).status).toBe(401);
  });
});

describe('SEC-135: Partners and Programs lookups under their own grants', () => {
  it('a Partnerships Officer sees a partner\'s programs and picks an owner without the Programs or Team screens', async () => {
    const officer = await createStaffUser({ roles: ['partnerships_officer'] });
    await createStaffUser({ roles: ['desk_lead'] });
    const partner = await Partner.create({ organizationName: 'Example Partner Foundation', partnerType: 'foundation', stage: 'prospect', createdBy: officer._id });
    await Program.create({ title: 'Test Bootcamp', programType: 'bootcamp', status: 'planned', partnerId: partner._id, startAt: new Date('2026-11-02T09:00:00Z'), notes: 'Internal note' });
    await Program.create({ title: 'Unlinked Webinar', programType: 'webinar', status: 'planned' });

    const detail = await as(officer).get(`/admin/partners/${partner._id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.programs).toHaveLength(1);
    expect(detail.body.data.programs[0]).toEqual({
      id: expect.any(String), title: 'Test Bootcamp', programType: 'bootcamp', status: 'planned',
      startAt: '2026-11-02T09:00:00.000Z', partnerId: String(partner._id),
    });

    const owners = await as(officer).get('/admin/partners/owner-options');
    expect(owners.status).toBe(200);
    expect(owners.body.data.map((option) => Object.keys(option).sort())).toContainEqual(['id', 'name', 'roles']);
    expect(owners.body.data.some((option) => option.roles.includes('desk_lead'))).toBe(true);

    // Still no Programs or Team screen.
    expect((await as(officer).get('/admin/programs')).status).toBe(403);
    expect((await as(officer).get('/admin/staff')).status).toBe(403);
  });

  it('a Training Officer picks a program\'s partner without the Partners screen', async () => {
    const officer = await createStaffUser({ roles: ['training_officer'] });
    await Partner.create({ organizationName: 'Sample Tech Company', partnerType: 'tech', stage: 'prospect', createdBy: officer._id });
    const options = await as(officer).get('/admin/programs/partner-options');
    expect(options.status).toBe(200);
    expect(options.body.data).toEqual([{ id: expect.any(String), name: 'Sample Tech Company' }]);
    expect((await as(officer).get('/admin/partners')).status).toBe(403);
  });

  it('every role\'s Overview lists upcoming programs, with only the card\'s fields', async () => {
    const officer = await createStaffUser({ roles: ['partnerships_officer'] });
    await Program.create({ title: 'Test Upcoming Bootcamp', programType: 'bootcamp', status: 'planned', startAt: new Date('2031-01-05T09:00:00Z'), notes: 'Internal note', facilitators: ['Test Facilitator'] });
    const res = await as(officer).get('/admin/programs/upcoming');
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toEqual({
      id: expect.any(String), title: 'Test Upcoming Bootcamp', programType: 'bootcamp', status: 'planned',
      startAt: '2031-01-05T09:00:00.000Z', participantCount: 0, participantTarget: 0, partnerName: null,
    });
    expect((await as(officer).get('/admin/programs')).status).toBe(403); // still no Programs screen
  });

  it('the lookups follow their pages\' edit grants', async () => {
    const support = await createStaffUser({ roles: ['support'] });
    const lead = await createStaffUser({ roles: ['country_lead'] }); // Partners and Programs view only
    for (const user of [support, lead]) {
      expect((await as(user).get('/admin/partners/owner-options')).status).toBe(403);
      expect((await as(user).get('/admin/programs/partner-options')).status).toBe(403);
    }
  });
});
