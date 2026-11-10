/**
 * GOD-T3: registered app users appear in the admin Database (one list with records added by staff), labelled by origin.
 *
 * Covers: a seeker's registration creates one 'app' record; a staff record with the same email is linked, never copied;
 * hirers are not added; migration 003 backfills earlier seekers once (re-runnable, skips deleted accounts); the list filters
 * by origin and combines filters; account deletion removes the record and the data export includes it.
 */
import request from 'supertest';
import { app } from '../src/app.js';
import { User } from '../src/models/User.js';
import { SeekerProfile, HirerAccount } from '../src/models/Profiles.js';
import { Beneficiary } from '../src/models/AdminPortal.js';
import { signAdminToken } from '../src/middleware/auth.js';
import { deleteAccount } from '../src/lib/account-deletion.js';
import { ensureAppBeneficiary } from '../src/lib/app-beneficiaries.js';
import { up as backfillAppBeneficiaries } from '../migrations/003_backfill_app_beneficiaries.js';

const api = (path) => `/api/v1${path}`;
const PASSWORD = 'Password123';

const register = (body) => request(app).post(api('/auth/register')).send({ password: PASSWORD, role: 'seeker', ...body });

describe('GOD-T3: app registrations in the admin Database', () => {
  let adminCookie;

  beforeEach(async () => {
    await Promise.all([Beneficiary.deleteMany({}), User.deleteMany({}), SeekerProfile.deleteMany({}), HirerAccount.deleteMany({})]);
    const admin = await User.create({ name: 'Desk Admin', email: 'desk.admin@example.com', role: 'admin', passwordHash: 'x' });
    adminCookie = `kredibble_admin_token=${signAdminToken(admin)}`;
  });

  const list = (query = '') => request(app).get(api(`/admin/beneficiaries${query}`)).set('Cookie', adminCookie);

  it('a seeker registration creates ONE "app" record, linked to the account; a hirer registration creates none', async () => {
    const res = await register({ name: 'Ama Serwaa', email: 'Ama.Serwaa@Example.com', country: 'Ghana', university: 'Ashesi University', phone: '+233245551111' });
    expect(res.status).toBe(201);
    const user = await User.findOne({ emailNormalized: 'ama.serwaa@example.com' }).lean();

    const records = await Beneficiary.find({}).lean();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ origin: 'app', fullName: 'Ama Serwaa', email: 'ama.serwaa@example.com', country: 'Ghana', institution: 'Ashesi University', source: 'organic', verified: false });
    expect(String(records[0].userId)).toBe(String(user._id));

    expect((await register({ name: 'Acme HR', email: 'hr@acme.example', role: 'hirer' })).status).toBe(201);
    expect(await Beneficiary.countDocuments({})).toBe(1);
  });

  it('a staff record with the same email is linked, not copied: it keeps its origin, source and verification', async () => {
    const created = await request(app).post(api('/admin/beneficiaries')).set('Cookie', adminCookie)
      .send({ name: 'Kojo Mensah', email: 'kojo@example.com', source: 'event', country: 'Ghana' });
    expect(created.status).toBe(201);
    expect(created.body.data.origin).toBe('manual');
    await Beneficiary.updateOne({ _id: created.body.data.id }, { $set: { verified: true, verifiedAt: '2026-11-02' } });

    expect((await register({ name: 'Kojo Mensah', email: 'KOJO@example.com' })).status).toBe(201);

    const records = await Beneficiary.find({}).lean();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ origin: 'manual', source: 'event', verified: true, verifiedAt: '2026-11-02' });
    const user = await User.findOne({ emailNormalized: 'kojo@example.com' }).lean();
    expect(String(records[0].userId)).toBe(String(user._id));
  });

  it('the list shows each record once under All and filters by origin; "manual" includes records from before the field existed', async () => {
    await register({ name: 'Ama Serwaa', email: 'ama@example.com' });
    await request(app).post(api('/admin/beneficiaries')).set('Cookie', adminCookie).send({ name: 'Kojo Mensah', email: 'kojo@example.com', source: 'event' });
    // a record written before GOD-T3: no origin field at all
    await Beneficiary.collection.insertOne({ fullName: 'Old Record', email: 'old@example.com', source: 'organic', verified: false, createdAtDate: '2026-10-01' });

    const all = await list();
    expect(all.status).toBe(200);
    expect(all.body.data.map((record) => record.email).sort()).toEqual(['ama@example.com', 'kojo@example.com', 'old@example.com']);
    expect(Object.fromEntries(all.body.data.map((record) => [record.email, record.origin]))).toEqual({ 'ama@example.com': 'app', 'kojo@example.com': 'manual', 'old@example.com': 'manual' });

    expect((await list('?origin=app')).body.data.map((record) => record.email)).toEqual(['ama@example.com']);
    expect((await list('?origin=manual')).body.data.map((record) => record.email).sort()).toEqual(['kojo@example.com', 'old@example.com']);
  });

  it('filters combine: a search keeps the source and origin filters (they used to overwrite each other)', async () => {
    await request(app).post(api('/admin/beneficiaries')).set('Cookie', adminCookie).send({ name: 'Kojo Event', email: 'kojo.event@example.com', source: 'event' });
    await request(app).post(api('/admin/beneficiaries')).set('Cookie', adminCookie).send({ name: 'Kojo Organic', email: 'kojo.organic@example.com', source: 'organic' });
    await register({ name: 'Kojo App', email: 'kojo.app@example.com' });

    expect((await list('?source=event&q=Kojo')).body.data.map((record) => record.name)).toEqual(['Kojo Event']);
    expect((await list('?origin=app&q=Kojo')).body.data.map((record) => record.name)).toEqual(['Kojo App']);
    expect((await list('?source=organic&origin=manual&q=Kojo')).body.data.map((record) => record.name)).toEqual(['Kojo Organic']);
  });

  it('migration 003 backfills earlier seekers once, links staff records by email, and skips deleted accounts and hirers', async () => {
    const early = await User.create({ name: 'Early Seeker', email: 'early@example.com', role: 'seeker', passwordHash: 'x' });
    await SeekerProfile.create({ userId: early._id, profession: 'Student', country: 'Kenya', university: 'Strathmore', phone: '+254700000001' });
    const staffKnown = await User.create({ name: 'Known Person', email: 'known@example.com', role: 'seeker', passwordHash: 'x' });
    await Beneficiary.create({ fullName: 'Known Person', email: 'known@example.com', source: 'partner' });
    await User.create({ name: 'Deleted User', email: 'deleted_x@kredibble.local', role: 'deleted', passwordHash: 'x' });
    await User.create({ name: 'A Hirer', email: 'hirer@example.com', role: 'hirer', passwordHash: 'x' });

    expect(await backfillAppBeneficiaries()).toEqual({ success: true, seekers: 2, created: 1, linked: 1, existing: 0 });
    const records = await Beneficiary.find({}).sort({ email: 1 }).lean();
    expect(records.map((record) => [record.email, record.origin, String(record.userId)])).toEqual([
      ['early@example.com', 'app', String(early._id)],
      ['known@example.com', 'manual', String(staffKnown._id)],
    ]);
    expect(records[0]).toMatchObject({ country: 'Kenya', institution: 'Strathmore', phone: '+254700000001' });

    expect(await backfillAppBeneficiaries()).toEqual({ success: true, seekers: 2, created: 0, linked: 0, existing: 2 });
    expect(await Beneficiary.countDocuments({})).toBe(2);
  });

  it('ensureAppBeneficiary is idempotent for the same user', async () => {
    const user = await User.create({ name: 'Twice', email: 'twice@example.com', role: 'seeker', passwordHash: 'x' });
    expect((await ensureAppBeneficiary(user, null)).action).toBe('created');
    expect((await ensureAppBeneficiary(user, null)).action).toBe('existing');
    expect(await Beneficiary.countDocuments({ userId: user._id })).toBe(1);
  });

  it('the data export includes the Database record, and account deletion removes it', async () => {
    await register({ name: 'Efua Owusu', email: 'efua@example.com' });
    const login = await request(app).post(api('/auth/login')).send({ email: 'efua@example.com', password: PASSWORD });
    expect(login.status).toBe(200);

    const exported = await request(app).get(api('/auth/me/export')).set('Authorization', `Bearer ${login.body.data.token}`);
    expect(exported.status).toBe(200);
    expect(exported.body.databaseRecords).toHaveLength(1);
    expect(exported.body.databaseRecords[0]).toMatchObject({ email: 'efua@example.com', origin: 'app' });
    expect(exported.body.databaseRecords[0].wordpressSync).toBeUndefined();

    const user = await User.findOne({ email: 'efua@example.com' });
    await deleteAccount(user, { deleteMedia: async () => undefined });
    expect(await Beneficiary.countDocuments({ email: 'efua@example.com' })).toBe(0);
  });
});
