import request from 'supertest';
import { app } from '../src/app.js';
import { signAdminToken } from '../src/middleware/auth.js';
import { User } from '../src/models/User.js';
import { Article } from '../src/models/Content.js';
import { publishDueArticles } from '../src/lib/article-scheduler.js';

// GOD-T73 (task sheet, 16 Nov 2026): "Scheduling articles doesn't work." Career resources articles could only be a draft or
// published at once. An article can now be scheduled: it carries publishAt, the app shows it once that time has passed, and the
// minute job marks it published.
const HOUR = 60 * 60 * 1000;
const base = { category: 'Career', summary: 'Summary', content: 'Body' };
const titles = (response) => response.body.data.map((article) => article.title);

describe('GOD-T73: scheduled Career resources articles', () => {
  let adminCookie;
  beforeEach(async () => {
    await Article.deleteMany({});
    const admin = await User.create({
      name: 'Desk Admin', email: `admin-${Date.now()}-${Math.random()}@example.com`, role: 'admin', passwordHash: 'x', tokenVersion: 1, emailVerified: true,
    });
    adminCookie = `kredibble_admin_token=${signAdminToken(admin)}`;
  });

  it('the app sees a scheduled article only once its time has come', async () => {
    await Article.create([
      { ...base, title: 'Published now', status: 'published' },
      { ...base, title: 'Due an hour ago', status: 'scheduled', publishAt: new Date(Date.now() - HOUR) },
      { ...base, title: 'Due tomorrow', status: 'scheduled', publishAt: new Date(Date.now() + 24 * HOUR) },
      { ...base, title: 'Still a draft', status: 'draft' },
    ]);

    const response = await request(app).get('/api/v1/articles');

    expect(response.statusCode).toBe(200);
    expect(titles(response).sort()).toEqual(['Due an hour ago', 'Published now']);
  });

  it('a scheduled article that is not yet due cannot be opened by id', async () => {
    const future = await Article.create({ ...base, title: 'Due tomorrow', status: 'scheduled', publishAt: new Date(Date.now() + 24 * HOUR) });
    const response = await request(app).get(`/api/v1/articles/${future._id}`);
    expect(response.statusCode).toBe(404);
  });

  it('the minute job publishes due articles and leaves the rest', async () => {
    const now = new Date();
    await Article.create([
      { ...base, title: 'Due', status: 'scheduled', publishAt: new Date(now.getTime() - 60_000) },
      { ...base, title: 'Not yet', status: 'scheduled', publishAt: new Date(now.getTime() + HOUR) },
      { ...base, title: 'Draft', status: 'draft' },
    ]);

    expect(await publishDueArticles({ now })).toEqual({ published: 1 });
    const statuses = Object.fromEntries((await Article.find({}).lean()).map((article) => [article.title, article.status]));
    expect(statuses).toEqual({ Due: 'published', 'Not yet': 'scheduled', Draft: 'draft' });
    expect(await publishDueArticles({ now })).toEqual({ published: 0 });
  });

  it('a scheduled article needs a publish time, and an unknown status is refused', async () => {
    await expect(Article.create({ ...base, title: 'No time', status: 'scheduled' })).rejects.toThrow(/needs a date and time/);
    await expect(Article.create({ ...base, title: 'Odd', status: 'live' })).rejects.toThrow(/status/);
  });

  it('the admin saves a scheduled article and can move it back to a draft', async () => {
    const publishAt = new Date(Date.now() + 2 * 24 * HOUR).toISOString();
    const created = await request(app).post('/api/v1/admin/articles').set('Cookie', adminCookie)
      .send({ ...base, title: 'Weekend guide', status: 'scheduled', publishAt });

    expect(created.statusCode).toBe(201);
    const record = created.body.data ?? created.body;
    expect(record).toMatchObject({ status: 'scheduled', publishAt });

    const drafted = await request(app).patch(`/api/v1/admin/articles/${record.id}`).set('Cookie', adminCookie)
      .send({ status: 'draft', publishAt: null });
    expect(drafted.statusCode).toBe(200);
    expect(drafted.body.data ?? drafted.body).toMatchObject({ status: 'draft', publishAt: null });
  });
});
