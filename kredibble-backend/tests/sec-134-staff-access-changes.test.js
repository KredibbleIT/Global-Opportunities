import { jest } from '@jest/globals';
import request from 'supertest';
import { app } from '../src/app.js';
import { User, StaffMember } from '../src/models/User.js';
import { signAdminToken } from '../src/middleware/auth.js';

/**
 * SEC-134: who holds which staff role is a Super Admin decision. Team edit
 * alone used to be enough to add staff, change anyone's roles or status, or
 * delete a staff record, and a deleted record made its user the root admin.
 */

const api = (path) => `/api/v1${path}`;
const TOGGLES = {
  Moderator: { verifications: true, moderate: true, suspend: true, content: true, broadcast: true, staff: true },
  Support: { verifications: true, moderate: true, suspend: true, content: true, broadcast: true, staff: true },
};

let sequence = 0;
/** A staff User as BE-028 creates one (role admin); no `roles` means the root admin (no staff record). */
const createAdminUser = async ({ roles, status = 'active', role = 'admin' } = {}) => {
  sequence += 1;
  const email = `sec134-${sequence}@example.com`;
  const user = await User.create({ name: `Staff ${sequence}`, email, role, passwordHash: 'x' });
  const staff = roles
    ? await StaffMember.create({ userId: user._id, name: user.name, email, roles, status })
    : null;
  return { user, staff, cookie: `kredibble_admin_token=${signAdminToken(user)}` };
};

const send = (method, path, cookie, body) => request(app)[method](api(path)).set('Cookie', cookie).send(body);

describe('SEC-134: Team edit alone no longer changes who holds which role', () => {
  it.each(['admin_support', 'desk_lead'])('%s cannot change roles or status, only names', async (role) => {
    const caller = await createAdminUser({ roles: [role] });
    const other = await createAdminUser({ roles: ['support'] });
    const suspended = await createAdminUser({ roles: ['desk_lead'], status: 'suspended' });

    const ownRoles = await send('patch', `/admin/staff/${caller.staff._id}`, caller.cookie, { roles: ['super_admin'] });
    expect(ownRoles.status).toBe(403);
    expect((await StaffMember.findById(caller.staff._id).lean()).roles).toEqual([role]);
    expect((await send('put', '/admin/roles-permissions', caller.cookie, { toggles: TOGGLES })).status).toBe(403);

    expect((await send('patch', `/admin/staff/${other.staff._id}`, caller.cookie, { roles: ['desk_lead'] })).status).toBe(403);
    expect((await send('patch', `/admin/staff/${other.staff._id}`, caller.cookie, { role: 'Desk Lead' })).status).toBe(403);
    expect((await send('patch', `/admin/staff/${other.staff._id}`, caller.cookie, { status: 'suspended' })).status).toBe(403);
    expect((await send('put', `/admin/staff/${suspended.staff._id}`, caller.cookie, { status: 'active' })).status).toBe(403);
    expect((await StaffMember.findById(suspended.staff._id).lean()).status).toBe('suspended');

    const renamed = await send('patch', `/admin/staff/${other.staff._id}`, caller.cookie, { name: 'Renamed Person' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.name).toBe('Renamed Person');
  });

  it('Admin Support cannot remove a staff record, their own included (the 2026-10-17 probe)', async () => {
    const caller = await createAdminUser({ roles: ['admin_support'] });
    const other = await createAdminUser({ roles: ['support'] });

    expect((await send('delete', `/admin/staff/${caller.staff._id}`, caller.cookie)).status).toBe(403);
    expect((await send('delete', `/admin/staff/${other.staff._id}`, caller.cookie)).status).toBe(403);
    expect(await StaffMember.countDocuments({ _id: { $in: [caller.staff._id, other.staff._id] }, status: 'active' })).toBe(2);
    expect((await send('put', '/admin/roles-permissions', caller.cookie, { toggles: TOGGLES })).status).toBe(403);
  });

  it('Admin Support cannot add staff, so cannot invite an account they control as Super Admin', async () => {
    const caller = await createAdminUser({ roles: ['admin_support'] });
    const appAccount = await User.create({ name: 'Second Account', email: 'second@example.com', role: 'seeker', passwordHash: 'x' });

    const existing = await send('post', '/admin/staff/invite', caller.cookie, { email: appAccount.email, name: appAccount.name, roles: ['super_admin'] });
    expect(existing.status).toBe(403);
    const fresh = await send('post', '/admin/staff/invite', caller.cookie, { email: 'new-person@example.com', name: 'New Person', roles: ['support'] });
    expect(fresh.status).toBe(403);

    expect(await StaffMember.exists({ userId: appAccount._id })).toBeNull();
    expect(await User.exists({ emailNormalized: 'new-person@example.com' })).toBeNull();
  });
});

describe('SEC-134: a Super Admin still manages staff, within limits', () => {
  it('changes roles and suspends (signing the person out), but never on their own record', async () => {
    const superAdmin = await createAdminUser({ roles: ['super_admin'] });
    const other = await createAdminUser({ roles: ['support'] });

    const promoted = await send('patch', `/admin/staff/${other.staff._id}`, superAdmin.cookie, { roles: ['partnerships_officer'] });
    expect(promoted.status).toBe(200);
    expect(promoted.body.data.roles).toEqual(['partnerships_officer']);

    const before = (await User.findById(other.user._id).lean()).tokenVersion || 0;
    expect((await send('put', `/admin/staff/${other.staff._id}`, superAdmin.cookie, { status: 'suspended' })).status).toBe(200);
    expect((await User.findById(other.user._id).lean()).tokenVersion).toBe(before + 1);

    expect((await send('patch', `/admin/staff/${superAdmin.staff._id}`, superAdmin.cookie, { roles: ['desk_lead'] })).status).toBe(403);
    expect((await send('delete', `/admin/staff/${superAdmin.staff._id}`, superAdmin.cookie)).status).toBe(403);
  });

  it('cannot demote, suspend or remove the last active Super Admin', async () => {
    const rootAdmin = await createAdminUser();
    const onlySuperAdmin = await createAdminUser({ roles: ['super_admin'] });

    expect((await send('patch', `/admin/staff/${onlySuperAdmin.staff._id}`, rootAdmin.cookie, { roles: ['desk_lead'] })).status).toBe(403);
    expect((await send('patch', `/admin/staff/${onlySuperAdmin.staff._id}`, rootAdmin.cookie, { status: 'suspended' })).status).toBe(403);
    expect((await send('delete', `/admin/staff/${onlySuperAdmin.staff._id}`, rootAdmin.cookie)).status).toBe(403);

    await createAdminUser({ roles: ['super_admin'] });
    expect((await send('patch', `/admin/staff/${onlySuperAdmin.staff._id}`, rootAdmin.cookie, { roles: ['desk_lead'] })).status).toBe(200);
  });

  it('rejects an unknown legacy role string instead of saving an empty role list', async () => {
    const rootAdmin = await createAdminUser();
    const other = await createAdminUser({ roles: ['support'] });
    const res = await send('patch', `/admin/staff/${other.staff._id}`, rootAdmin.cookie, { role: 'Chief Wizard' });
    expect(res.status).toBe(400);
  });
});

describe('SEC-134: removing a staff member never makes them the root admin', () => {
  it('deactivates the record; the removed person then has no admin access at all', async () => {
    const rootAdmin = await createAdminUser();
    const removed = await createAdminUser({ roles: ['admin_support'] });

    const res = await send('delete', `/admin/staff/${removed.staff._id}`, rootAdmin.cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.removed).toBe(true);
    expect((await StaffMember.findById(removed.staff._id).lean()).status).toBe('deactivated');

    // Their old admin session was revoked, so the staff routes refuse it outright (401, since
    // requireAdminOrStaffAuth checks the token version too) and /me signs them out.
    expect((await send('put', '/admin/roles-permissions', removed.cookie, { toggles: TOGGLES })).status).toBe(401);
    expect((await request(app).get(api('/admin/partners')).set('Cookie', removed.cookie)).status).toBe(401);
    expect((await request(app).get(api('/auth/admin/me')).set('Cookie', removed.cookie)).status).toBe(401);
  });

  it('BE-028 account creation removes the new admin user when its staff record fails to save', async () => {
    const rootAdmin = await createAdminUser();
    const create = jest.spyOn(StaffMember, 'create').mockRejectedValueOnce(new Error('simulated insert failure'));
    try {
      const res = await send('post', '/admin/accounts', rootAdmin.cookie, { type: 'admin', name: 'Half Made', email: 'half-made@example.com' });
      expect(res.status).toBeGreaterThanOrEqual(500);
    } finally {
      create.mockRestore();
    }
    expect(await User.exists({ emailNormalized: 'half-made@example.com' })).toBeNull();
  });
});
