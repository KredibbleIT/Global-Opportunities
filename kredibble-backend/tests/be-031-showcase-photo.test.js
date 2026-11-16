import { jest } from '@jest/globals';
import request from 'supertest';
import { app } from '../src/app.js';
import { User } from '../src/models/User.js';
import { ShowcaseCategory, ShowcaseEntry } from '../src/models/AdminPortal.js';
import { signAdminToken } from '../src/middleware/auth.js';
import { ensureBuiltInCategories } from '../src/lib/showcase.js';
import { deliveryUrl, parseOwnPicture, pictureStore } from '../src/lib/showcase-photos.js';

// BE-031: Showcase pictures. Uploads are saved to a temporary folder (lib/storage.js) and deletes go to a stub.
// ALL DATA IS FAKE.

const api = (path) => `/api/v1${path}`;
const BASE = 'https://api.test/uploads';
// Stored names are 32 random hex characters.
const hex = (name) => name.padEnd(32, '0').slice(0, 32).replace(/[^a-f0-9]/g, 'a');
const OWN = (name) => `${BASE}/kredibble/admin/showcase-photo/${hex(name)}.png`;
const AMBASSADOR = `${BASE}/ambassadors/${hex('ab')}.jpg`;
// A real 1x1 PNG, and the start of a Windows executable.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 0)]);

let destroy;
let admin;
let cookie;

beforeEach(async () => {
  await ensureBuiltInCategories();
  destroy = jest.fn().mockResolvedValue({ result: 'ok' });
  pictureStore.destroy = destroy;
  admin = await User.create({ name: 'Test Root Admin', email: `be031-${Date.now()}@example.com`, role: 'admin', passwordHash: 'x' });
  cookie = ['Cookie', `kredibble_admin_token=${signAdminToken(admin)}`];
});

const categoryId = async (key) => String((await ShowcaseCategory.findOne({ key }).lean())._id);
const addEntry = async (key, photoUrl, name = 'Test Person') =>
  request(app).post(api('/admin/showcase/entries')).set(...cookie).send({ categoryId: await categoryId(key), name, title: 'Tester', photoUrl });
const upload = (buffer, filename, contentType) =>
  request(app).post(api('/admin/upload?purpose=showcase-photo')).set(...cookie).attach('file', buffer, { filename, contentType });

describe('BE-031 upload: only real images, 5 MB at most', () => {
  it('stores a real picture in the Showcase folder and returns an https URL', async () => {
    const res = await upload(PNG, 'face.png', 'image/png');
    expect(res.status).toBe(200);
    expect(res.body.data.url).toMatch(/^https:\/\/api\.test\/uploads\/kredibble\/admin\/showcase-photo\/[a-f0-9]{32}\.png$/);
  });

  it('lets the editor of any one category upload (SEC-132 screen check), and nobody without Showcase edit', async () => {
    const { StaffMember } = await import('../src/models/User.js');
    const staffCookie = async (roles) => {
      const user = await User.create({ name: `Test ${roles[0]}`, email: `be031-${roles[0]}-${Date.now()}@example.com`, role: 'admin', passwordHash: 'x' });
      await StaffMember.create({ userId: user._id, name: user.name, email: user.email, roles, status: 'active' });
      return ['Cookie', `kredibble_admin_token=${signAdminToken(user)}`];
    };
    const as = async (roles) => request(app).post(api('/admin/upload?purpose=showcase-photo')).set(...(await staffCookie(roles))).attach('file', PNG, { filename: 'face.png', contentType: 'image/png' });
    expect((await as(['country_lead'])).status).toBe(200);
    expect((await as(['partnerships_officer'])).status).toBe(200);
    expect((await as(['communications_officer'])).status).toBe(200);
    expect((await as(['support'])).status).toBe(403);
  });

  it('refuses a text file, a renamed executable and a file over 5 MB', async () => {
    expect((await upload(Buffer.from('hello'), 'notes.txt', 'text/plain')).status).toBe(400);
    expect((await upload(EXE, 'photo.png', 'image/png')).status).toBe(400);
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024 + 1, 0)]);
    expect([400, 413]).toContain((await upload(big, 'big.png', 'image/png')).status);
  });
});

describe('BE-031 picture rules', () => {
  it('accepts our Showcase uploads and stored ambassador pictures only', () => {
    expect(parseOwnPicture(OWN('a'))).toEqual({ publicId: `kredibble/admin/showcase-photo/${hex('a')}`, ownUpload: true });
    expect(parseOwnPicture(AMBASSADOR)).toEqual({ publicId: `ambassadors/${hex('ab')}`, ownUpload: false });
    for (const foreign of [
      'https://example.com/picture.png',
      OWN('a').replace('https:', 'http:'),
      OWN('a').replace('api.test', 'someone-else.test'),
      `${BASE}/kredibble/64b7f1c2a1b2c3d4e5f60718/avatars/${hex('a')}.png`,
      `${BASE}/kredibble/admin/showcase-photo/a.png`,
      `${BASE}/kredibble/admin/showcase-photo/../${hex('a')}.png`,
      `${OWN('a')}?x=1`,
      'not a url',
    ]) {
      expect({ foreign, parsed: parseOwnPicture(foreign) }).toEqual({ foreign, parsed: null });
    }
  });

  it('gives the app the stored picture as it is', () => {
    expect(deliveryUrl(OWN('a'))).toBe(OWN('a'));
    expect(deliveryUrl(undefined)).toBeUndefined();
  });
});

describe('BE-031 entries keep only our pictures, and clean up after themselves', () => {
  it('refuses a picture from anywhere else', async () => {
    for (const photoUrl of ['https://example.com/a.png', OWN('a').replace('https:', 'http:')]) {
      const res = await addEntry('team', photoUrl);
      expect(res.status).toBe(400);
    }
    expect((await addEntry('team', OWN('ok'))).status).toBe(201);
    expect((await addEntry('ambassadors', AMBASSADOR)).status).toBe(201);
  });

  it('deletes the old upload when the picture is replaced or removed, and when the entry is deleted', async () => {
    const id = (await addEntry('team', OWN('first'))).body.data.id;
    await request(app).patch(api(`/admin/showcase/entries/${id}`)).set(...cookie).send({ photoUrl: OWN('second') }).expect(200);
    expect(destroy).toHaveBeenLastCalledWith(`kredibble/admin/showcase-photo/${hex('first')}`);

    await request(app).patch(api(`/admin/showcase/entries/${id}`)).set(...cookie).send({ photoUrl: null }).expect(200);
    expect(destroy).toHaveBeenLastCalledWith(`kredibble/admin/showcase-photo/${hex('second')}`);

    await request(app).patch(api(`/admin/showcase/entries/${id}`)).set(...cookie).send({ photoUrl: OWN('third') }).expect(200);
    await request(app).delete(api(`/admin/showcase/entries/${id}`)).set(...cookie).expect(204);
    expect(destroy).toHaveBeenLastCalledWith(`kredibble/admin/showcase-photo/${hex('third')}`);
    expect(destroy).toHaveBeenCalledTimes(3);
  });

  it('never deletes a borrowed ambassador picture, or one another entry still shows', async () => {
    const borrowed = (await addEntry('ambassadors', AMBASSADOR)).body.data.id;
    await request(app).delete(api(`/admin/showcase/entries/${borrowed}`)).set(...cookie).expect(204);

    const one = (await addEntry('team', OWN('shared'), 'Test One')).body.data.id;
    const two = (await addEntry('team', OWN('shared'), 'Test Two')).body.data.id;
    await request(app).delete(api(`/admin/showcase/entries/${one}`)).set(...cookie).expect(204);
    expect(destroy).not.toHaveBeenCalled();

    await request(app).delete(api(`/admin/showcase/entries/${two}`)).set(...cookie).expect(204);
    expect(destroy).toHaveBeenCalledWith(`kredibble/admin/showcase-photo/${hex('shared')}`);
  });

  it('a failed delete is logged and the change still goes through', async () => {
    pictureStore.destroy = jest.fn().mockRejectedValue(new Error('storage is down'));
    const id = (await addEntry('team', OWN('stuck'))).body.data.id;
    const res = await request(app).delete(api(`/admin/showcase/entries/${id}`)).set(...cookie);
    expect(res.status).toBe(204);
    expect(await ShowcaseEntry.exists({ _id: id })).toBeNull();
  });

  it('the app gets each entry its stored picture', async () => {
    await addEntry('team', OWN('person'), 'Test Person');
    await addEntry('partners', OWN('logo'), 'Test Organisation');
    const seeker = await User.create({ name: 'Test Seeker', email: `be031-seeker-${Date.now()}@example.com`, role: 'seeker', passwordHash: 'x' });
    const { signToken } = await import('../src/middleware/auth.js');
    const res = await request(app).get(api('/showcase')).set('Authorization', `Bearer ${signToken(seeker)}`).expect(200);
    const byName = Object.fromEntries(res.body.data.entries.map((entry) => [entry.name, entry.photoUrl]));
    expect(byName['Test Person']).toBe(OWN('person'));
    expect(byName['Test Organisation']).toBe(OWN('logo'));
  });
});
