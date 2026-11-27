import request from 'supertest';
import { app } from '../src/app.js';
import { signToken } from '../src/middleware/auth.js';
import { User } from '../src/models/User.js';
import { Applicant, Opportunity } from '../src/models/Platform.js';
import { Ambassador, Beneficiary, OpportunityEngagement } from '../src/models/AdminPortal.js';
import { calculateLeaderboard } from '../src/routes/admin-api.js';

// GOD-T105 (task sheet, 18 Nov 2026): "Verify ambassador referral codes end to end and document how staff manage them and how app
// referrals are attributed." This walks the whole path: a code is made when an ambassador is added; a view sent with it counts as a
// referred click; an application in the app sent with it (on a listing that asks for codes) is credited; a verified beneficiary linked
// to the ambassador counts as a sign-up; and the ambassador's own results add it all up. The guide is
// kredibble-backend/docs/AMBASSADOR_REFERRALS.md. ALL DATA IS FAKE.
const today = new Date().toISOString().slice(0, 10);
const bearer = (user) => ['Authorization', `Bearer ${signToken(user)}`];
const makeUser = (name, extra = {}) => User.create({
  name, email: `${name.toLowerCase().replace(/\s+/g, '.')}-${Date.now()}-${Math.random()}@example.com`,
  role: 'seeker', passwordHash: 'x', tokenVersion: 1, emailVerified: true, ...extra,
});
const listing = (fields) => Opportunity.create({
  title: 'Referral Test Fellowship', type: 'fellowship', company: 'Example Org', location: 'Accra', description: 'About it',
  status: 'published', moderationStatus: 'published', vetted: true, ...fields,
});

describe('GOD-T105: ambassador referral codes end to end', () => {
  let ambassadorUser;
  let ambassador;

  beforeEach(async () => {
    await Promise.all([Ambassador.deleteMany({}), Beneficiary.deleteMany({}), OpportunityEngagement.deleteMany({}), Applicant.deleteMany({}), Opportunity.deleteMany({})]);
    ambassadorUser = await makeUser('Ama Referrer');
    ambassador = await Ambassador.create({ fullName: 'Ama Referrer', email: ambassadorUser.email, linkedUserId: ambassadorUser._id, status: 'active' });
  });

  it('adding an ambassador gives them a unique code in the GOD-XXXXXX form', async () => {
    const other = await Ambassador.create({ fullName: 'Kofi Other', email: `kofi-${Date.now()}@example.com`, status: 'active' });
    expect(ambassador.referralCode).toMatch(/^GOD-[A-Z0-9]{6}$/);
    expect(other.referralCode).not.toBe(ambassador.referralCode);
  });

  it('a view sent with the code is a referred click; a wrong code is refused', async () => {
    const opportunity = await listing({ referralCodeOnApply: true });

    const view = await request(app).post(`/api/v1/opportunities/${opportunity._id}/views`)
      .send({ referralCode: ambassador.referralCode.toLowerCase(), source: 'website', visitorId: 'visitor-1' });
    expect(view.statusCode).toBe(202);
    const engagement = await OpportunityEngagement.findOne({ event: 'view' }).lean();
    expect(String(engagement.ambassadorId)).toBe(String(ambassador._id));
    expect(engagement.referralCode).toBe(ambassador.referralCode); // codes match whatever the case typed

    const wrong = await request(app).post(`/api/v1/opportunities/${opportunity._id}/views`).send({ referralCode: 'GOD-NOPE00' });
    expect(wrong.statusCode).toBe(400);
  });

  it('an application in the app with the code is credited when the listing asks for codes', async () => {
    const asks = await listing({ referralCodeOnApply: true });
    const seeker = await makeUser('Seeker One');

    const applied = await request(app).post(`/api/v1/opportunities/${asks._id}/applicants`).set(...bearer(seeker))
      .send({ coverLetter: 'Applied via the Global Opportunity Desk app', referralCode: ` ${ambassador.referralCode} ` });

    expect(applied.statusCode).toBe(201);
    const applicant = await Applicant.findOne({ opportunityId: asks._id }).lean();
    expect(String(applicant.ambassadorId)).toBe(String(ambassador._id));
    expect(applicant.referralCode).toBe(ambassador.referralCode);
    expect(await OpportunityEngagement.countDocuments({ event: 'application', ambassadorId: ambassador._id })).toBe(1);
  });

  it('a wrong code stops the application so it can be corrected; a listing that does not ask ignores the code', async () => {
    const asks = await listing({ referralCodeOnApply: true });
    const doesNotAsk = await listing({ title: 'No Referral Listing', referralCodeOnApply: false });
    const seeker = await makeUser('Seeker Two');

    const wrong = await request(app).post(`/api/v1/opportunities/${asks._id}/applicants`).set(...bearer(seeker)).send({ referralCode: 'GOD-NOPE00' });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.body.error.message).toBe('Invalid referral code');
    expect(await Applicant.countDocuments({ opportunityId: asks._id })).toBe(0);

    const ignored = await request(app).post(`/api/v1/opportunities/${doesNotAsk._id}/applicants`).set(...bearer(seeker)).send({ referralCode: ambassador.referralCode });
    expect(ignored.statusCode).toBe(201);
    expect((await Applicant.findOne({ opportunityId: doesNotAsk._id }).lean()).ambassadorId).toBeUndefined();
  });

  it('the ambassador\'s own results add up the referred clicks and verified sign-ups', async () => {
    const opportunity = await listing({ referralCodeOnApply: true });
    await request(app).post(`/api/v1/opportunities/${opportunity._id}/views`).send({ referralCode: ambassador.referralCode, source: 'app' });
    await request(app).post(`/api/v1/opportunities/${opportunity._id}/views`).send({ referralCode: ambassador.referralCode, source: 'website' });
    // A sign-up counts once staff record the person as a beneficiary linked to the ambassador and verify them.
    await Beneficiary.create({ fullName: 'Referred Person', email: `ref-${Date.now()}@example.com`, ambassadorId: ambassador._id, verified: true, verifiedAt: today });

    const [entry] = await calculateLeaderboard(today.slice(0, 7));

    expect(String(entry.ambassador.id)).toBe(String(ambassador._id));
    expect(entry).toMatchObject({ clicks: 2, signups: 1, rank: 1 });
  });
});
