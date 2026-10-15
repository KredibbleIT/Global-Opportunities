import request from 'supertest';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { User, AuditLog } from '../src/models/User.js';
import { Opportunity } from '../src/models/Platform.js';
import { CategoryMap } from '../src/models/AdminPortal.js';
import { signAdminToken, signToken } from '../src/middleware/auth.js';
import { normalizeCategoryName, buildTallyReport } from '../src/lib/website-tally.js';

const api = (path) => `/api/v1${path}`;
const bearer = (user) => ({ Authorization: `Bearer ${signToken(user)}` });
const adminCookie = (admin) => `kredibble_admin_token=${signAdminToken(admin)}`;

const createAdmin = () => User.create({ name: 'Ada Admin', email: 'ada@example.com', role: 'admin', passwordHash: 'x' });
const createSeeker = (email = 'ama@example.com') =>
  User.create({ name: 'Ama Mensah', email, role: 'seeker', passwordHash: 'x' });

const appOpp = (overrides = {}) => ({
  title: 'Nurse Training Scholarship',
  type: 'training-workshop',
  ...overrides,
});

describe('BE-021 tally comparison', () => {
  it('normalizes category names for comparison', () => {
    expect(normalizeCategoryName('  Training-Workshop ')).toBe('training workshop');
    expect(normalizeCategoryName('JOBS')).toBe('jobs');
  });

  it('matches opportunities by website id then title, and splits categories', () => {
    const report = buildTallyReport({
      websiteOpportunities: [
        { id: 'wp-1', title: 'Nurse Training Scholarship', category: 'Training-Workshop' },
        { id: 'wp-2', title: 'Only On Website', category: 'Events' },
        { id: 'wp-3', title: 'Fellowship With Odd Name', category: 'Fellowships' },
      ],
      websiteCategories: [{ name: 'Training-Workshop' }, { name: 'Events' }, { name: 'Fellowships' }],
      appOpportunities: [
        appOpp({ wordpressSync: { wordpressId: 'wp-1' } }),
        appOpp({ title: 'Only In App', type: 'job' }),
      ],
      mappings: [{ websiteCategory: 'Fellowships', appCategory: 'fellowship' }],
    });

    expect(report.opportunities.inBoth).toHaveLength(1);
    expect(report.opportunities.onlyWebsite.map((o) => o.externalId)).toEqual(['wp-2', 'wp-3']);
    expect(report.opportunities.onlyApp.map((o) => o.title)).toEqual(['Only In App']);

    // 'Training-Workshop' matches the app type modulo case/separator.
    expect(report.categories.inBoth.map((c) => c.websiteCategory)).toEqual(['Training-Workshop']);
    // 'Events' resolves to nothing in the app data; 'Fellowships' maps to a
    // type the app has no listings for yet.
    expect(report.categories.onlyWebsite).toEqual([
      { websiteCategory: 'Events', appCategory: null },
      { websiteCategory: 'Fellowships', appCategory: 'fellowship' },
    ]);
    // App types with no website coverage.
    expect(report.categories.onlyApp.map((c) => c.appCategory)).toEqual(expect.arrayContaining(['job']));
  });

  it('reports differing names and unmapped website categories', () => {
    const report = buildTallyReport({
      websiteOpportunities: [{ id: 'wp-9', title: 'X', category: 'Capacity Building' }],
      websiteCategories: [{ name: 'Capacity Building' }, { name: 'Brand New Thing' }],
      appOpportunities: [appOpp({ type: 'training-workshop' })],
      mappings: [
        { websiteCategory: 'Capacity Building', appCategory: 'training-workshop' },
        { websiteCategory: 'Legacy Name', appCategory: null },
      ],
    });

    expect(report.categories.differing).toEqual([
      { websiteCategory: 'Capacity Building', appCategory: 'training-workshop' },
    ]);
    // 'Brand New Thing' has no mapping row yet: website-only, awaiting triage.
    expect(report.categories.onlyWebsite).toEqual([
      { websiteCategory: 'Brand New Thing', appCategory: null },
    ]);
    // 'Legacy Name' has a mapping row with no app category: awaiting curation.
    expect(report.categories.unmapped.map((c) => c.websiteCategory)).toEqual(['Legacy Name']);
  });
});

describe('BE-021 taxonomy endpoints', () => {
  it('lists, creates, updates and clears mappings with an audit trail', async () => {
    const admin = await createAdmin();

    const empty = await request(app).get(api('/admin/sync/taxonomy')).set('Cookie', adminCookie(admin));
    expect(empty.status).toBe(200);
    expect(empty.body.data).toEqual([]);

    const created = await request(app).put(api('/admin/sync/taxonomy')).set('Cookie', adminCookie(admin)).send({
      websiteCategory: 'Capacity Building',
      appCategory: 'training-workshop',
      note: 'GOD site label',
    });
    expect(created.status).toBe(200);
    expect(created.body.data).toMatchObject({ websiteCategory: 'Capacity Building', appCategory: 'training-workshop' });

    const updated = await request(app).put(api('/admin/sync/taxonomy')).set('Cookie', adminCookie(admin)).send({
      websiteCategory: 'Capacity Building',
      appCategory: 'job',
    });
    expect(updated.body.data.appCategory).toBe('job');
    expect(await CategoryMap.countDocuments()).toBe(1);

    const cleared = await request(app).put(api('/admin/sync/taxonomy')).set('Cookie', adminCookie(admin)).send({
      websiteCategory: 'Capacity Building',
      appCategory: null,
    });
    expect(cleared.body.data.appCategory).toBeNull();

    const audits = await AuditLog.find({ action: 'settings.update', 'metadata.setting': 'category_taxonomy' }).lean();
    expect(audits.length).toBeGreaterThanOrEqual(3);
    expect(audits[0].metadata).toMatchObject({ websiteCategory: 'Capacity Building' });
  });

  it('rejects unknown app categories, strangers and bad ids', async () => {
    const admin = await createAdmin();
    const seeker = await createSeeker();

    expect((await request(app).get(api('/admin/sync/taxonomy'))).status).toBe(401);
    expect((await request(app).get(api('/admin/sync/taxonomy')).set(bearer(seeker))).status).toBe(403);
    expect(
      (await request(app).put(api('/admin/sync/taxonomy')).set('Cookie', adminCookie(admin)).send({
        websiteCategory: 'X',
        appCategory: 'teleportation',
      })).status,
    ).toBe(400);
    expect(
      (await request(app).put(api('/admin/sync/taxonomy')).set('Cookie', adminCookie(admin)).send({ appCategory: 'job' })).status,
    ).toBe(400);
    expect(await CategoryMap.countDocuments()).toBe(0);
  });
});

describe('BE-021 live tally endpoint', () => {
  it('answers 502 when the website is not configured', async () => {
    const admin = await createAdmin();
    const saved = env.wordpressSyncBaseUrl;
    env.wordpressSyncBaseUrl = undefined;
    try {
      const res = await request(app).get(api('/admin/sync/tally')).set('Cookie', adminCookie(admin));
      expect(res.status).toBe(502);
    } finally {
      env.wordpressSyncBaseUrl = saved;
    }
  });

  it('compares stored app data through the same report the script prints', async () => {
    await Opportunity.create({
      title: 'Nurse Training Scholarship',
      type: 'training-workshop',
      company: 'Ghana Health Service',
      location: 'Accra',
      description: 'Training for nurses.',
      wordpressSync: { wordpressId: 'wp-1', status: 'synced' },
    });
    await CategoryMap.create({ websiteCategory: 'Training-Workshop', appCategory: 'training-workshop' });

    // The endpoint needs the live website; without it the shape contract is
    // covered by buildTallyReport unit tests above plus the script output.
    const report = buildTallyReport({
      websiteOpportunities: [{ id: 'wp-1', title: 'Nurse Training Scholarship', category: 'Training-Workshop' }],
      websiteCategories: [],
      appOpportunities: await Opportunity.find({}).lean(),
      mappings: await CategoryMap.find({}).lean(),
    });
    expect(report.opportunities.inBoth).toHaveLength(1);
    expect(report.categories.inBoth).toHaveLength(1);
  });
});
