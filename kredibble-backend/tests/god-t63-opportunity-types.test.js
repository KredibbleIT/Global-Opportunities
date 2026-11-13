import request from 'supertest';
import { app } from '../src/app.js';
import { Opportunity } from '../src/models/Platform.js';

const api = (path) => `/api/v1${path}`;

/** Creates a listing the public can see unless `overrides` say otherwise. */
const createListing = (title, type, overrides = {}) =>
  Opportunity.create({
    title,
    type,
    company: 'Global Opportunity Desk',
    location: 'Accra',
    description: 'Test listing',
    status: 'published',
    moderationStatus: 'published',
    vetted: true,
    ...overrides,
  });

/** Titles in a public `/opportunities` response, sorted for stable comparison. */
const titlesFor = async (query) => {
  const res = await request(app).get(api(`/opportunities?${query}`));
  expect(res.status).toBe(200);
  return res.body.data.map((item) => item.title).sort();
};

describe('GOD-T63: /opportunities?type= matches singular and plural types', () => {
  beforeEach(async () => {
    await Opportunity.deleteMany({});
    await createListing('Dashboard job', 'job');
    await createListing('Website job', 'jobs');
    await createListing('Dashboard event', 'event');
    await createListing('Unvetted event', 'event', { vetted: false, moderationStatus: 'pending', status: 'draft' });
    await createListing('Dashboard fellowship', 'fellowship');
  });

  it('the app asking for "jobs" also gets jobs the dashboard saved as "job"', async () => {
    expect(await titlesFor('type=jobs')).toEqual(['Dashboard job', 'Website job']);
    expect(await titlesFor('type=job')).toEqual(['Dashboard job', 'Website job']);
  });

  it('events posted from the dashboard are public, unvetted ones stay hidden', async () => {
    expect(await titlesFor('type=event')).toEqual(['Dashboard event']);
    expect(await titlesFor('type=events')).toEqual(['Dashboard event']);
  });

  it('a type with no other spelling still matches exactly', async () => {
    expect(await titlesFor('type=fellowship')).toEqual(['Dashboard fellowship']);
  });

  it('an unknown type returns nothing rather than everything', async () => {
    expect(await titlesFor('type=spaceship')).toEqual([]);
  });

  it('still refuses operator objects in the type parameter (SEC-061)', async () => {
    const res = await request(app).get(api('/opportunities?type[$ne]=job'));
    expect(res.status).toBe(400);
  });
});
