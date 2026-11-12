import request from 'supertest';
import { app } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Grant, GrantApplication } from '../src/models/Platform.js';
import { signAdminToken, signToken } from '../src/middleware/auth.js';

const api = (path) => `/api/v1${path}`;
const createAdmin = () => User.create({ name: 'Ada Admin', email: 'ada@example.com', role: 'admin', passwordHash: 'x' });
const adminCookie = (admin) => `kredibble_admin_token=${signAdminToken(admin)}`;

/** A grant whose pending application has already reserved its amount, as applying through the app does (SEC-060). */
const reservedGrant = async ({ fundingPool = 1000, requestedAmount = 200 } = {}) => {
  const grant = await Grant.create({ title: 'Seed fund', hirer: 'Acme', sector: 'Agri', fundingPool, allocated: requestedAmount });
  const application = await GrantApplication.create({ grantId: grant._id, applicantName: 'Ama Mensah', requestedAmount });
  return { grant, application };
};

const decide = (cookie, id, status) => request(app).patch(api(`/admin/grant-applications/${id}`)).set('Cookie', cookie).send({ status });

describe('SEC-157: deciding a grant application', () => {
  it('approving keeps the reservation in the pool', async () => {
    const cookie = adminCookie(await createAdmin());
    const { grant, application } = await reservedGrant();

    const res = await decide(cookie, application._id, 'approved');

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
    expect((await Grant.findById(grant._id).lean()).allocated).toBe(200);
  });

  it('rejecting releases the reserved amount', async () => {
    const cookie = adminCookie(await createAdmin());
    const { grant, application } = await reservedGrant({ requestedAmount: 300 });

    const res = await decide(cookie, application._id, 'rejected');

    expect(res.status).toBe(200);
    expect((await GrantApplication.findById(application._id).lean()).status).toBe('rejected');
    expect((await Grant.findById(grant._id).lean()).allocated).toBe(0);
  });

  it('a decided application cannot be decided again, so an amount is never released twice', async () => {
    const cookie = adminCookie(await createAdmin());
    const { grant, application } = await reservedGrant({ requestedAmount: 300 });
    await Grant.updateOne({ _id: grant._id }, { allocated: 500 }); // another pending request holds 200

    const first = await decide(cookie, application._id, 'rejected');
    const again = await decide(cookie, application._id, 'rejected');
    const flip = await decide(cookie, application._id, 'approved');

    expect(first.status).toBe(200);
    expect(again.status).toBe(409);
    expect(flip.status).toBe(409);
    expect((await Grant.findById(grant._id).lean()).allocated).toBe(200);
  });

  it('never takes the pool below zero for an application stored without a reservation', async () => {
    const cookie = adminCookie(await createAdmin());
    const grant = await Grant.create({ title: 'Old fund', hirer: 'Acme', sector: 'Agri', fundingPool: 1000, allocated: 0 });
    const application = await GrantApplication.create({ grantId: grant._id, applicantName: 'Kofi Owusu', requestedAmount: 400 });

    expect((await decide(cookie, application._id, 'rejected')).status).toBe(200);
    expect((await Grant.findById(grant._id).lean()).allocated).toBe(0);
  });

  it('accepts only approved or rejected, and 404s for an unknown or invalid id', async () => {
    const cookie = adminCookie(await createAdmin());
    const { application } = await reservedGrant();

    expect((await decide(cookie, application._id, 'pending')).status).toBe(400);
    expect((await decide(cookie, application._id, 'paid')).status).toBe(400);
    expect((await decide(cookie, '64b7f1c2a1b2c3d4e5f60718', 'approved')).status).toBe(404);
    expect((await decide(cookie, 'not-an-id', 'approved')).status).toBe(404);
    expect((await GrantApplication.findById(application._id).lean()).status).toBe('pending');
  });

  it('needs the admin session: a user Bearer token and no credentials are refused', async () => {
    const admin = await createAdmin();
    const { application } = await reservedGrant();

    const asUser = await request(app).patch(api(`/admin/grant-applications/${application._id}`)).set('Authorization', `Bearer ${signToken(admin)}`).send({ status: 'approved' });
    const anonymous = await request(app).patch(api(`/admin/grant-applications/${application._id}`)).send({ status: 'approved' });

    expect(asUser.status).toBe(401);
    expect(anonymous.status).toBe(401);
    expect((await GrantApplication.findById(application._id).lean()).status).toBe('pending');
  });
});
