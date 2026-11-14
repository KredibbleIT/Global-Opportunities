import request from 'supertest';
import { app } from '../src/app.js';
import { ReferenceDataList } from '../src/models/AdminPortal.js';
import { User } from '../src/models/User.js';
import { signAdminToken, signToken } from '../src/middleware/auth.js';

const api = (path) => `/api/v1${path}`;

/** Someone at registration suggests an entry the list doesn't have. */
const suggest = (key, label) => request(app).post(api(`/reference-data/seeker/${key}/items`)).send({ label }).expect(200);

/** The public view of a list, as the app and website read it. */
const publicList = async (key) => (await request(app).get(api(`/reference-data/seeker/${key}`)).expect(200)).body.data;

describe('GOD-T59: staff review suggested reference-list entries', () => {
  let adminCookie;
  let seekerToken;

  beforeEach(async () => {
    await ReferenceDataList.deleteMany({});
    await User.deleteMany({});
    const admin = await User.create({ name: 'Reference Admin', email: 'reference.admin@example.com', role: 'admin', passwordHash: 'x' });
    adminCookie = `kredibble_admin_token=${signAdminToken(admin)}`;
    const seeker = await User.create({ name: 'A Seeker', email: 'reference.seeker@example.com', role: 'seeker', passwordHash: 'x' });
    seekerToken = signToken(seeker);
  });

  /** Staff decision through the admin API. */
  const review = (key, label, decision) =>
    request(app)
      .post(api(`/admin/reference-data/seeker/${key}/suggestions`))
      .set('Cookie', adminCookie)
      .send({ label, decision });

  /** The review queue of one list, as the admin portal reads it. */
  const pendingFor = async (key) => {
    const res = await request(app).get(api('/admin/reference-data?group=seeker')).set('Cookie', adminCookie).expect(200);
    return res.body.data[0].lists.find((list) => list.key === key).pending;
  };

  it('the admin portal sees the queue with how many people asked', async () => {
    await suggest('universities', 'Academic City University College');
    await suggest('universities', 'academic city university college');

    expect(await pendingFor('universities')).toEqual([
      expect.objectContaining({ label: 'Academic City University College', count: 2 }),
    ]);
  });

  it('approving adds the entry to the public list and empties the queue', async () => {
    await suggest('skills', 'Kubernetes Orchestration');

    const res = await review('skills', 'Kubernetes Orchestration', 'approve').expect(200);
    expect(res.body.data).toEqual(expect.objectContaining({ item: 'Kubernetes Orchestration', decision: 'approve', added: true }));

    expect((await publicList('skills')).items).toContain('Kubernetes Orchestration');
    expect(await pendingFor('skills')).toEqual([]);
    // Approved now, so the next person is pointed at the existing entry.
    expect((await suggest('skills', 'kubernetes orchestration')).body.data.action).toBe('use_existing');
  });

  it('rejecting drops the entry without adding it', async () => {
    await suggest('career-interests', 'Space Policy');

    await review('career-interests', 'Space Policy', 'reject').expect(200);

    expect((await publicList('career-interests')).items).not.toContain('Space Policy');
    expect(await pendingFor('career-interests')).toEqual([]);
  });

  it('a suggestion that is not in the queue is a 404', async () => {
    await review('programs', 'Never Suggested', 'approve').expect(404);
  });

  it('only staff with reference-data access can decide', async () => {
    await suggest('programs', 'Aerospace Navigation Science');
    const res = await request(app)
      .post(api('/admin/reference-data/seeker/programs/suggestions'))
      .set('Authorization', `Bearer ${seekerToken}`)
      .send({ label: 'Aerospace Navigation Science', decision: 'approve' });
    expect([401, 403]).toContain(res.status);
    expect((await publicList('programs')).items).not.toContain('Aerospace Navigation Science');
  });

  it('refuses an unknown decision', async () => {
    await suggest('programs', 'Aerospace Navigation Science');
    await review('programs', 'Aerospace Navigation Science', 'maybe').expect(400);
  });

  it('the public list never shows the queue, aliases or who last edited it', async () => {
    await suggest('programs', 'Aerospace Navigation Science');
    const list = await publicList('programs');
    expect(Object.keys(list).sort()).toEqual(['group', 'items', 'key', 'label', 'singular', 'updatedAt']);
  });

  it('staff adding a suggested entry by hand takes it off the queue', async () => {
    await suggest('programs', 'Aerospace Navigation Science');
    const current = (await publicList('programs')).items;

    await request(app)
      .put(api('/admin/reference-data/seeker/programs'))
      .set('Cookie', adminCookie)
      .send({ items: [...current, 'Aerospace Navigation Science'] })
      .expect(200);

    expect(await pendingFor('programs')).toEqual([]);
  });
});
