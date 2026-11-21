import request from 'supertest';
import { app } from '../src/app.js';
import { User, AuditLog } from '../src/models/User.js';
import { SeekerProfile, ExpertRating } from '../src/models/Profiles.js';
import { Notification } from '../src/models/Content.js';
import { Applicant, Opportunity } from '../src/models/Platform.js';
import { signToken, signAdminToken } from '../src/middleware/auth.js';

// A seeker applies to be shown on the Expert listing, an admin approves, and other people find and rate them. ALL DATA IS FAKE.

const api = (route) => `/api/v1${route}`;

describe('Expert listing', () => {
  let admin;
  let ama;
  let kofi;
  let hirer;
  let bare;
  let amaProfile;
  const bearer = (person) => ['Authorization', `Bearer ${signToken(person)}`];
  const adminCookie = () => ['Cookie', `kredibble_admin_token=${signAdminToken(admin)}`];

  beforeEach(async () => {
    const stamp = Date.now();
    admin = await User.create({ name: 'Test Admin', email: `ex-admin-${stamp}@example.com`, role: 'admin', passwordHash: 'x' });
    ama = await User.create({ name: 'Test Ama', email: `ex-ama-${stamp}@example.com`, role: 'seeker', passwordHash: 'x' });
    kofi = await User.create({ name: 'Test Kofi', email: `ex-kofi-${stamp}@example.com`, role: 'seeker', passwordHash: 'x' });
    bare = await User.create({ name: 'Test Bare', email: `ex-bare-${stamp}@example.com`, role: 'seeker', passwordHash: 'x' });
    hirer = await User.create({ name: 'Test Hirer', email: `ex-hirer-${stamp}@example.com`, role: 'hirer', passwordHash: 'x' });
    amaProfile = await SeekerProfile.create({
      userId: ama._id, profession: 'Backend Developer', country: 'Ghana', city: 'Accra', phone: '+233500000000', experienceLevel: 'Senior',
      professionalSummary: 'Builds reliable test services.', technicalSkills: JSON.stringify(['Node.js', 'MongoDB']),
    });
    await SeekerProfile.create({ userId: kofi._id, profession: 'Designer', country: 'Benin', bio: 'Designs things.', technicalSkills: JSON.stringify(['Figma']) });
    await SeekerProfile.create({ userId: bare._id, profession: 'Student' });
  });

  const apply = (person, body = {}) => request(app).post(api('/experts/me/apply')).set(...bearer(person)).send(body);
  const approve = (id) => request(app).post(api(`/admin/experts/${id}/approve`)).set(...adminCookie()).send({});
  const listed = async (person, query = '') => (await request(app).get(api(`/experts${query}`)).set(...bearer(person)).expect(200)).body.data;

  it('is empty until someone is approved: nobody is listed just for being a seeker', async () => {
    expect(await listed(hirer)).toEqual([]);
    expect(await listed(kofi)).toEqual([]);
  });

  it('lets a seeker apply, shows them as pending, and keeps them off the list', async () => {
    const res = await apply(ama, { showEmail: true }).expect(201);
    expect(res.body.data).toMatchObject({ status: 'pending', eligible: true, showEmail: true, showPhone: false });
    const me = await request(app).get(api('/experts/me')).set(...bearer(ama)).expect(200);
    expect(me.body.data.status).toBe('pending');
    expect(await listed(hirer)).toEqual([]);
    await request(app).get(api(`/experts/${amaProfile._id}`)).set(...bearer(hirer)).expect(404);
    await apply(ama).expect(409);
  });

  it('asks a seeker with a thin profile to fill it in first', async () => {
    const res = await apply(bare).expect(400);
    expect(res.body.error.message).toMatch(/summary and skills|summary, and skills|summary/);
    expect((await SeekerProfile.findOne({ userId: bare._id })).expertStatus).toBe('none');
  });

  it('only a seeker can apply, and a person cannot approve themselves', async () => {
    await apply(hirer).expect(403);
    await apply(ama).expect(201);
    await request(app).post(api(`/admin/experts/${amaProfile._id}/approve`)).set(...bearer(ama)).send({}).expect(401);
    await request(app).patch(api(`/seekers/${amaProfile._id}`)).set(...bearer(ama)).send({ expertStatus: 'approved' });
    expect((await SeekerProfile.findById(amaProfile._id)).expertStatus).toBe('pending');
  });

  it('an admin sees the application, approves it, and the seeker is told', async () => {
    await apply(ama, { showEmail: true, showPhone: false }).expect(201);
    const queue = await request(app).get(api('/admin/experts?status=pending')).set(...adminCookie()).expect(200);
    expect(queue.body.data.map((row) => row.id)).toEqual([String(amaProfile._id)]);
    const detail = await request(app).get(api(`/admin/experts/${amaProfile._id}`)).set(...adminCookie()).expect(200);
    expect(detail.body.data.preview.contact).toEqual({ email: ama.email });

    const res = await approve(amaProfile._id).expect(200);
    expect(res.body.data.status).toBe('approved');
    expect(await Notification.countDocuments({ userId: ama._id, title: 'You are now on the Expert listing' })).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'admin.expert.decision', resourceId: amaProfile._id })).toBe(1);
    await approve(amaProfile._id).expect(409);
  });

  it('a decision needs an admin, and turning one down needs a reason that reaches the seeker', async () => {
    await apply(ama).expect(201);
    await request(app).post(api(`/admin/experts/${amaProfile._id}/approve`)).set(...bearer(hirer)).send({}).expect(401);
    await request(app).post(api(`/admin/experts/${amaProfile._id}/reject`)).set(...adminCookie()).send({}).expect(400);
    await request(app).post(api(`/admin/experts/${amaProfile._id}/reject`)).set(...adminCookie()).send({ note: 'Please add a profile photo.' }).expect(200);
    const me = await request(app).get(api('/experts/me')).set(...bearer(ama)).expect(200);
    expect(me.body.data).toMatchObject({ status: 'rejected', reviewNote: 'Please add a profile photo.' });
    expect(await listed(hirer)).toEqual([]);
    await apply(ama).expect(201); // may apply again after updating
  });

  describe('once approved', () => {
    beforeEach(async () => {
      await apply(ama, { showEmail: true, showPhone: false }).expect(201);
      await approve(amaProfile._id).expect(200);
    });

    it('shows on the list and the profile for seekers and hirers, with only the contact details they chose', async () => {
      for (const person of [hirer, kofi]) {
        const list = await listed(person);
        expect(list).toHaveLength(1);
        expect(list[0]).toMatchObject({ id: String(amaProfile._id), name: 'Test Ama', profession: 'Backend Developer', country: 'Ghana' });
        expect(list[0].contact).toEqual({ email: ama.email });
        expect(JSON.stringify(list[0])).not.toContain('+233500000000');
      }
      const profile = await request(app).get(api(`/experts/${amaProfile._id}`)).set(...bearer(hirer)).expect(200);
      expect(profile.body.data).toMatchObject({ professionalSummary: 'Builds reliable test services.', technicalSkills: ['Node.js', 'MongoDB'], myRating: null, isMe: false });
      expect(profile.body.data).not.toHaveProperty('resumeUrl');
    });

    it('the seeker can change what shows, but cannot show a phone number they have not added', async () => {
      const on = await request(app).patch(api('/experts/me')).set(...bearer(ama)).send({ showPhone: true }).expect(200);
      expect(on.body.data.showPhone).toBe(true);
      expect((await listed(hirer))[0].contact).toEqual({ email: ama.email, phone: '+233500000000' });
      await request(app).patch(api('/experts/me')).set(...bearer(ama)).send({ showEmail: false, showPhone: false }).expect(200);
      expect((await listed(hirer))[0].contact).toEqual({});
      await SeekerProfile.updateOne({ _id: amaProfile._id }, { $unset: { phone: '' } });
      await request(app).patch(api('/experts/me')).set(...bearer(ama)).send({ showPhone: true }).expect(400);
      const site = await request(app).patch(api('/experts/me')).set(...bearer(ama)).send({ website: 'ama.dev', showWebsite: true }).expect(200);
      expect(site.body.data.showWebsite).toBe(true);
      expect((await listed(hirer))[0].contact).toEqual({ website: 'https://ama.dev' });
    });

    it('searches and filters', async () => {
      expect(await listed(hirer, '?q=backend')).toHaveLength(1);
      expect(await listed(hirer, '?q=Ama')).toHaveLength(1);
      expect(await listed(hirer, '?q=nobody')).toHaveLength(0);
      expect(await listed(hirer, '?country=Ghana')).toHaveLength(1);
      expect(await listed(hirer, '?country=Benin')).toHaveLength(0);
      expect(await listed(hirer, '?experience=Senior')).toHaveLength(1);
      expect(await listed(hirer, '?profession=Designer')).toHaveLength(0);
      expect(await listed(hirer, '?rating=5')).toHaveLength(0);
    });

    it('offers the professions and countries of the listed experts as filter choices (not of everyone)', async () => {
      const facets = await request(app).get(api('/experts/facets')).set(...bearer(hirer)).expect(200);
      expect(facets.body.data).toEqual({ professions: ['Backend Developer'], countries: ['Ghana'] }); // Kofi (Designer, Benin) never applied
    });

    it('averages ratings: one per person, rating again replaces it, not yourself', async () => {
      const rate = (person, stars) => request(app).post(api(`/experts/${amaProfile._id}/rating`)).set(...bearer(person)).send({ stars });
      expect((await rate(hirer, 5).expect(200)).body.data).toMatchObject({ rating: 5, ratingCount: 1, myRating: 5 });
      expect((await rate(kofi, 3).expect(200)).body.data).toMatchObject({ rating: 4, ratingCount: 2 });
      expect((await rate(kofi, 1).expect(200)).body.data).toMatchObject({ rating: 3, ratingCount: 2 });
      expect(await ExpertRating.countDocuments({ expertId: amaProfile._id })).toBe(2);
      await rate(ama, 5).expect(403);
      await rate(hirer, 6).expect(400);
      await rate(hirer, 0).expect(400);
      const profile = await request(app).get(api(`/experts/${amaProfile._id}`)).set(...bearer(hirer)).expect(200);
      expect(profile.body.data).toMatchObject({ rating: 3, ratingCount: 2, myRating: 5 });
      expect(await listed(hirer, '?rating=3')).toHaveLength(1);
    });

    it('an admin can hide an expert, which takes them off and tells them, and bring them back', async () => {
      await request(app).post(api(`/admin/experts/${amaProfile._id}/hide`)).set(...adminCookie()).send({}).expect(400);
      await request(app).post(api(`/admin/experts/${amaProfile._id}/hide`)).set(...adminCookie()).send({ note: 'Reported by a user.' }).expect(200);
      expect(await listed(hirer)).toEqual([]);
      await request(app).get(api(`/experts/${amaProfile._id}`)).set(...bearer(hirer)).expect(404);
      await apply(ama).expect(403);
      await request(app).post(api(`/admin/experts/${amaProfile._id}/unhide`)).set(...adminCookie()).send({}).expect(200);
      expect(await listed(hirer)).toHaveLength(1);
    });

    it('the seeker can leave the listing', async () => {
      await request(app).post(api('/experts/me/withdraw')).set(...bearer(ama)).expect(200);
      expect(await listed(hirer)).toEqual([]);
      await request(app).post(api('/experts/me/withdraw')).set(...bearer(ama)).expect(409);
    });
  });

  it('other people no longer see every seeker: the seeker search and list only return approved experts', async () => {
    const before = await request(app).get(api('/seekers/search')).set(...bearer(hirer)).expect(200);
    expect(before.body.data).toEqual([]);
    const list = await request(app).get(api('/seekers')).set(...bearer(hirer)).expect(200);
    expect(list.body.data).toEqual([]);
    // a seeker still reads their own profile
    const own = await request(app).get(api('/seekers')).set(...bearer(ama)).expect(200);
    expect(own.body.data.map((row) => row.userId?.id || row.userId)).toEqual([String(ama._id)]);
    await apply(ama).expect(201);
    await approve(amaProfile._id).expect(200);
    const after = await request(app).get(api('/seekers/search')).set(...bearer(hirer)).expect(200);
    expect(after.body.data).toHaveLength(1);
  });

  it('a hirer opens the profile of someone who applied to their listing, whether or not that person is listed; nobody else can', async () => {
    const otherHirer = await User.create({ name: 'Test Other Hirer', email: `ex-hirer2-${Date.now()}@example.com`, role: 'hirer', passwordHash: 'x' });
    const listing = await Opportunity.create({ title: 'Test Role', type: 'jobs', organisation: 'Test Org', description: 'A test role.', location: 'Accra', createdBy: hirer._id, hirerId: hirer._id });
    const applicant = await Applicant.create({ opportunityId: listing._id, seekerId: kofi._id, name: 'Test Kofi' });

    const res = await request(app).get(api(`/experts/applicant/${applicant._id}`)).set(...bearer(hirer)).expect(200);
    expect(res.body.data).toMatchObject({ name: 'Test Kofi', profession: 'Designer', technicalSkills: ['Figma'], listed: false, isMe: false });
    expect(res.body.data.contact).toEqual({}); // Kofi shares nothing
    await request(app).get(api(`/experts/applicant/${applicant._id}`)).set(...bearer(otherHirer)).expect(403);
    await request(app).get(api(`/experts/applicant/${applicant._id}`)).set(...bearer(kofi)).expect(403);
    await request(app).get(api('/experts/applicant/64b7f1c2a1b2c3d4e5f60718')).set(...bearer(hirer)).expect(404);
    // the same person is still not on the public listing, and cannot be rated from the listing
    await request(app).get(api(`/experts/${(await SeekerProfile.findOne({ userId: kofi._id }))._id}`)).set(...bearer(hirer)).expect(404);
  });
});
