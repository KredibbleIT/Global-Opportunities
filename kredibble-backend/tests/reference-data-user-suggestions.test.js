import request from 'supertest';
import { app } from '../src/app.js';
import { ReferenceDataList } from '../src/models/AdminPortal.js';

describe('Reference data user suggestions', () => {
  it('normalizes and rejects exact duplicates, including case, punctuation and whitespace differences', async () => {
    const create = await request(app)
      .post('/api/v1/reference-data/seeker/programs/items')
      .send({ label: 'Software Engineering!!!' })
      .expect(400);

    expect(create.body.error.code).toBe('REFERENCE_ITEM_INVALID');

    const duplicate = await request(app)
      .post('/api/v1/reference-data/seeker/programs/items')
      .send({ label: 'software engineering' })
      .expect(200);

    expect(duplicate.body.data).toEqual(expect.objectContaining({
      action: 'use_existing',
      item: 'Software Engineering',
      created: false,
    }));
  });

  it('queues a new program for staff review instead of showing it to everyone (GOD-T59)', async () => {
    const created = await request(app)
      .post('/api/v1/reference-data/seeker/programs/items')
      .send({ label: 'Aerospace Navigation Science' })
      .expect(200);

    // The person who typed it keeps it; the shared list waits for an admin.
    expect(created.body.data).toEqual({
      action: 'created',
      item: 'Aerospace Navigation Science',
      created: true,
      pending: true,
    });

    const list = await request(app)
      .get('/api/v1/reference-data/seeker/programs')
      .expect(200);

    expect(list.body.data.items).not.toContain('Aerospace Navigation Science');

    const repeated = await request(app)
      .post('/api/v1/reference-data/seeker/programs/items')
      .send({ label: 'aerospace navigation science' })
      .expect(200);

    expect(repeated.body.data).toEqual(expect.objectContaining({ action: 'created', pending: true }));
    const stored = await ReferenceDataList.findOne({ group: 'seeker', key: 'programs' }).lean();
    expect(stored.pendingItems).toHaveLength(1);
    expect(stored.pendingItems[0]).toEqual(expect.objectContaining({ label: 'Aerospace Navigation Science', count: 2 }));
    expect(await ReferenceDataList.countDocuments({ group: 'seeker', key: 'programs' })).toBe(1);
  });

  it('returns likely duplicates for review instead of creating a new item', async () => {
    const result = await request(app)
      .post('/api/v1/reference-data/seeker/programs/items')
      .send({ label: 'Computer Sci' })
      .expect(200);

    expect(result.body.data.action).toBe('similar');
    expect(result.body.data.matches).toContain('Computer Science');

    const list = await request(app)
      .get('/api/v1/reference-data/seeker/programs')
      .expect(200);

    expect(list.body.data.items).not.toContain('Computer Sci');
  });

  it('saves a confirmed alias without adding a synonymous list item', async () => {
    const aliased = await request(app)
      .post('/api/v1/reference-data/seeker/programs/items')
      .send({ label: 'CompSci', item: 'Computer Science' })
      .expect(200);

    expect(aliased.body.data).toEqual(expect.objectContaining({
      action: 'aliased',
      item: 'Computer Science',
      alias: 'CompSci',
      created: true,
    }));

    const exact = await ReferenceDataList.findOne({ group: 'seeker', key: 'programs' }).lean();
    expect(exact.items).toContain('Computer Science');
    expect(exact.items).not.toContain('CompSci');
    expect(exact.aliases).toContainEqual(expect.objectContaining({ alias: 'CompSci', item: 'Computer Science' }));
  });

  it('resolves a saved alias to the canonical item for future users', async () => {
    await request(app)
      .post('/api/v1/reference-data/seeker/programs/items')
      .send({ label: 'CompSci', item: 'Computer Science' })
      .expect(200);

    const result = await request(app)
      .post('/api/v1/reference-data/seeker/programs/items')
      .send({ label: 'compsci' })
      .expect(200);

    expect(result.body.data).toEqual(expect.objectContaining({
      action: 'use_existing',
      item: 'Computer Science',
      aliased: true,
    }));
  });

  it('rejects free-text additions to lists that are not offered during registration', async () => {
    const result = await request(app)
      .post('/api/v1/reference-data/seeker/countries/items')
      .send({ label: 'Atlantis' })
      .expect(403);

    expect(result.body.error.code).toBe('REFERENCE_ITEM_NOT_ADDABLE');
  });

  it('rejects links, email addresses and phone numbers as list suggestions', async () => {
    for (const label of ['https://example.com/program', 'owner@example.com', '+233 24 123 4567']) {
      const result = await request(app)
        .post('/api/v1/reference-data/seeker/programs/items')
        .send({ label });

      expect(result.statusCode).toBe(400);
      expect(result.body.error.code).toBe('REFERENCE_ITEM_INVALID');
    }
  });

  it('extends the same review queue and duplicate handling to all four seeker registration lists', async () => {
    for (const [key, item] of [
      ['universities', 'Academic City University College'],
      ['skills', 'Kubernetes Orchestration'],
      ['career-interests', 'Space Policy'],
    ]) {
      const created = await request(app)
        .post(`/api/v1/reference-data/seeker/${key}/items`)
        .send({ label: item })
        .expect(200);

      expect(created.body.data).toEqual(expect.objectContaining({ action: 'created', item, pending: true }));

      const repeated = await request(app)
        .post(`/api/v1/reference-data/seeker/${key}/items`)
        .send({ label: item.toLowerCase() })
        .expect(200);

      // Same suggestion again: counted on the one queued entry, not added twice.
      expect(repeated.body.data).toEqual(expect.objectContaining({ action: 'created', pending: true }));
      const stored = await ReferenceDataList.findOne({ group: 'seeker', key }).lean();
      expect(stored.pendingItems.map((entry) => [entry.label, entry.count])).toEqual([[item, 2]]);
      expect(stored.items).not.toContain(item);
    }
  });
});
