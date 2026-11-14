import request from 'supertest';
import { app } from '../src/app.js';
import { Opportunity } from '../src/models/Platform.js';
import { seedStagingListings, sampleListings, SAMPLE_PREFIX } from '../scripts/seed-staging-listings.js';

const api = (path) => `/api/v1${path}`;

describe('GOD-T60: staging sample listings', () => {
  beforeEach(async () => {
    await Opportunity.deleteMany({});
  });

  it('adds one public listing per type, visible to the app', async () => {
    const result = await seedStagingListings();
    expect(result.added).toHaveLength(sampleListings().length);

    for (const type of ['event', 'job', 'internship', 'grant', 'scholarship', 'fellowship']) {
      const res = await request(app).get(api(`/opportunities?type=${type}`)).expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title.startsWith(SAMPLE_PREFIX)).toBe(true);
    }
  });

  it('running it again adds nothing', async () => {
    await seedStagingListings();
    const second = await seedStagingListings();
    expect(second.added).toEqual([]);
    expect(second.skipped).toHaveLength(sampleListings().length);
    expect(await Opportunity.countDocuments()).toBe(sampleListings().length);
  });

  it('--remove deletes only the samples', async () => {
    await seedStagingListings();
    await Opportunity.create({ title: 'A real listing', type: 'job', company: 'Real Co', location: 'Accra', description: 'Real' });

    const result = await seedStagingListings({ remove: true });

    expect(result.removed).toBe(sampleListings().length);
    expect(await Opportunity.countDocuments()).toBe(1);
  });
});
