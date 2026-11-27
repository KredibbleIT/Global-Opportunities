import request from 'supertest';
import { app } from '../src/app.js';
import { signToken } from '../src/middleware/auth.js';
import { User } from '../src/models/User.js';
import { Ambassador, AmbassadorAmplification, Beneficiary } from '../src/models/AdminPortal.js';

// GOD-T106 (task sheet, 18 Nov 2026): ambassadors could not see their own results or the leaderboard in the app; only staff could
// (admin Leaderboard). Two app routes now give an ambassador their month's results and the month's leaderboard, from the same
// calculation as the admin page, without anyone's email or phone. ALL DATA IS FAKE.
const today = new Date().toISOString().slice(0, 10);
const thisMonth = today.slice(0, 7);
const bearer = (user) => ['Authorization', `Bearer ${signToken(user)}`];

const makeUser = (name) => User.create({
  name, email: `${name.toLowerCase().replace(/\s+/g, '.')}-${Date.now()}-${Math.random()}@example.com`, role: 'seeker', passwordHash: 'x', tokenVersion: 1, emailVerified: true,
});

describe('GOD-T106: ambassador results and leaderboard in the app', () => {
  let ama;
  let kofi;
  let amaAmbassador;

  beforeEach(async () => {
    await Promise.all([Ambassador.deleteMany({}), AmbassadorAmplification.deleteMany({}), Beneficiary.deleteMany({})]);
    ama = await makeUser('Ama Test');
    kofi = await makeUser('Kofi Test');
    [amaAmbassador] = await Ambassador.create([
      { fullName: 'Ama Test', email: ama.email, phone: '+233200000001', linkedUserId: ama._id, status: 'active', tier: 'ambassador', campus: 'Test Campus', country: 'Ghana', joinedAt: `${thisMonth}-01`, referralCode: 'AMA123' },
      { fullName: 'Kofi Test', email: kofi.email, phone: '+233200000002', linkedUserId: kofi._id, status: 'active', tier: 'senior', country: 'Ghana', joinedAt: `${thisMonth}-01`, referralCode: 'KOFI12' },
    ]);
    const kofiAmbassador = await Ambassador.findOne({ linkedUserId: kofi._id });
    await AmbassadorAmplification.create([
      { ambassadorId: amaAmbassador._id, channel: 'whatsapp', at: today, clicks: 4 },
      { ambassadorId: amaAmbassador._id, channel: 'linkedin', at: today, clicks: 1 },
      { ambassadorId: kofiAmbassador._id, channel: 'whatsapp', at: today, clicks: 2 },
    ]);
    await Beneficiary.create([
      { fullName: 'Referred One', email: `r1-${Date.now()}@example.com`, ambassadorId: kofiAmbassador._id, verified: true, verifiedAt: today },
    ]);
  });

  it('an ambassador sees their own results for the month', async () => {
    const response = await request(app).get('/api/v1/ambassador-requests/me/results').set(...bearer(ama));

    expect(response.statusCode).toBe(200);
    const body = response.body.data ?? response.body;
    // Kofi has one verified sign-up, so he ranks first; Ama has more clicks and shares but no sign-up yet.
    expect(body).toEqual({ month: thisMonth, rank: 2, of: 2, signups: 0, clicks: 5, shares: 2, referralCode: 'AMA123', tier: 'ambassador' });
  });

  it('the leaderboard ranks the month, marks the caller and never includes contact details', async () => {
    const response = await request(app).get('/api/v1/ambassador-requests/leaderboard').set(...bearer(ama));

    expect(response.statusCode).toBe(200);
    const body = response.body.data ?? response.body;
    expect(body.month).toBe(thisMonth);
    expect(body.total).toBe(2);
    expect(body.rows.map((row) => [row.rank, row.name, row.isYou])).toEqual([[1, 'Kofi Test', false], [2, 'Ama Test', true]]);
    expect(body.rows[0]).toEqual({ rank: 1, name: 'Kofi Test', campus: '', country: 'Ghana', tier: 'senior', signups: 1, clicks: 2, shares: 1, isYou: false });
    expect(JSON.stringify(body)).not.toMatch(/@example\.com|\+2332000000/);
    expect(body.you).toBeNull(); // Ama is already in the list
  });

  it('someone who is not an ambassador gets neither', async () => {
    const outsider = await makeUser('Outside Test');
    expect((await request(app).get('/api/v1/ambassador-requests/me/results').set(...bearer(outsider))).statusCode).toBe(403);
    expect((await request(app).get('/api/v1/ambassador-requests/leaderboard').set(...bearer(outsider))).statusCode).toBe(403);
    expect((await request(app).get('/api/v1/ambassador-requests/leaderboard')).statusCode).toBe(401);
  });

  it('a bad month falls back to this month', async () => {
    const response = await request(app).get('/api/v1/ambassador-requests/me/results?month=nonsense').set(...bearer(ama));
    expect((response.body.data ?? response.body).month).toBe(thisMonth);
  });
});
