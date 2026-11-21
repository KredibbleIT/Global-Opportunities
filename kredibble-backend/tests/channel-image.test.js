import request from 'supertest';
import { app } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Channel } from '../src/models/Community.js';
import { signToken, signAdminToken } from '../src/middleware/auth.js';

// A hirer or an admin adds a picture when creating a channel, and the channel list shows it. ALL DATA IS FAKE.

const api = (route) => `/api/v1${route}`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

describe('channel picture', () => {
  let hirer;
  let other;
  let admin;
  const bearer = (person) => ['Authorization', `Bearer ${signToken(person)}`];
  const adminCookie = () => ['Cookie', `kredibble_admin_token=${signAdminToken(admin)}`];

  beforeEach(async () => {
    const stamp = Date.now();
    hirer = await User.create({ name: 'Test Hirer', email: `chimg-hirer-${stamp}@example.com`, role: 'hirer', passwordHash: 'x' });
    other = await User.create({ name: 'Test Other', email: `chimg-other-${stamp}@example.com`, role: 'hirer', passwordHash: 'x' });
    admin = await User.create({ name: 'Test Admin', email: `chimg-admin-${stamp}@example.com`, role: 'admin', passwordHash: 'x' });
  });

  const uploadFor = async (person) =>
    (await request(app).post(api('/upload?purpose=channel-avatars')).set(...bearer(person)).attach('file', PNG, { filename: 'c.png', contentType: 'image/png' }).expect(200)).body.data;
  const createAs = (person, body) => request(app).post(api('/community/channels')).set(...bearer(person)).send({ name: 'Test Image Circle', category: 'Tech', bio: 'About', ...body });

  it('saves the picture a hirer uploaded, and the channel list shows it', async () => {
    const picture = await uploadFor(hirer);
    const res = await createAs(hirer, { avatar: picture.url }).expect(201);
    expect(res.body.data.avatar).toBe(picture.url);
    const list = await request(app).get(api('/community/channels')).set(...bearer(hirer)).expect(200);
    expect(list.body.data.find((channel) => channel.id === res.body.data.id).avatar).toBe(picture.url);
  });

  it('still creates a channel without a picture', async () => {
    const res = await createAs(hirer, {}).expect(201);
    expect(res.body.data.avatar).toBeUndefined();
  });

  it('refuses a link to another site, or a picture someone else uploaded', async () => {
    await createAs(hirer, { avatar: 'https://example.com/not-ours.png' }).expect(400);
    const theirs = await uploadFor(other);
    await createAs(hirer, { avatar: theirs.url }).expect(400);
    expect(await Channel.countDocuments({ name: 'Test Image Circle' })).toBe(0);
  });

  it('lets the channel\'s admin change the picture, and refuses a link to another site', async () => {
    const first = await uploadFor(hirer);
    const created = (await createAs(hirer, { avatar: first.url }).expect(201)).body.data;
    const second = await uploadFor(hirer);
    const updated = await request(app).patch(api(`/community/channels/${created.id}`)).set(...bearer(hirer)).send({ avatar: second.url }).expect(200);
    expect(updated.body.data.avatar).toBe(second.url);
    await request(app).patch(api(`/community/channels/${created.id}`)).set(...bearer(hirer)).send({ avatar: 'https://example.com/x.png' }).expect(400);
  });

  it('an admin adds a picture when creating a channel in the dashboard', async () => {
    const up = await request(app).post(api('/admin/upload?purpose=channel-avatar')).set(...adminCookie()).attach('file', PNG, { filename: 'c.png', contentType: 'image/png' }).expect(200);
    const res = await request(app).post(api('/admin/channels')).set(...adminCookie()).send({ name: 'Test Admin Circle', visibility: 'public', avatar: up.body.data.url }).expect(201);
    expect(res.body.data.avatar).toBe(up.body.data.url);
    await request(app).post(api('/admin/channels')).set(...adminCookie()).send({ name: 'Test Bad Circle', avatar: 'https://example.com/x.png' }).expect(400);
  });
});
