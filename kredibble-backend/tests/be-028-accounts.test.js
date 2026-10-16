import request from 'supertest';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { app } from '../src/app.js';
import { User, StaffMember } from '../src/models/User.js';
import { AccountInvite } from '../src/models/AdminPortal.js';
import { signToken, signAdminToken } from '../src/middleware/auth.js';
import { mintInviteToken, hashInviteToken } from '../src/lib/invite-tokens.js';

const api = (path) => `/api/v1${path}`;
const cookieHeader = (user) => ['Cookie', `kredibble_admin_token=${signAdminToken(user)}`];
const bearerHeader = (token) => ['Authorization', `Bearer ${token}`];

const makeAdminUser = async ({ email = 'admin@example.com', password = null } = {}) => {
  const user = await User.create({
    name: 'Admin User',
    email,
    emailNormalized: email.trim().toLowerCase(),
    role: 'admin',
    emailVerified: true,
    passwordHash: await bcrypt.hash(password || 'Password123', 12),
  });
  return user;
};

// Root-style Super Admin: admin session, no staff record (CLI-provisioned).
const makeRootCaller = async (email = 'root@example.com') => {
  const user = await makeAdminUser({ email });
  return { user, cookie: cookieHeader(user) };
};

// Staff Super Admin: admin session + active super_admin staff record.
const makeStaffSuperAdmin = async (email = 'super@example.com') => {
  const user = await makeAdminUser({ email });
  const staff = await StaffMember.create({
    userId: user._id,
    name: user.name,
    email: user.email,
    roles: ['super_admin'],
    role: 'super_admin',
    status: 'active',
    joinedDate: '2026-10-16',
  });
  return { user, staff, cookie: cookieHeader(user) };
};

// Ordinary staff caller (support role): must get 403 everywhere here.
const makeSupportCaller = async (email = 'support@example.com') => {
  const user = await makeAdminUser({ email });
  await StaffMember.create({
    userId: user._id,
    name: user.name,
    email: user.email,
    roles: ['support'],
    role: 'support',
    status: 'active',
    joinedDate: '2026-10-16',
  });
  return { user, cookie: cookieHeader(user) };
};

// Seed an invited account + known-token invite row without the HTTP layer.
const seedInvite = async ({ email = 'invite@example.com', type = 'user', group = '', expired = false } = {}) => {
  const emailNorm = email.trim().toLowerCase();
  const user = await User.create({
    name: 'Invited Person',
    email,
    emailNormalized: emailNorm,
    role: 'admin',
    emailVerified: true,
    passwordHash: await bcrypt.hash('Placeholder123', 12),
  });
  const roles = type === 'user' ? ['support'] : [group || 'admin_support'];
  const staff = await StaffMember.create({
    userId: user._id,
    name: user.name,
    email: user.email,
    roles,
    role: roles.join(','),
    status: 'invited',
    joinedDate: '2026-10-16',
  });
  const token = mintInviteToken();
  await AccountInvite.create({
    staffId: staff._id,
    emailNormalized: emailNorm,
    tokenHash: hashInviteToken(token),
    expiresAt: new Date(Date.now() + (expired ? -3600_000 : 48 * 3600_000)),
    lastFour: token.slice(-4),
    invitedBy: user._id,
  });
  return { token, staff, user };
};

const seedActiveStaff = async ({ email = 'staff@example.com', roles = ['support'] } = {}) => {
  const user = await makeAdminUser({ email, password: 'Password123' });
  const staff = await StaffMember.create({
    userId: user._id,
    name: user.name,
    email: user.email,
    roles,
    role: roles.join(','),
    status: 'active',
    joinedDate: '2026-10-16',
  });
  return { user, staff };
};

describe('BE-028: guest access is rejected', () => {
  it('anonymous callers get 401 on every admin accounts route', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    for (const [method, path, body] of [
      ['post', api('/admin/accounts'), {}],
      ['post', api(`/admin/accounts/${fakeId}/invite`), {}],
      ['patch', api(`/admin/accounts/${fakeId}/role`), {}],
      ['post', api(`/admin/accounts/${fakeId}/deactivate`), {}],
      ['post', api(`/admin/accounts/${fakeId}/reactivate`), {}],
      ['get', api('/admin/audit-log?scope=accounts'), undefined],
    ]) {
      const req = request(app)[method](path);
      const res = body === undefined ? await req : await req.send(body);
      expect([401, 403]).toContain(res.statusCode);
    }
  });

  it('a seeker Bearer token is rejected on the admin accounts namespace', async () => {
    const seeker = await User.create({
      name: 'Seeker', email: 'seeker28@example.com', emailNormalized: 'seeker28@example.com',
      role: 'seeker', passwordHash: 'x',
    });
    const res = await request(app)
      .post(api('/admin/accounts'))
      .set(...bearerHeader(signToken(seeker)))
      .send({ name: 'X', email: 'x28@example.com', type: 'user' });
    expect(res.statusCode).toBe(401);
  });

  it('support staff get 403 on every admin accounts route', async () => {
    const caller = await makeSupportCaller('support28@example.com');
    const fakeId = new mongoose.Types.ObjectId().toString();
    const paths = [
      request(app).post(api('/admin/accounts')).send({ name: 'X', email: 'x28b@example.com', type: 'user' }),
      request(app).post(api(`/admin/accounts/${fakeId}/invite`)),
      request(app).patch(api(`/admin/accounts/${fakeId}/role`)).send({ type: 'admin' }),
      request(app).post(api(`/admin/accounts/${fakeId}/deactivate`)),
      request(app).post(api(`/admin/accounts/${fakeId}/reactivate`)),
      request(app).get(api('/admin/audit-log?scope=accounts')),
    ];
    for (const p of paths) {
      const res = await p.set(...caller.cookie);
      expect(res.statusCode).toBe(403);
    }
  });
});

describe('BE-028: invite creation', () => {
  it('creates a user-type account as invited with support role', async () => {
    const caller = await makeRootCaller('root28a@example.com');
    const res = await request(app)
      .post(api('/admin/accounts'))
      .set(...caller.cookie)
      .send({ name: 'New User', email: 'newuser28@example.com', type: 'user' });
    expect(res.statusCode).toBe(201);
    expect(res.body.data.account.status).toBe('invited');
    expect(res.body.data.account.roles).toEqual(['support']);
    expect(res.body.data.account.passwordHash).toBeUndefined();
    const staff = await StaffMember.findById(res.body.data.account.id).lean();
    expect(staff.status).toBe('invited');
    const invite = await AccountInvite.findOne({ staffId: staff._id }).select('+tokenHash').lean();
    expect(invite).not.toBeNull();
    expect(invite.expiresAt.getTime()).toBeGreaterThan(Date.now());
    // Only the hash is stored; the link (or emailed flag) answers the client.
    expect(invite.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.data.emailed === true || res.body.data.invite?.url).toBeTruthy();
  });

  it('creates an admin-type account with the chosen group, defaulting to admin_support', async () => {
    const caller = await makeRootCaller('root28b@example.com');
    const grouped = await request(app)
      .post(api('/admin/accounts'))
      .set(...caller.cookie)
      .send({ name: 'Grouped Admin', email: 'grouped28@example.com', type: 'admin', group: 'database_officer' });
    expect(grouped.statusCode).toBe(201);
    expect(grouped.body.data.account.roles).toEqual(['database_officer']);

    const def = await request(app)
      .post(api('/admin/accounts'))
      .set(...caller.cookie)
      .send({ name: 'Default Admin', email: 'default28@example.com', type: 'admin' });
    expect(def.statusCode).toBe(201);
    expect(def.body.data.account.roles).toEqual(['admin_support']);
  });

  it('never creates a super_admin type or group', async () => {
    const caller = await makeRootCaller('root28c@example.com');
    const byType = await request(app)
      .post(api('/admin/accounts'))
      .set(...caller.cookie)
      .send({ name: 'Sneaky', email: 'sneaky28@example.com', type: 'super_admin' });
    expect(byType.statusCode).toBe(400);

    const byGroup = await request(app)
      .post(api('/admin/accounts'))
      .set(...caller.cookie)
      .send({ name: 'Sneaky', email: 'sneaky28b@example.com', type: 'admin', group: 'super_admin' });
    expect(byGroup.statusCode).toBe(400);
  });

  it('rejects duplicate emails, including existing app users', async () => {
    const caller = await makeRootCaller('root28d@example.com');
    const first = await request(app)
      .post(api('/admin/accounts'))
      .set(...caller.cookie)
      .send({ name: 'Dup', email: 'dup28@example.com', type: 'user' });
    expect(first.statusCode).toBe(201);
    const second = await request(app)
      .post(api('/admin/accounts'))
      .set(...caller.cookie)
      .send({ name: 'Dup Two', email: 'DUP28@example.com', type: 'user' });
    expect(second.statusCode).toBe(409);

    await User.create({
      name: 'App Seeker', email: 'appuser28@example.com', emailNormalized: 'appuser28@example.com',
      role: 'seeker', passwordHash: 'x',
    });
    const clash = await request(app)
      .post(api('/admin/accounts'))
      .set(...caller.cookie)
      .send({ name: 'Clash', email: 'appuser28@example.com', type: 'user' });
    expect(clash.statusCode).toBe(409);
  });

  it('never accepts a password on create', async () => {
    const caller = await makeRootCaller('root28e@example.com');
    const res = await request(app)
      .post(api('/admin/accounts'))
      .set(...caller.cookie)
      .send({ name: 'NoPass', email: 'nopass28@example.com', type: 'user', password: 'Password123' });
    // Unknown keys are stripped by validation; the account is still invited
    // and can only be activated through the invite flow.
    expect([201, 400]).toContain(res.statusCode);
    if (res.statusCode === 201) {
      const ok = await bcrypt.compare('Password123', (await User.findOne({ email: 'nopass28@example.com' })).passwordHash);
      expect(ok).toBe(false);
    }
  });
});

describe('BE-028: invite resend', () => {
  it('issues a new token and kills the old link', async () => {
    const caller = await makeRootCaller('root28f@example.com');
    const { token: oldToken, staff } = await seedInvite({ email: 'resend28@example.com' });
    const res = await request(app).post(api(`/admin/accounts/${staff._id}/invite`)).set(...caller.cookie);
    expect(res.statusCode).toBe(200);

    // Old link is dead.
    const stale = await request(app)
      .post(api('/auth/accept-invite'))
      .send({ token: oldToken, password: 'Password123' });
    expect(stale.statusCode).toBe(400);
  });

  it('refuses resend once the account is active', async () => {
    const caller = await makeRootCaller('root28g@example.com');
    const { staff } = await seedActiveStaff({ email: 'active28@example.com' });
    const res = await request(app).post(api(`/admin/accounts/${staff._id}/invite`)).set(...caller.cookie);
    expect(res.statusCode).toBe(409);
  });
});

describe('BE-028: invite acceptance', () => {
  it('activates the account, sets the password, and burns the token', async () => {
    const { token, staff } = await seedInvite({ email: 'accept28@example.com' });
    const res = await request(app)
      .post(api('/auth/accept-invite'))
      .send({ token, password: 'Password123' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.active).toBe(true);

    expect((await StaffMember.findById(staff._id).lean()).status).toBe('active');
    const user = await User.findOne({ email: 'accept28@example.com' });
    expect(await bcrypt.compare('Password123', user.passwordHash)).toBe(true);

    // Single use: replay is rejected.
    const replay = await request(app)
      .post(api('/auth/accept-invite'))
      .send({ token, password: 'Password123' });
    expect(replay.statusCode).toBe(400);

    // The new password signs in through the normal login.
    const login = await request(app)
      .post(api('/auth/login'))
      .send({ email: 'accept28@example.com', password: 'Password123' });
    expect(login.statusCode).toBe(200);
  });

  it('rejects unknown, expired, and weak-password attempts identically', async () => {
    await seedInvite({ email: 'accept28b@example.com' });
    const unknown = await request(app)
      .post(api('/auth/accept-invite'))
      .send({ token: 'a'.repeat(64), password: 'Password123' });
    expect(unknown.statusCode).toBe(400);

    const { token: expiring } = await seedInvite({ email: 'expired28@example.com', expired: true });
    const expired = await request(app)
      .post(api('/auth/accept-invite'))
      .send({ token: expiring, password: 'Password123' });
    expect(expired.statusCode).toBe(400);

    const { token: weakFor } = await seedInvite({ email: 'weak28@example.com' });
    const weak = await request(app)
      .post(api('/auth/accept-invite'))
      .send({ token: weakFor, password: 'password123' });
    expect(weak.statusCode).toBe(400);
  });

  it('accept-invite is public: anonymous malformed bodies get 400, not 401', async () => {
    const res = await request(app).post(api('/auth/accept-invite')).send({});
    expect(res.statusCode).toBe(400);
  });
});

describe('BE-028: role changes', () => {
  it('switches user <-> admin and records the change', async () => {
    const caller = await makeStaffSuperAdmin('mvroot28@example.com');
    const { staff } = await seedActiveStaff({ email: 'mover28@example.com', roles: ['support'] });

    const up = await request(app)
      .patch(api(`/admin/accounts/${staff._id}/role`))
      .set(...caller.cookie)
      .send({ type: 'admin', group: 'database_officer' });
    expect(up.statusCode).toBe(200);
    expect(up.body.data.roles).toEqual(['database_officer']);

    const down = await request(app)
      .patch(api(`/admin/accounts/${staff._id}/role`))
      .set(...caller.cookie)
      .send({ type: 'user' });
    expect(down.statusCode).toBe(200);
    expect(down.body.data.roles).toEqual(['support']);
  });

  it('refuses self-demotion, super_admin targets, and deactivated accounts', async () => {
    const caller = await makeStaffSuperAdmin('selfrole28@example.com');
    const self = await request(app)
      .patch(api(`/admin/accounts/${caller.staff._id}/role`))
      .set(...caller.cookie)
      .send({ type: 'user' });
    expect(self.statusCode).toBe(403);

    const other = await makeStaffSuperAdmin('othersuper28@example.com');
    const untouchable = await request(app)
      .patch(api(`/admin/accounts/${other.staff._id}/role`))
      .set(...caller.cookie)
      .send({ type: 'user' });
    expect(untouchable.statusCode).toBe(403);

    const { staff } = await seedActiveStaff({ email: 'offrole28@example.com' });
    await StaffMember.findByIdAndUpdate(staff._id, { status: 'deactivated' });
    const off = await request(app)
      .patch(api(`/admin/accounts/${staff._id}/role`))
      .set(...caller.cookie)
      .send({ type: 'admin' });
    expect(off.statusCode).toBe(409);
  });
});

describe('BE-028: deactivate and reactivate', () => {
  it('deactivates, kills sessions, and blocks fresh logins until reactivated', async () => {
    const caller = await makeRootCaller('deroot28@example.com');
    const { staff } = await seedActiveStaff({ email: 'leaver28@example.com' });

    const login = await request(app)
      .post(api('/auth/login'))
      .send({ email: 'leaver28@example.com', password: 'Password123' });
    expect(login.statusCode).toBe(200);

    const off = await request(app)
      .post(api(`/admin/accounts/${staff._id}/deactivate`))
      .set(...caller.cookie);
    expect(off.statusCode).toBe(200);
    expect(off.body.data.status).toBe('deactivated');

    const stale = await request(app).get(api('/auth/me')).set(...bearerHeader(login.body.data.token));
    expect(stale.statusCode).toBe(401);
    const refresh = await request(app)
      .post(api('/auth/refresh'))
      .send({ refreshToken: login.body.data.refreshToken });
    expect(refresh.statusCode).toBe(401);

    const relogin = await request(app)
      .post(api('/auth/admin/login'))
      .send({ email: 'leaver28@example.com', password: 'Password123' });
    expect(relogin.statusCode).toBe(401);

    const on = await request(app)
      .post(api(`/admin/accounts/${staff._id}/reactivate`))
      .set(...caller.cookie);
    expect(on.statusCode).toBe(200);
    const back = await request(app)
      .post(api('/auth/admin/login'))
      .send({ email: 'leaver28@example.com', password: 'Password123' });
    expect(back.statusCode).toBe(200);
  });

  it('refuses self-deactivation and the last Super Admin', async () => {
    const solo = await makeStaffSuperAdmin('solo28@example.com');
    const self = await request(app)
      .post(api(`/admin/accounts/${solo.staff._id}/deactivate`))
      .set(...solo.cookie);
    expect(self.statusCode).toBe(403);

    const root = await makeRootCaller('root28h@example.com');
    const last = await request(app)
      .post(api(`/admin/accounts/${solo.staff._id}/deactivate`))
      .set(...root.cookie);
    expect(last.statusCode).toBe(403);

    const second = await makeStaffSuperAdmin('second28@example.com');
    const first = await request(app)
      .post(api(`/admin/accounts/${solo.staff._id}/deactivate`))
      .set(...second.cookie);
    expect(first.statusCode).toBe(200);
  });

  it('reactivate rejects non-deactivated accounts', async () => {
    const caller = await makeRootCaller('root28i@example.com');
    const { staff } = await seedActiveStaff({ email: 'alreadon28@example.com' });
    const res = await request(app)
      .post(api(`/admin/accounts/${staff._id}/reactivate`))
      .set(...caller.cookie);
    expect(res.statusCode).toBe(409);
  });
});

describe('BE-028: account audit trail', () => {
  it('serves scope=accounts with actor, target, values, and no secrets', async () => {
    const caller = await makeRootCaller('auditroot28@example.com');
    const created = await request(app)
      .post(api('/admin/accounts'))
      .set(...caller.cookie)
      .send({ name: 'Trail', email: 'trail28@example.com', type: 'user' });
    expect(created.statusCode).toBe(201);

    const res = await request(app).get(api('/admin/audit-log?scope=accounts')).set(...caller.cookie);
    expect(res.statusCode).toBe(200);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    const actions = res.body.data.map((row) => row.action);
    expect(actions).toContain('account.invite');
    const blob = JSON.stringify(res.body);
    expect(blob).not.toMatch(/Password123|token/);
    expect(blob).not.toContain('trail28@example.com');
  });

  it('rejects other scopes and non-super-admin readers', async () => {
    const caller = await makeRootCaller('auditroot28b@example.com');
    const wrong = await request(app).get(api('/admin/audit-log?scope=everything')).set(...caller.cookie);
    expect(wrong.statusCode).toBe(400);

    const support = await makeSupportCaller('auditsupport28@example.com');
    const denied = await request(app).get(api('/admin/audit-log?scope=accounts')).set(...support.cookie);
    expect(denied.statusCode).toBe(403);
  });
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});
