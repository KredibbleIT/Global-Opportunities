import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../src/app.js';
import { User, StaffMember, RefreshToken, AuditLog } from '../src/models/User.js';
import { SeekerProfile, HirerAccount } from '../src/models/Profiles.js';
import { signAdminToken } from '../src/middleware/auth.js';

/**
 * SEC-147: Suspend and Reinstate on a seeker's or hirer's admin page used to change the page only. Suspending now
 * saves, signs the person out of every device and stops them signing in; reinstating lets them sign in again.
 */

const api = (path) => `/api/v1${path}`;
const PASSWORD = 'Password123!';

let sequence = 0;

/** An app account with a password, and its profile. */
const createAppAccount = async (role) => {
  sequence += 1;
  const email = `sec147-${role}-${sequence}@example.com`;
  const user = await User.create({
    name: `${role} ${sequence}`,
    email,
    emailNormalized: email,
    role,
    emailVerified: true,
    passwordHash: await bcrypt.hash(PASSWORD, 12),
  });
  const profile = role === 'seeker'
    ? await SeekerProfile.create({ userId: user._id, profession: 'Analyst', country: 'Ghana' })
    : await HirerAccount.create({ userId: user._id, companyName: `Company ${sequence}`, industry: 'Finance', location: 'Accra' });
  return { user, profile, email };
};

/** A staff caller; no roles means the root admin (no staff record). */
const createStaffCaller = async (roles) => {
  sequence += 1;
  const email = `sec147-staff-${sequence}@example.com`;
  const user = await User.create({ name: `Staff ${sequence}`, email, role: 'admin', passwordHash: 'x' });
  if (roles) await StaffMember.create({ userId: user._id, name: user.name, email, roles, status: 'active' });
  return { user, cookie: `kredibble_admin_token=${signAdminToken(user)}` };
};

const login = (email) => request(app).post(api('/auth/login')).send({ email, password: PASSWORD });
const setStatus = (kind, id, cookie, status) => request(app).patch(api(`/admin/${kind}/${id}/status`)).set('Cookie', cookie).send({ status });

describe.each([
  ['seeker', 'seekers'],
  ['hirer', 'hirers'],
])('SEC-147: suspending a %s', (role, kind) => {
  it('saves, signs them out everywhere and blocks sign-in until reinstated', async () => {
    const admin = await createStaffCaller();
    const account = await createAppAccount(role);

    const session = await login(account.email);
    expect(session.status).toBe(200);
    const { token, refreshToken } = session.body.data;
    expect((await request(app).get(api('/auth/me')).set('Authorization', `Bearer ${token}`)).status).toBe(200);

    const suspended = await setStatus(kind, account.profile._id, admin.cookie, 'suspended');
    expect(suspended.status).toBe(200);
    expect(suspended.body.data).toEqual({ id: String(account.profile._id), status: 'suspended' });

    // Saved: a reload of the admin page reads it back.
    const reloaded = await request(app).get(api(`/admin/${kind}/${account.profile._id}`)).set('Cookie', admin.cookie);
    expect(reloaded.status).toBe(200);
    expect(reloaded.body.data.status).toBe('suspended');

    // Signed out: the access token and the refresh token no longer work.
    expect((await request(app).get(api('/auth/me')).set('Authorization', `Bearer ${token}`)).status).toBe(401);
    expect((await request(app).post(api('/auth/refresh')).send({ refreshToken })).status).toBe(401);
    expect(await RefreshToken.countDocuments({ userId: account.user._id })).toBe(0);

    // Blocked: the right password is refused, and says why.
    const blocked = await login(account.email);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.message).toMatch(/suspended/i);
    expect(blocked.body.data).toBeUndefined();

    const reinstated = await setStatus(kind, account.profile._id, admin.cookie, 'active');
    expect(reinstated.status).toBe(200);
    expect(reinstated.body.data.status).toBe('active');
    expect((await login(account.email)).status).toBe(200);
  });

  it('is audited', async () => {
    const admin = await createStaffCaller();
    const account = await createAppAccount(role);

    expect((await setStatus(kind, account.profile._id, admin.cookie, 'suspended')).status).toBe(200);

    const entry = await AuditLog.findOne({ 'metadata.accountStatus': true, 'metadata.profileId': String(account.profile._id) }).lean();
    expect(entry).not.toBeNull();
    expect(entry.metadata).toMatchObject({ previous: 'active', status: 'suspended', signedOut: true });
  });

  it('needs edit on the page: a Partnerships Officer is refused and nothing changes', async () => {
    const officer = await createStaffCaller(['partnerships_officer']);
    const account = await createAppAccount(role);

    expect((await setStatus(kind, account.profile._id, officer.cookie, 'suspended')).status).toBe(403);
    expect((await (role === 'seeker' ? SeekerProfile : HirerAccount).findById(account.profile._id).lean()).status).toBe('active');
    expect((await login(account.email)).status).toBe(200);
  });

  it('a Moderator (the "suspend" permission) may suspend', async () => {
    const moderator = await createStaffCaller(['moderator']);
    const account = await createAppAccount(role);

    expect((await setStatus(kind, account.profile._id, moderator.cookie, 'suspended')).status).toBe(200);
  });

  it('rejects any other status and unknown fields, and 404s an unknown id', async () => {
    const admin = await createStaffCaller();
    const account = await createAppAccount(role);

    expect((await setStatus(kind, account.profile._id, admin.cookie, 'deleted')).status).toBe(400);
    const extra = await request(app)
      .patch(api(`/admin/${kind}/${account.profile._id}/status`))
      .set('Cookie', admin.cookie)
      .send({ status: 'suspended', verified: true });
    expect(extra.status).toBe(400);
    expect((await setStatus(kind, '6a0000000000000000000000', admin.cookie, 'suspended')).status).toBe(404);
    expect((await setStatus(kind, 'not-an-id', admin.cookie, 'suspended')).status).toBe(404);
  });
});

describe('SEC-147: suspension has one door', () => {
  it('the generic hirer update no longer sets status (it would skip the sign-out)', async () => {
    const admin = await createStaffCaller();
    const account = await createAppAccount('hirer');

    await request(app).patch(api(`/admin/hirers/${account.profile._id}`)).set('Cookie', admin.cookie).send({ status: 'suspended' });

    expect((await HirerAccount.findById(account.profile._id).lean()).status).toBe('active');
    expect((await login(account.email)).status).toBe(200);
  });
});
