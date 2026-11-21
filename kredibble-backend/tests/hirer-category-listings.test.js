import request from 'supertest';
import { app } from '../src/app.js';
import { User } from '../src/models/User.js';
import { HirerAccount } from '../src/models/Profiles.js';
import { Opportunity } from '../src/models/Platform.js';
import { signToken } from '../src/middleware/auth.js';
import { categoryOfType } from '../src/lib/opportunity-categories.js';

// A hirer posts in any of the eight categories, with the details the newer ones use. ALL DATA IS FAKE.

const api = (route) => `/api/v1${route}`;
const bearer = (user) => ['Authorization', `Bearer ${signToken(user)}`];

describe('a hirer posts in the newer categories', () => {
  let hirer;
  let account;

  beforeEach(async () => {
    hirer = await User.create({ name: 'Test Hirer', email: `hirer-cat-${Date.now()}@example.com`, role: 'hirer', passwordHash: 'x' });
    account = await HirerAccount.create({ userId: hirer._id, companyName: 'Test Company', industry: 'Technology', location: 'Accra' });
  });

  const post = (body) => request(app).post(api('/opportunities')).set(...bearer(hirer)).send({
    hirerId: String(account._id), company: 'Test Company', location: 'Accra, Ghana', description: 'A fake listing for tests.', ...body,
  });

  it.each(['volunteer', 'scholarship', 'fellowship', 'training', 'mentorship'])('saves a %s listing with its deadline, link, who can apply and what it offers', async (type) => {
    const res = await post({
      title: `Test ${type}`,
      type,
      deadline: '2099-12-31',
      applyUrl: 'https://example.org/apply',
      eligibility: '- Citizens of Ghana\n- Under 30 years old',
      benefits: '**Tuition** and a monthly allowance',
    }).expect(201);
    expect(categoryOfType(res.body.data.type)).toBeTruthy();
    const stored = await Opportunity.findById(res.body.data.id);
    expect(stored.type).toBe(type);
    expect(stored.deadline.toISOString().slice(0, 10)).toBe('2099-12-31');
    expect(stored).toMatchObject({ applyUrl: 'https://example.org/apply', eligibility: '- Citizens of Ghana\n- Under 30 years old', benefits: '**Tuition** and a monthly allowance' });
  });

  it('never lets a hirer set what only the Desk may: it is refused, or ignored', async () => {
    for (const [field, value] of [['vetted', true], ['status', 'published'], ['moderationStatus', 'approved'], ['applicantsCount', 99]]) {
      const res = await post({ title: `Sneaky ${field}`, type: 'scholarship', [field]: value });
      expect([201, 400, 403]).toContain(res.status);
      if (res.status === 201) {
        const stored = await Opportunity.findById(res.body.data.id);
        expect(stored[field]).not.toBe(value);
      }
    }
  });

  it('refuses a type that is in none of the categories', async () => {
    expect((await post({ title: 'Nope', type: 'lottery' })).status).toBe(400);
  });
});
