import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../src/app.js';
import { User, StaffMember, AuditLog } from '../src/models/User.js';
import { Ambassador, ShowcaseCategory, ShowcaseEntry } from '../src/models/AdminPortal.js';
import { signToken, signAdminToken } from '../src/middleware/auth.js';
import { ROLE_IDS } from '../src/lib/permissions.js';
import { canEditCategory, ensureBuiltInCategories, normaliseText, showcaseAccessFor } from '../src/lib/showcase.js';

// BE-030: Showcase ("Meet our people"). ALL DATA IS FAKE.

const api = (path) => `/api/v1${path}`;
const cookieHeader = (user) => ['Cookie', `kredibble_admin_token=${signAdminToken(user)}`];
const BUILT_IN = ['ambassadors', 'team', 'partners', 'stakeholders'];
const EDIT_EVERY_CATEGORY = ['super_admin', 'desk_lead', 'communications_officer'];
const EDIT_ONE_CATEGORY = { country_lead: 'ambassadors', partnerships_officer: 'partners' };

let emailCounter = 0;
const makeUser = async (role = 'admin') => {
  emailCounter += 1;
  const email = `be030-${emailCounter}@example.com`;
  return User.create({ name: `Test Person ${emailCounter}`, email, emailNormalized: email, role, emailVerified: true, passwordHash: 'x' });
};

/** An admin session; with roles, a staff record too (no roles = the CLI root admin). */
const makeCaller = async (roles, status = 'active') => {
  const user = await makeUser();
  if (roles) {
    await StaffMember.create({ userId: user._id, name: user.name, email: user.email, roles, role: roles[0], status, joinedDate: '2026-10-17' });
  }
  return { user, cookie: cookieHeader(user) };
};

const as = (caller) => ({
  get: (path) => request(app).get(api(`/admin/showcase${path}`)).set(...caller.cookie),
  post: (path, body) => request(app).post(api(`/admin/showcase${path}`)).set(...caller.cookie).send(body),
  patch: (path, body) => request(app).patch(api(`/admin/showcase${path}`)).set(...caller.cookie).send(body),
  delete: (path) => request(app).delete(api(`/admin/showcase${path}`)).set(...caller.cookie),
});

/** The message of a refused request (the error handler sends { error: { message } }). */
const errorText = (response) => response.body.error?.message ?? '';

const categoryByKey = async (key) => ShowcaseCategory.findOne({ key }).lean();
const categoryId = async (key) => String((await categoryByKey(key))._id);

const addEntry = async (caller, key, overrides = {}) =>
  as(caller).post('/entries', { categoryId: await categoryId(key), name: 'Test Ama Mensah', title: 'Campus Lead', ...overrides });

const appRead = async () => {
  const seeker = await makeUser('seeker');
  return request(app).get(api('/showcase')).set('Authorization', `Bearer ${signToken(seeker)}`);
};

const auditActions = async () => (await AuditLog.find({ action: /^showcase\./ }).sort({ createdAt: 1, _id: 1 }).lean()).map((row) => row.action);

beforeEach(async () => {
  await ensureBuiltInCategories();
});

describe('BE-030 rules', () => {
  it('normalises names the way the admin form does', () => {
    expect(normaliseText('  Test   Ama \n Mensah ')).toBe('Test Ama Mensah');
  });

  it('gives each role the access the BE-001 matrix says', () => {
    for (const role of ROLE_IDS) {
      const access = showcaseAccessFor([role]);
      for (const key of [...BUILT_IN, 'custom']) {
        const expected = EDIT_EVERY_CATEGORY.includes(role) || EDIT_ONE_CATEGORY[role] === key;
        expect({ role, key, allowed: canEditCategory(access, { key }) }).toEqual({ role, key, allowed: expected });
      }
      expect({ role, manage: access.manage }).toEqual({ role, manage: ['super_admin', 'desk_lead'].includes(role) });
      expect({ role, view: access.view }).toEqual({ role, view: EDIT_EVERY_CATEGORY.includes(role) || role in EDIT_ONE_CATEGORY });
    }
  });

  it('seeds the four built-in categories once, in order', async () => {
    await ensureBuiltInCategories();
    const categories = await ShowcaseCategory.find().sort({ order: 1 }).lean();
    expect(categories.map((category) => [category.key, category.name, category.kind, category.order])).toEqual([
      ['ambassadors', 'Ambassadors', 'person', 1],
      ['team', 'Team', 'person', 2],
      ['partners', 'Partners', 'organisation', 3],
      ['stakeholders', 'Stakeholders', 'person', 4],
    ]);
  });
});

describe('BE-030 access: every role against every category', () => {
  const callers = [
    ...ROLE_IDS.map((role) => ({ label: role, make: () => makeCaller([role]), editable: EDIT_EVERY_CATEGORY.includes(role) ? [...BUILT_IN, 'custom'] : EDIT_ONE_CATEGORY[role] ? [EDIT_ONE_CATEGORY[role]] : [] })),
    { label: 'root admin (no staff record)', make: () => makeCaller(null), editable: [...BUILT_IN, 'custom'] },
    { label: 'suspended super_admin', make: () => makeCaller(['super_admin'], 'suspended'), editable: [] },
  ];

  it.each(callers)('$label', async ({ make, editable }) => {
    const root = await makeCaller(null);
    const developers = await as(root).post('/categories', { name: 'Developers', kind: 'person' });
    expect(developers.status).toBe(201);
    const caller = await make();
    const canView = editable.length > 0;
    expect((await as(caller).get('/')).status).toBe(canView ? 200 : 403);

    for (const key of [...BUILT_IN, 'custom']) {
      const target = key === 'custom' ? developers.body.data.id : await categoryId(key);
      const seeded = await ShowcaseEntry.create({ categoryId: target, name: `Seeded ${key}`, title: 'Tester', order: 1 });
      const allowed = editable.includes(key);
      const expected = allowed ? 201 : 403;
      const added = await as(caller).post('/entries', { categoryId: target, name: `Test ${key}`, title: 'Tester' });
      expect({ key, status: added.status }).toEqual({ key, status: expected });
      const edited = await as(caller).patch(`/entries/${seeded._id}`, { title: 'Changed' });
      expect({ key, status: edited.status }).toEqual({ key, status: allowed ? 200 : 403 });
      const hidden = await as(caller).post(`/entries/${seeded._id}/visibility`, { visible: false });
      expect({ key, status: hidden.status }).toEqual({ key, status: allowed ? 200 : 403 });
      const removed = await as(caller).delete(`/entries/${seeded._id}`);
      expect({ key, status: removed.status }).toEqual({ key, status: allowed ? 204 : 403 });
    }
  });

  it('only Super Admin, Desk Lead and the root admin change categories', async () => {
    for (const role of ROLE_IDS) {
      const caller = await makeCaller([role]);
      const response = await as(caller).post('/categories', { name: `Category ${role}`, kind: 'person' });
      expect({ role, status: response.status }).toEqual({ role, status: ['super_admin', 'desk_lead'].includes(role) ? 201 : 403 });
    }
    const team = await categoryId('team');
    const comms = await makeCaller(['communications_officer']);
    expect((await as(comms).patch(`/categories/${team}`, { visible: false })).status).toBe(403);
    expect((await as(comms).post(`/categories/${team}/move`, { direction: 'down' })).status).toBe(403);
  });

  it('a Country Lead cannot move an Ambassadors entry into Partners, and nothing changes', async () => {
    const lead = await makeCaller(['country_lead']);
    const added = await addEntry(lead, 'ambassadors');
    expect(added.status).toBe(201);
    const partners = await categoryId('partners');
    const moved = await as(lead).patch(`/entries/${added.body.data.id}`, { categoryId: partners, title: 'Should not save' });
    expect(moved.status).toBe(403);
    const entry = await ShowcaseEntry.findById(added.body.data.id).lean();
    expect(String(entry.categoryId)).toBe(await categoryId('ambassadors'));
    expect(entry.title).toBe('Campus Lead');
  });

  it('roles come from the session, never the body', async () => {
    const lead = await makeCaller(['country_lead']);
    const response = await as(lead).post('/entries', { categoryId: await categoryId('team'), name: 'Test Person', title: 'Tester', roles: ['super_admin'] });
    expect(response.status).toBe(400); // unknown field refused by the strict schema
    const plain = await as(lead).post('/entries', { categoryId: await categoryId('team'), name: 'Test Person', title: 'Tester' });
    expect(plain.status).toBe(403);
  });

  it('an app user session cannot reach the admin routes', async () => {
    const seeker = await makeUser('seeker');
    const response = await request(app).get(api('/admin/showcase')).set('Authorization', `Bearer ${signToken(seeker)}`);
    expect([401, 403]).toContain(response.status);
  });
});

describe('BE-030 entries', () => {
  it('adds with normalised text, last in its category, and validates like the form', async () => {
    const admin = await makeCaller(['super_admin']);
    const first = await addEntry(admin, 'team', { name: '  Test   Kofi  ', title: ' Designer ', providedBy: ' Sent by email ' });
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ name: 'Test Kofi', title: 'Designer', providedBy: 'Sent by email', order: 1, visible: true });
    const second = await addEntry(admin, 'team', { name: 'Test Abena', visible: false });
    expect(second.body.data).toMatchObject({ order: 2, visible: false });

    const bad = async (body, message) => {
      const response = await addEntry(admin, 'team', body);
      expect(response.status).toBe(400);
      expect(errorText(response)).toMatch(message);
    };
    await bad({ name: '   ' }, /Enter the name/);
    await bad({ name: 'x'.repeat(81) }, /80 characters/);
    await bad({ title: '' }, /role or what they do/);
    await bad({ bio: 'x'.repeat(401) }, /limit is 400/);
    await bad({ providedBy: 'x'.repeat(121) }, /120 characters/);
    await bad({ photoUrl: 'data:image/png;base64,AAAA' }, /https link/);
    await bad({ photoUrl: 'javascript:alert(1)' }, /https link/);
    await bad({ photoUrl: 'http://example.com/a.png' }, /https link/);
    expect((await addEntry(admin, 'team', { name: 'Test With Photo', photoUrl: 'https://res.cloudinary.com/test/image/upload/kredibble/admin/showcase-photo/a.png' })).status).toBe(201);
    expect((await as(admin).post('/entries', { categoryId: new mongoose.Types.ObjectId().toString(), name: 'Test', title: 'Tester' })).status).toBe(400);
  });

  it('links an ambassador once: a second entry for the same person is refused', async () => {
    const admin = await makeCaller(['super_admin']);
    const ambassador = await Ambassador.create({
      fullName: 'Test Ambassador One', email: 'amb-one@example.com', phone: '0200000001', country: 'Ghana', city: 'Accra',
      tier: 'ambassador', status: 'active', joinedAt: '2026-01-01', createdBy: new mongoose.Types.ObjectId(),
    });
    const linked = await addEntry(admin, 'ambassadors', { linkedAmbassadorId: String(ambassador._id) });
    expect(linked.status).toBe(201);
    expect(linked.body.data.linkedAmbassadorId).toBe(String(ambassador._id));
    expect((await addEntry(admin, 'team', { linkedAmbassadorId: String(ambassador._id) })).status).toBe(409);
    expect((await addEntry(admin, 'ambassadors', { linkedAmbassadorId: new mongoose.Types.ObjectId().toString() })).status).toBe(400);
  });

  it('reorders 1..n inside a category, refuses to go past either end, and renumbers after delete and move', async () => {
    const admin = await makeCaller(['super_admin']);
    const ids = [];
    for (const name of ['Test A', 'Test B', 'Test C']) ids.push((await addEntry(admin, 'team', { name })).body.data.id);
    const order = async (key) => (await ShowcaseEntry.find({ categoryId: await categoryId(key) }).sort({ order: 1 }).lean()).map((entry) => [entry.name, entry.order]);

    expect((await as(admin).post(`/entries/${ids[2]}/move`, { direction: 'up' })).body.data).toEqual({ from: 3, to: 2 });
    expect(await order('team')).toEqual([['Test A', 1], ['Test C', 2], ['Test B', 3]]);
    const top = await as(admin).post(`/entries/${ids[0]}/move`, { direction: 'up' });
    expect(top.status).toBe(409);
    expect(errorText(top)).toMatch(/already first/);
    expect((await as(admin).post(`/entries/${ids[1]}/move`, { direction: 'down' })).status).toBe(409);

    expect((await as(admin).delete(`/entries/${ids[2]}`)).status).toBe(204);
    expect(await order('team')).toEqual([['Test A', 1], ['Test B', 2]]);

    await addEntry(admin, 'stakeholders', { name: 'Test S' });
    const moved = await as(admin).patch(`/entries/${ids[0]}`, { categoryId: await categoryId('stakeholders') });
    expect(moved.status).toBe(200);
    expect(moved.body.data.order).toBe(2);
    expect(await order('team')).toEqual([['Test B', 1]]);
    expect(await order('stakeholders')).toEqual([['Test S', 1], ['Test A', 2]]);
  });

  it('an edit that changes nothing writes no audit row', async () => {
    const admin = await makeCaller(['super_admin']);
    const added = await addEntry(admin, 'team');
    const same = await as(admin).patch(`/entries/${added.body.data.id}`, { name: ' Test  Ama Mensah ' });
    expect(same.status).toBe(200);
    expect(await auditActions()).toEqual(['showcase.add']);
  });

  it('a missing entry is 404 and a bad id is 400', async () => {
    const admin = await makeCaller(['super_admin']);
    expect((await as(admin).patch(`/entries/${new mongoose.Types.ObjectId()}`, { title: 'X' })).status).toBe(404);
    expect((await as(admin).delete('/entries/not-an-id')).status).toBe(400);
  });
});

describe('BE-030 categories', () => {
  it('adds a unique custom category, renames it, and refuses duplicates whatever the capitals', async () => {
    const admin = await makeCaller(['desk_lead']);
    const added = await as(admin).post('/categories', { name: '  Developers ', kind: 'person' });
    expect(added.status).toBe(201);
    expect(added.body.data).toMatchObject({ key: 'custom', name: 'Developers', order: 5, visible: true });
    expect((await as(admin).post('/categories', { name: 'developers', kind: 'person' })).status).toBe(409);
    expect((await as(admin).post('/categories', { name: 'TEAM', kind: 'person' })).status).toBe(409);
    expect((await as(admin).post('/categories', { name: 'x'.repeat(41), kind: 'person' })).status).toBe(400);
    expect((await as(admin).post('/categories', { name: 'Robots', kind: 'robot' })).status).toBe(400);

    const id = added.body.data.id;
    expect((await as(admin).patch(`/categories/${id}`, { name: 'Partners' })).status).toBe(409);
    expect((await as(admin).patch(`/categories/${id}`, { name: 'developers' })).body.data.name).toBe('developers');
    expect((await as(admin).patch(`/categories/${id}`, { kind: 'organisation' })).body.data.kind).toBe('organisation');
    expect((await as(admin).patch(`/categories/${await categoryId('team')}`, { kind: 'organisation' })).status).toBe(400);
  });

  it('never deletes a built-in category or one with entries; an empty custom one goes and the rest renumber', async () => {
    const admin = await makeCaller(['super_admin']);
    const team = await as(admin).delete(`/categories/${await categoryId('team')}`);
    expect(team.status).toBe(409);
    expect(errorText(team)).toMatch(/built-in/);

    const developers = (await as(admin).post('/categories', { name: 'Developers', kind: 'person' })).body.data.id;
    const designers = (await as(admin).post('/categories', { name: 'Designers', kind: 'person' })).body.data.id;
    const entry = await as(admin).post('/entries', { categoryId: developers, name: 'Test Developer', title: 'Developer' });
    const full = await as(admin).delete(`/categories/${developers}`);
    expect(full.status).toBe(409);
    expect(errorText(full)).toMatch(/Move or delete its 1 entry first/);

    await as(admin).delete(`/entries/${entry.body.data.id}`);
    expect((await as(admin).delete(`/categories/${developers}`)).status).toBe(204);
    expect((await ShowcaseCategory.findById(designers).lean()).order).toBe(5);
  });

  it('moves categories and keeps 1..n', async () => {
    const admin = await makeCaller(['super_admin']);
    const partners = await categoryId('partners');
    expect((await as(admin).post(`/categories/${partners}/move`, { direction: 'up' })).body.data).toEqual({ from: 3, to: 2 });
    const keys = (await ShowcaseCategory.find().sort({ order: 1 }).lean()).map((category) => [category.key, category.order]);
    expect(keys).toEqual([['ambassadors', 1], ['partners', 2], ['team', 3], ['stakeholders', 4]]);
    expect((await as(admin).post(`/categories/${await categoryId('ambassadors')}/move`, { direction: 'up' })).status).toBe(409);
  });
});

describe('BE-030 app read', () => {
  it('needs a signed-in user', async () => {
    expect((await request(app).get(api('/showcase'))).status).toBe(401);
  });

  it('shows only visible entries in visible categories, in order, leaves empty categories out, and never sends providedBy', async () => {
    const admin = await makeCaller(['super_admin']);
    await addEntry(admin, 'team', { name: 'Test Shown Two', providedBy: 'Secret note from the desk' });
    await addEntry(admin, 'team', { name: 'Test Hidden', visible: false, providedBy: 'Secret note from the desk' });
    const first = await addEntry(admin, 'team', { name: 'Test Shown One' });
    await as(admin).post(`/entries/${first.body.data.id}/move`, { direction: 'up' });
    await as(admin).post(`/entries/${first.body.data.id}/move`, { direction: 'up' });
    await addEntry(admin, 'partners', { name: 'Test Partner Org', title: 'Funds trips' });
    await addEntry(admin, 'stakeholders', { name: 'Test In Hidden Category' });
    await as(admin).patch(`/categories/${await categoryId('stakeholders')}`, { visible: false });

    const response = await appRead();
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-cache');
    const { categories, entries } = response.body.data;
    expect(categories.map((category) => category.key)).toEqual(['team', 'partners']); // ambassadors empty, stakeholders hidden
    expect(categories[0]).toEqual({ id: expect.any(String), key: 'team', name: 'Team', kind: 'person', order: 2, visible: true });
    expect(entries.map((entry) => entry.name)).toEqual(['Test Shown One', 'Test Shown Two', 'Test Partner Org']);
    expect(JSON.stringify(response.body)).not.toMatch(/providedBy|Secret note|linkedAmbassadorId|createdBy/);
    expect(Object.keys(entries[0]).sort()).toEqual(['bio', 'categoryId', 'id', 'name', 'order', 'title', 'visible']);
  });

  it('a hidden entry disappears from the very next read', async () => {
    const admin = await makeCaller(['super_admin']);
    const added = await addEntry(admin, 'team', { name: 'Test Soon Hidden' });
    expect((await appRead()).body.data.entries).toHaveLength(1);
    await as(admin).post(`/entries/${added.body.data.id}/visibility`, { visible: false });
    expect((await appRead()).body.data).toEqual({ categories: [], entries: [] });
  });
});

describe('BE-030 audit', () => {
  it('writes one row per change, with who and what, and the History route reads them newest first', async () => {
    const admin = await makeCaller(['super_admin']);
    const added = await addEntry(admin, 'team', { name: 'Test History' });
    const id = added.body.data.id;
    await addEntry(admin, 'team', { name: 'Test Other' });
    await as(admin).patch(`/entries/${id}`, { title: 'New role', photoUrl: 'https://res.cloudinary.com/test/image/upload/kredibble/admin/showcase-photo/b.png' });
    await as(admin).post(`/entries/${id}/visibility`, { visible: false });
    await as(admin).post(`/entries/${id}/visibility`, { visible: true });
    await as(admin).post(`/entries/${id}/move`, { direction: 'down' });
    await as(admin).delete(`/entries/${id}`);
    const category = (await as(admin).post('/categories', { name: 'Developers', kind: 'person' })).body.data.id;
    await as(admin).patch(`/categories/${category}`, { visible: false });
    await as(admin).post(`/categories/${category}/move`, { direction: 'up' });
    await as(admin).delete(`/categories/${category}`);

    expect(await auditActions()).toEqual([
      'showcase.add', 'showcase.add', 'showcase.edit', 'showcase.hide', 'showcase.show', 'showcase.move', 'showcase.delete',
      'showcase.category_add', 'showcase.category_edit', 'showcase.category_move', 'showcase.category_delete',
    ]);
    const edit = await AuditLog.findOne({ action: 'showcase.edit' }).lean();
    expect(String(edit.actorId)).toBe(String(admin.user._id));
    expect(edit.metadata).toMatchObject({ entry: 'Test History', category: 'Team', changed: ['title'], photo: 'added' });
    const hide = await AuditLog.findOne({ action: 'showcase.hide' }).lean();
    expect(hide.metadata).toMatchObject({ from: 'Visible', to: 'Hidden' });

    const history = await as(admin).get('/history');
    expect(history.status).toBe(200);
    expect(history.body.data).toHaveLength(11);
    expect(history.body.data[0]).toMatchObject({ action: 'showcase.category_delete', actorName: admin.user.name, outcome: 'success' });
    expect(history.body.data[0].metadata.summary).toBe('Deleted the category Developers');

    const lead = await makeCaller(['country_lead']);
    expect((await as(lead).get('/history')).status).toBe(200);
    const support = await makeCaller(['support']);
    expect((await as(support).get('/history')).status).toBe(403);
  });

  it('a refused change writes nothing', async () => {
    const lead = await makeCaller(['country_lead']);
    await as(lead).post('/entries', { categoryId: await categoryId('team'), name: 'Test Refused', title: 'Tester' });
    await as(lead).post('/categories', { name: 'Refused', kind: 'person' });
    expect(await auditActions()).toEqual([]);
    expect(await ShowcaseEntry.countDocuments()).toBe(0);
  });
});
