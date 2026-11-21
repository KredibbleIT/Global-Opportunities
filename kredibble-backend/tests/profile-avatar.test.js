import fs from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import { app } from '../src/app.js';
import { User } from '../src/models/User.js';
import { signToken } from '../src/middleware/auth.js';
import { uploadRoot, uploadBuffer } from '../src/lib/storage.js';

// A person sets, replaces and removes their own profile picture. ALL DATA IS FAKE.

const api = (route) => `/api/v1${route}`;
// A real 1x1 PNG and a tiny PDF.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const exists = (file) => fs.access(file).then(() => true, () => false);

describe('profile picture', () => {
  let user;
  let other;
  const bearer = (person) => ['Authorization', `Bearer ${signToken(person)}`];

  beforeEach(async () => {
    const stamp = Date.now();
    user = await User.create({ name: 'Test Person', email: `avatar-${stamp}@example.com`, role: 'seeker', passwordHash: 'x' });
    other = await User.create({ name: 'Test Other', email: `avatar-other-${stamp}@example.com`, role: 'seeker', passwordHash: 'x' });
  });

  /** A picture uploaded the way the app does it. */
  const upload = async (person = user) => {
    const res = await request(app).post(api('/upload?purpose=avatars')).set(...bearer(person)).attach('file', PNG, { filename: 'me.png', contentType: 'image/png' }).expect(200);
    return res.body.data;
  };
  const fileOf = (uploaded) => path.join(uploadRoot(), `${uploaded.publicId}.png`);
  const setAvatar = (avatarUrl, person = user) => request(app).patch(api('/users/me/avatar')).set(...bearer(person)).send({ avatarUrl });

  it('saves a picture the person uploaded, and the profile shows it', async () => {
    const picture = await upload();
    const res = await setAvatar(picture.url).expect(200);
    expect(res.body.data).toEqual({ avatarUrl: picture.url });
    const me = await request(app).get(api('/auth/me')).set(...bearer(user)).expect(200);
    expect(me.body.data.avatarUrl).toBe(picture.url);
    expect(await exists(fileOf(picture))).toBe(true);
  });

  it('deletes the old picture when it is replaced, and when it is removed', async () => {
    const first = await upload();
    await setAvatar(first.url).expect(200);
    const second = await upload();
    await setAvatar(second.url).expect(200);
    expect(await exists(fileOf(first))).toBe(false);
    expect(await exists(fileOf(second))).toBe(true);

    const removed = await setAvatar(null).expect(200);
    expect(removed.body.data).toEqual({ avatarUrl: null });
    expect(await exists(fileOf(second))).toBe(false);
    expect((await User.findById(user._id)).avatarUrl).toBeUndefined();
  });

  it('refuses a link to another site, someone else\'s picture, a document and a made-up address', async () => {
    const mine = await upload();
    const theirs = await upload(other);
    const pdf = await uploadBuffer(Buffer.from('%PDF-1.4\n%fake\n'), `kredibble/${user._id}/avatars`).catch(() => null);
    for (const bad of [
      'https://example.com/me.png',
      theirs.url,
      mine.url.replace('.png', '.jpg'),
      `${mine.url}?x=1`,
      'not an address',
    ]) {
      expect((await setAvatar(bad)).status).toBe(400);
    }
    if (pdf) expect((await setAvatar(pdf.secure_url)).status).toBe(400);
    expect((await User.findById(user._id)).avatarUrl).toBeUndefined();
    expect(await exists(fileOf(theirs))).toBe(true); // nothing of theirs was touched
  });

  it('needs a signed-in person and a body with an address or null', async () => {
    await request(app).patch(api('/users/me/avatar')).send({ avatarUrl: null }).expect(401);
    expect((await request(app).patch(api('/users/me/avatar')).set(...bearer(user)).send({})).status).toBe(400);
    expect((await request(app).patch(api('/users/me/avatar')).set(...bearer(user)).send({ avatarUrl: null, role: 'admin' })).status).toBe(400);
  });
});
