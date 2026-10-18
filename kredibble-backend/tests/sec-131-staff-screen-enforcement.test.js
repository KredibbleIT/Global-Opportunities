import fs from 'node:fs';
import mongoose from 'mongoose';
import request from 'supertest';
import { app } from '../src/app.js';
import { User, StaffMember } from '../src/models/User.js';
import { signAdminToken, signToken } from '../src/middleware/auth.js';
import { resolveStaffRoles } from '../src/middleware/portal-auth.js';
import { ROLE_IDS, roleCan, invalidateTogglesCache } from '../src/lib/permissions.js';

/**
 * SEC-131: requireScreen and requirePortalRoles used to let every admin
 * session through, and every staff member signs in with one, so the BE-001
 * matrix never applied to staff. These tests drive real routes with real
 * tokens and check each role gets exactly what roleCan gives it.
 */

const api = (path) => `/api/v1${path}`;
const randomId = () => new mongoose.Types.ObjectId().toString();
const ROOT_ADMIN = 'root admin (no staff record)';

// One GET and one write per screen that has a requireScreen route. Writes send
// an empty body (or `body`, with an unknown id) so an allowed caller stops at
// validation or a 404 and nothing is written. Since SEC-133 the BE-001 matrix alone decides:
// no route chains an older role list any more.
const SCREEN_ROUTES = [
  { screens: ['overview'], level: 'view', method: 'get', path: '/admin/targets' },
  { screens: ['insights', 'overview', 'monthly_report'], level: 'view', method: 'get', path: '/admin/website-audience' },
  { screens: ['insights'], level: 'edit', method: 'put', path: '/admin/website-audience/2026-09' },
  { screens: ['monthly_report'], level: 'view', method: 'get', path: '/admin/monthly-reports' },
  { screens: ['monthly_report'], level: 'view', method: 'post', path: '/admin/monthly-reports' },
  { screens: ['my_scorecard'], level: 'view', method: 'get', path: '/admin/scorecards/me' },
  { screens: ['team_scorecard'], level: 'view', method: 'get', path: '/admin/scorecards/team' },
  { screens: ['opportunities_queue'], level: 'view', method: 'get', path: '/admin/opportunities' },
  // SEC-137: approving or rejecting is the queue's; creating, rewriting and deleting a listing are listings_curate's.
  { screens: ['opportunities_queue'], level: 'edit', method: 'patch', path: () => `/admin/opportunities/${randomId()}`, body: { moderationStatus: 'rejected' } },
  { screens: ['opportunities_queue'], level: 'edit', method: 'post', path: () => `/admin/opportunities/${randomId()}/unpublish` },
  { screens: ['listings_curate'], level: 'edit', method: 'post', path: '/admin/opportunities' },
  { screens: ['listings_curate'], level: 'edit', method: 'patch', path: () => `/admin/opportunities/${randomId()}`, body: { title: 'Probe listing title' } },
  { screens: ['listings_curate'], level: 'edit', method: 'delete', path: () => `/admin/opportunities/${randomId()}` },
  { screens: ['programs'], level: 'view', method: 'get', path: '/admin/programs' },
  { screens: ['programs'], level: 'edit', method: 'patch', path: () => `/admin/programs/${randomId()}` },
  { screens: ['partners'], level: 'view', method: 'get', path: '/admin/partners' },
  { screens: ['partners'], level: 'edit', method: 'post', path: '/admin/partners' },
  { screens: ['network'], level: 'view', method: 'get', path: '/admin/network/summary' },
  { screens: ['network'], level: 'edit', method: 'post', path: () => `/admin/ambassadors/${randomId()}/amplifications` },
  { screens: ['leaderboard', 'network'], level: 'view', method: 'get', path: '/admin/leaderboard' },
  { screens: ['social'], level: 'view', method: 'get', path: '/admin/social-posts' },
  { screens: ['social'], level: 'edit', method: 'post', path: '/admin/social-posts' },
  { screens: ['database'], level: 'view', method: 'get', path: '/admin/beneficiaries' },
  { screens: ['database'], level: 'edit', method: 'post', path: '/admin/beneficiaries' },
  { screens: ['settings_admin'], level: 'view', method: 'get', path: '/admin/targets/history' },
  { screens: ['settings_admin'], level: 'edit', method: 'post', path: '/admin/targets' },
  { screens: ['settings'], level: 'view', method: 'get', path: '/admin/settings/account' },
  { screens: ['settings'], level: 'edit', method: 'put', path: '/admin/settings/account' },
  { screens: ['roles_permissions'], level: 'view', method: 'get', path: '/admin/roles-permissions' },
  { screens: ['roles_permissions'], level: 'edit', method: 'put', path: '/admin/roles-permissions' },
  { screens: ['testimonials'], level: 'view', method: 'get', path: '/admin/testimonials' },
  { screens: ['testimonials'], level: 'edit', method: 'post', path: '/admin/testimonials' },
  { screens: ['team'], level: 'view', method: 'get', path: '/admin/staff' },
  { screens: ['team'], level: 'edit', method: 'patch', path: () => `/admin/staff/${randomId()}` }, // invites are Super Admin only (SEC-132)
  { screens: ['notifications'], level: 'view', method: 'get', path: '/admin/notifications' },
  { screens: ['notifications'], level: 'edit', method: 'post', path: '/admin/notifications' },
  { screens: ['reference_data'], level: 'view', method: 'get', path: '/admin/reference-data' },
  { screens: ['reference_data'], level: 'edit', method: 'put', path: '/admin/reference-data/countries/probe' },
  { screens: ['channels'], level: 'view', method: 'get', path: '/admin/community/channels' },
  { screens: ['channels'], level: 'edit', method: 'post', path: '/admin/community/channels' },
  // SEC-133: these four had only an older role list; now each has its screen.
  { screens: ['overview'], level: 'view', method: 'get', path: '/admin/dashboard' },
  { screens: ['monthly_report'], level: 'view', method: 'get', path: '/admin/reports/monthly' },
  { screens: ['team_scorecard'], level: 'view', method: 'get', path: '/admin/reports/team' },
  { screens: ['settings_admin'], level: 'edit', method: 'put', path: '/admin/targets/probe_metric' },
];

const GUARD_MESSAGES = /insufficient permissions for screen|do not have staff access|do not have access to this admin function/;

const expectedFor = (roles, route) => route.screens.some((screen) => roleCan(roles, screen, route.level));

const pathOf = (route) => (typeof route.path === 'function' ? route.path() : route.path);

const call = (route, credentials, path = pathOf(route)) => {
  let req = request(app)[route.method](api(path));
  if (credentials.cookie) req = req.set('Cookie', credentials.cookie);
  if (credentials.bearer) req = req.set('Authorization', `Bearer ${credentials.bearer}`);
  return route.method === 'get' ? req : req.send(route.body ?? {});
};

/** Every row the caller got wrong, as readable strings (empty when all match). */
const mismatches = async (routes, roles, credentials) => {
  const wrong = [];
  for (const route of routes) {
    const path = pathOf(route);
    const res = await call(route, credentials, path);
    const label = `${route.method.toUpperCase()} ${path}`;
    if (expectedFor(roles, route)) {
      if ([401, 403].includes(res.status) || res.status >= 500) {
        wrong.push(`${label}: expected access, got ${res.status} ${res.body?.error?.message || ''}`);
      }
    } else if (res.status !== 403 || !GUARD_MESSAGES.test(res.body?.error?.message || '')) {
      wrong.push(`${label}: expected 403 from the guard, got ${res.status} ${res.body?.error?.message || ''}`);
    }
  }
  return wrong;
};

let sequence = 0;
/** A staff User exactly as BE-028 creates one (role admin), with a staff record. */
const createStaffUser = async ({ roles, status = 'active' }) => {
  sequence += 1;
  const user = await User.create({
    name: `Staff ${sequence}`,
    email: `sec131-staff-${sequence}@example.com`,
    role: 'admin',
    passwordHash: 'x',
  });
  if (roles) {
    await StaffMember.create({ userId: user._id, name: user.name, email: user.email, roles, status });
  }
  return user;
};

const adminSession = (user) => ({ cookie: `kredibble_admin_token=${signAdminToken(user)}` });
const userRealm = (user) => ({ bearer: signToken(user) });

beforeEach(() => invalidateTogglesCache());

describe('SEC-131: the route table covers every requireScreen screen', () => {
  it('lists every screen named by a requireScreen guard in admin-api.js', () => {
    const source = fs.readFileSync(new URL('../src/routes/admin-api.js', import.meta.url), 'utf8');
    const guarded = new Set();
    for (const match of source.matchAll(/requireScreen\(\s*(\[[^\]]*\]|'[^']+')/g)) {
      for (const name of match[1].matchAll(/'([^']+)'/g)) guarded.add(name[1]);
    }
    const covered = new Set(SCREEN_ROUTES.flatMap((route) => route.screens));
    expect([...guarded].filter((screen) => !covered.has(screen))).toEqual([]);
    expect(guarded.size).toBeGreaterThan(15);
  });
});

describe('SEC-131: every role against every screen, through real routes', () => {
  describe.each([
    ['admin-session staff', adminSession],
    ['user-realm staff', userRealm],
  ])('%s', (realm, credentialsFor) => {
    it.each(ROLE_IDS)('%s gets exactly its matrix screens', async (role) => {
      const user = await createStaffUser({ roles: [role] });
      const wrong = await mismatches(SCREEN_ROUTES, [role], credentialsFor(user));
      expect(wrong).toEqual([]);
    });

    it('a two-role staffer gets the union of both rows', async () => {
      const roles = ['partnerships_officer', 'training_officer'];
      const user = await createStaffUser({ roles });
      const wrong = await mismatches(SCREEN_ROUTES, roles, credentialsFor(user));
      expect(wrong).toEqual([]);
    });
  });

  it(`${ROOT_ADMIN} keeps full access`, async () => {
    const rootAdmin = await createStaffUser({});
    const wrong = await mismatches(SCREEN_ROUTES, ['super_admin'], adminSession(rootAdmin));
    expect(wrong).toEqual([]);
  });
});

describe('SEC-131: the 2026-10-17 probe', () => {
  it('a support-only staffer with an admin session cannot read or create partners', async () => {
    const support = await createStaffUser({ roles: ['support'] });
    const credentials = adminSession(support);

    const list = await call({ method: 'get', path: '/admin/partners' }, credentials);
    expect(list.status).toBe(403);

    const create = await request(app)
      .post(api('/admin/partners'))
      .set('Cookie', credentials.cookie)
      .send({ organizationName: 'Probe Partner Ltd', stage: 'prospect' });
    expect(create.status).toBe(403);
  });
});

describe('SEC-131: suspended and invited staff get nothing', () => {
  const guardedRoutes = [
    { label: 'requireScreen', method: 'get', path: '/admin/partners' },
    { label: 'requireScreen (opportunities queue)', method: 'get', path: '/admin/opportunities' },
    { label: 'requireScreen (dashboard)', method: 'get', path: '/admin/dashboard' },
    { label: 'requireAdminScreen', method: 'get', path: '/admin/seekers' },
    { label: 'requireStaffRoles', method: 'get', path: '/admin/ambassadors/history' },
    { label: 'requireSuperAdmin', method: 'get', path: '/admin/audit-log?scope=accounts' },
  ];

  it.each(['suspended', 'invited'])('a %s Super Admin with an admin session gets 403 from every guard', async (status) => {
    const superAdmin = await createStaffUser({ roles: ['super_admin'], status });
    const credentials = adminSession(superAdmin);
    for (const route of guardedRoutes) {
      const res = await call(route, credentials);
      expect({ guard: route.label, status: res.status }).toEqual({ guard: route.label, status: 403 });
    }
  });

  it('the same routes let an active Super Admin and the root admin through', async () => {
    const activeSuperAdmin = await createStaffUser({ roles: ['super_admin'] });
    const rootAdmin = await createStaffUser({});
    for (const user of [activeSuperAdmin, rootAdmin]) {
      for (const route of guardedRoutes) {
        const res = await call(route, adminSession(user));
        expect({ guard: route.label, status: res.status }).toEqual({ guard: route.label, status: 200 });
      }
    }
  });

  it('/auth/admin/me rejects a suspended staffer instead of reporting super_admin', async () => {
    const suspended = await createStaffUser({ roles: ['super_admin'], status: 'suspended' });
    const res = await request(app).get(api('/auth/admin/me')).set('Cookie', adminSession(suspended).cookie);
    expect(res.status).toBe(401);
  });

  it('/auth/admin/me reports the staff roles, and super_admin only for the root admin', async () => {
    const support = await createStaffUser({ roles: ['support'] });
    const supportMe = await request(app).get(api('/auth/admin/me')).set('Cookie', adminSession(support).cookie);
    expect(supportMe.status).toBe(200);
    expect(supportMe.body.data.roles).toEqual(['support']);
    expect(supportMe.body.data.screens.partners).toBeUndefined();

    const rootAdmin = await createStaffUser({});
    const rootMe = await request(app).get(api('/auth/admin/me')).set('Cookie', adminSession(rootAdmin).cookie);
    expect(rootMe.status).toBe(200);
    expect(rootMe.body.data.roles).toEqual(['super_admin']);
    expect(rootMe.body.data.staff).toBeNull();
  });
});

describe('SEC-131: resolveStaffRoles', () => {
  const adminRequest = (user) => ({ auth: { sub: user._id.toString(), role: 'admin', aud: 'kredibble-admin' } });

  it('reads an active record, normalizing a legacy single role string', async () => {
    const user = await createStaffUser({});
    // Written past the schema hooks, as records from before BE-001 are.
    await StaffMember.collection.insertOne({ userId: user._id, name: user.name, email: user.email, role: 'Desk Lead', status: 'active' });
    const { roles, staff } = await resolveStaffRoles(adminRequest(user));
    expect(roles).toEqual(['desk_lead']);
    expect(staff.email).toBe(user.email);
  });

  it('gives super_admin only to an admin session with no staff record', async () => {
    const rootAdmin = await createStaffUser({});
    expect(await resolveStaffRoles(adminRequest(rootAdmin))).toEqual({ roles: ['super_admin'], staff: null });
    // The same user on a user-realm token (no admin audience) gets nothing.
    expect(await resolveStaffRoles({ auth: { sub: rootAdmin._id.toString(), role: 'admin' } })).toEqual({ roles: [], staff: null });
  });

  it('gives nothing to a suspended record or a missing subject', async () => {
    const suspended = await createStaffUser({ roles: ['desk_lead'], status: 'suspended' });
    expect(await resolveStaffRoles(adminRequest(suspended))).toEqual({ roles: [], staff: null });
    expect(await resolveStaffRoles({})).toEqual({ roles: [], staff: null });
  });

  it('resolves once per request, so two chained guards see the same roles', async () => {
    const lead = await createStaffUser({ roles: ['desk_lead'] });
    const req = adminRequest(lead);
    const first = await resolveStaffRoles(req);
    await StaffMember.updateOne({ userId: lead._id }, { status: 'suspended' });
    expect(await resolveStaffRoles(req)).toBe(first);
    expect(await resolveStaffRoles(adminRequest(lead))).toEqual({ roles: [], staff: null });
  });
});
