import request from 'supertest';
import { app } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Opportunity, Event, Grant } from '../src/models/Platform.js';
import { signToken, signAdminToken } from '../src/middleware/auth.js';
import { OPPORTUNITY_CATEGORIES, categoryOfType } from '../src/lib/opportunity-categories.js';

// The eight categories of the Opportunities screen and what GET /opportunities/category-counts counts. ALL DATA IS FAKE.

const counts = (token) => request(app).get('/api/v1/opportunities/category-counts').set('Authorization', `Bearer ${token}`);

const listing = (type, overrides = {}) => ({
  title: `Test ${type} listing`,
  type,
  company: 'Test Organisation',
  location: 'Accra, Ghana',
  description: 'A fake listing for the tests.',
  vetted: true,
  moderationStatus: 'approved',
  status: 'published',
  ...overrides,
});

describe('opportunity categories', () => {
  it('has the eight categories, and every type belongs to one category only', () => {
    expect(OPPORTUNITY_CATEGORIES.map((category) => category.label)).toEqual([
      'Events & Competitions',
      'Volunteerism & Community Service',
      'Awards, Grants & Funding',
      'Jobs & Internships',
      'Scholarships',
      'Fellowships & Exchange Programmes',
      'Training & Workshops',
      'Mentorship & Career Development',
    ]);
    const seen = OPPORTUNITY_CATEGORIES.flatMap((category) => category.types);
    expect(new Set(seen).size).toBe(seen.length);
    for (const category of OPPORTUNITY_CATEGORIES) expect(category.types).toContain(category.createType);
    expect(categoryOfType('internship')).toBe('jobs');
    expect(categoryOfType('competition')).toBe('events');
    expect(categoryOfType('unknown')).toBeNull();
  });

  it('accepts the new types: a volunteering and a mentorship listing can be saved', async () => {
    await expect(Opportunity.create(listing('volunteer'))).resolves.toBeTruthy();
    await expect(Opportunity.create(listing('mentorship'))).resolves.toBeTruthy();
  });
});

describe('GET /opportunities/category-counts', () => {
  let token;
  beforeEach(async () => {
    await Promise.all([Opportunity.deleteMany({}), Event.deleteMany({}), Grant.deleteMany({})]);
    const seeker = await User.create({ name: 'Test Seeker', email: `cat-${Date.now()}@example.com`, role: 'seeker', passwordHash: 'x' });
    token = signToken(seeker);
  });

  it('needs a signed-in user', async () => {
    await request(app).get('/api/v1/opportunities/category-counts').expect(401);
  });

  it('counts the approved listings of each category, and only those', async () => {
    await Opportunity.create([
      listing('job'), listing('jobs'), listing('internship'),
      listing('event'), listing('competition'),
      listing('volunteer'), listing('scholarship'), listing('scholarship'),
      listing('fellowship'), listing('training-workshop'), listing('mentorship'),
      listing('grant'),
      // not counted: waiting for review, rejected, a draft
      listing('job', { moderationStatus: 'pending', status: 'pending' }),
      listing('event', { moderationStatus: 'rejected', status: 'rejected' }),
      listing('volunteer', { vetted: false, status: 'draft', moderationStatus: 'draft' }),
    ]);
    const res = await counts(token).expect(200);
    expect(res.body.data).toEqual({
      events: 2,
      volunteer: 1,
      funding: 1,
      jobs: 3,
      scholarships: 2,
      fellowships: 1,
      training: 1,
      mentorship: 1,
    });
  });

  it('adds the separate Events and Grants collections, which the app lists merge in, but not a cancelled event', async () => {
    await Opportunity.create(listing('event'));
    await Event.create([
      { title: 'Test Meetup', hirer: 'Test Organisation', location: 'Accra', dateTime: '2026-12-01T10:00', capacity: 50 },
      { title: 'Test Cancelled', hirer: 'Test Organisation', location: 'Accra', dateTime: '2026-12-02T10:00', capacity: 50, status: 'cancelled' },
    ]);
    await Grant.create({ title: 'Test Fund', hirer: 'Test Organisation', sector: 'Health', fundingPool: 1000 });
    const res = await counts(token).expect(200);
    expect(res.body.data.events).toBe(2);
    expect(res.body.data.funding).toBe(1);
  });

  it('is zero everywhere when nothing is posted', async () => {
    const res = await counts(token).expect(200);
    expect(Object.values(res.body.data).every((value) => value === 0)).toBe(true);
    expect(Object.keys(res.body.data)).toHaveLength(8);
  });
});

describe('category details saved by the admin and read by the app', () => {
  let admin;
  let seekerToken;
  beforeEach(async () => {
    await Opportunity.deleteMany({});
    admin = await User.create({ name: 'Test Admin', email: `cat-admin-${Date.now()}@example.com`, role: 'admin', passwordHash: 'x' });
    const seeker = await User.create({ name: 'Test Seeker', email: `cat-seeker-${Date.now()}@example.com`, role: 'seeker', passwordHash: 'x' });
    seekerToken = signToken(seeker);
  });

  const post = (body) =>
    request(app).post('/api/v1/admin/opportunities').set('Cookie', `kredibble_admin_token=${signAdminToken(admin)}`).send(body);

  const scholarship = {
    title: 'Test Scholarship',
    type: 'scholarship',
    organisation: 'Test Foundation',
    description: 'A fake scholarship for the tests.',
    status: 'published',
    publish: true,
    vetted: true,
    vettedOn: '2026-11-01',
    applyUrl: 'https://example.com/apply',
    eligibility: 'Citizens of Ghana\nUnder 30',
    benefits: 'Tuition\nA living allowance',
    fundingType: 'fully-funded',
    level: "Master's",
    focusArea: 'Health',
    certificateOffered: true,
  };

  it('keeps who can apply, what it offers, the funding type, the level, the focus area and the certificate flag', async () => {
    const res = await post(scholarship).expect(201);
    expect(res.body.data).toMatchObject({
      eligibility: 'Citizens of Ghana\nUnder 30',
      benefits: 'Tuition\nA living allowance',
      fundingType: 'fully-funded',
      level: "Master's",
      focusArea: 'Health',
      certificateOffered: true,
    });
    const list = await request(app).get('/api/v1/opportunities?type=scholarship').set('Authorization', `Bearer ${seekerToken}`).expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ fundingType: 'fully-funded', level: "Master's", focusArea: 'Health', certificateOffered: true });
  });

  it('refuses a funding type that does not exist', async () => {
    const res = await post({ ...scholarship, fundingType: 'free-money' });
    expect(res.status).toBe(400);
  });

  it('changes the details with an update', async () => {
    const created = await post(scholarship).expect(201);
    const id = created.body.data.id;
    const res = await request(app)
      .patch(`/api/v1/admin/opportunities/${id}`)
      .set('Cookie', `kredibble_admin_token=${signAdminToken(admin)}`)
      .send({ fundingType: 'partially-funded', level: 'PhD', focusArea: 'Education' })
      .expect(200);
    expect(res.body.data).toMatchObject({ fundingType: 'partially-funded', level: 'PhD', focusArea: 'Education' });
  });
});
