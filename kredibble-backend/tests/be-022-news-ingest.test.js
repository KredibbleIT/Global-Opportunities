import request from 'supertest';
import { app } from '../src/app.js';
import { User, AuditLog } from '../src/models/User.js';
import { NewsItem } from '../src/models/Content.js';
import { signAdminToken, signToken } from '../src/middleware/auth.js';
import { mapWordPressPost, storePosts, toPublicNewsItem } from '../src/lib/news-ingest.js';

const api = (path) => `/api/v1${path}`;
const bearer = (user) => ({ Authorization: `Bearer ${signToken(user)}` });
const adminCookie = (admin) => `kredibble_admin_token=${signAdminToken(admin)}`;

const createAdmin = () => User.create({ name: 'Ada Admin', email: 'ada@example.com', role: 'admin', passwordHash: 'x' });
const createSeeker = (email = 'ama@example.com') =>
  User.create({ name: 'Ama Mensah', email, role: 'seeker', passwordHash: 'x' });

const wpPost = (overrides = {}) => ({
  id: 4242,
  date_gmt: '2026-10-05T08:00:00',
  title: { rendered: '<p>Youth Grants <strong>Open</strong></p>' },
  excerpt: { rendered: '<p>Apply now for youth grants across Ghana.</p>' },
  content: { rendered: '<p>Full details and eligibility.</p>' },
  link: 'https://insight.example.com/youth-grants-open',
  _embedded: { 'wp:featuredmedia': [{ source_url: 'https://insight.example.com/img.jpg' }] },
  ...overrides,
});

describe('BE-022 news mapping', () => {
  it('strips html, builds stable external ids and trims safely', () => {
    const mapped = mapWordPressPost('insight_ghana', 'Insight Ghana', wpPost());
    expect(mapped).toMatchObject({
      externalId: 'insight_ghana:4242',
      source: 'insight_ghana',
      title: 'Youth Grants Open',
      summary: 'Apply now for youth grants across Ghana.',
      link: 'https://insight.example.com/youth-grants-open',
      imageUrl: 'https://insight.example.com/img.jpg',
    });
    expect(mapped.publishedAt).toBeInstanceOf(Date);

    const bare = mapWordPressPost('african_journal', 'The African Journal', { id: 7 });
    expect(bare).toMatchObject({ externalId: 'african_journal:7', title: 'Untitled', imageUrl: null });
    expect(bare.publishedAt).toBeNull();
  });

  it('upserts by external id without duplicating and preserves hides', async () => {
    const first = mapWordPressPost('insight_ghana', 'Insight Ghana', wpPost());
    expect(await storePosts([first])).toBe(1);
    expect(await storePosts([{ ...first, title: 'Youth Grants Open (Updated)' }])).toBe(1);
    expect(await NewsItem.countDocuments()).toBe(1);
    expect((await NewsItem.findOne({ externalId: 'insight_ghana:4242' }).lean()).title).toBe('Youth Grants Open (Updated)');

    await NewsItem.updateOne({ externalId: 'insight_ghana:4242' }, { $set: { hidden: true } });
    await storePosts([first]);
    expect((await NewsItem.findOne({ externalId: 'insight_ghana:4242' }).lean()).hidden).toBe(true);
  });

  it('keeps the public proxy contract shape', () => {
    const doc = {
      _id: '0123456789abcdef01234567',
      source: 'insight_ghana',
      title: 'T',
      summary: 'S',
      content: 'C',
      link: 'https://x.example/y',
      imageUrl: null,
      publishedAt: new Date('2026-10-05T08:00:00Z'),
    };
    expect(toPublicNewsItem(doc)).toMatchObject({
      id: '0123456789abcdef01234567',
      source: 'insight_ghana',
      sourceName: 'Insight Ghana',
      title: 'T',
      url: 'https://x.example/y',
    });
  });
});

describe('BE-022 public news feed', () => {
  const seed = () => NewsItem.create([
    { externalId: 'insight_ghana:1', source: 'insight_ghana', title: 'Ghana item', publishedAt: new Date('2026-10-06') },
    { externalId: 'african_journal:2', source: 'african_journal', title: 'Journal item', publishedAt: new Date('2026-10-05') },
    { externalId: 'insight_ghana:3', source: 'insight_ghana', title: 'Hidden item', hidden: true, publishedAt: new Date('2026-10-07') },
  ]);

  it('serves stored items newest-first, hides hidden ones, filters and paginates', async () => {
    await seed();

    const all = await request(app).get(api('/news'));
    expect(all.status).toBe(200);
    expect(all.body.data.map((n) => n.title)).toEqual(['Ghana item', 'Journal item']);

    const filtered = await request(app).get(api('/news?source=african_journal'));
    expect(filtered.body.data.map((n) => n.title)).toEqual(['Journal item']);

    const paged = await request(app).get(api('/news?perPage=1&page=2'));
    expect(paged.body.data.map((n) => n.title)).toEqual(['Journal item']);
    expect(paged.body.meta).toMatchObject({ total: 2 });

    expect((await request(app).get(api('/news?source=nope'))).status).toBe(400);
  });

  it('serves single items and 404s hidden or missing ones', async () => {
    const [visible, hidden] = await Promise.all([
      NewsItem.create({ externalId: 'insight_ghana:10', source: 'insight_ghana', title: 'Visible' }),
      NewsItem.create({ externalId: 'insight_ghana:11', source: 'insight_ghana', title: 'Gone', hidden: true }),
    ]);
    expect((await request(app).get(api(`/news/${visible._id}`))).status).toBe(200);
    expect((await request(app).get(api(`/news/${hidden._id}`))).status).toBe(404);
    expect((await request(app).get(api('/news/0123456789abcdef01234567'))).status).toBe(404);
  });
});

describe('BE-022 admin news moderation', () => {
  it('lists everything including hidden, hides and re-shows with audit', async () => {
    const admin = await createAdmin();
    const seeker = await createSeeker();
    const item = await NewsItem.create({ externalId: 'insight_ghana:20', source: 'insight_ghana', title: 'Review me' });

    const list = await request(app).get(api('/admin/news')).set('Cookie', adminCookie(admin));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);

    const hide = await request(app).patch(api(`/admin/news/${item._id}`)).set('Cookie', adminCookie(admin)).send({ hidden: true });
    expect(hide.status).toBe(200);
    expect(hide.body.data.hidden).toBe(true);
    expect((await NewsItem.findById(item._id).lean()).hiddenBy).toBeTruthy();

    // Hidden items leave the public feed immediately.
    expect((await request(app).get(api(`/news/${item._id}`))).status).toBe(404);

    const show = await request(app).patch(api(`/admin/news/${item._id}`)).set('Cookie', adminCookie(admin)).send({ hidden: false });
    expect(show.body.data.hidden).toBe(false);

    const audits = await AuditLog.find({ action: 'news.update' }).lean();
    expect(audits).toHaveLength(2);

    expect((await request(app).get(api('/admin/news'))).status).toBe(401);
    expect((await request(app).get(api('/admin/news')).set(bearer(seeker))).status).toBe(403);
    expect(
      (await request(app).patch(api(`/admin/news/${item._id}`)).set('Cookie', adminCookie(admin)).send({ hidden: 'yes' })).status,
    ).toBe(400);
    expect(
      (await request(app).patch(api('/admin/news/0123456789abcdef01234567')).set('Cookie', adminCookie(admin)).send({ hidden: true })).status,
    ).toBe(404);
  });
});
