import { jest } from '@jest/globals';
import request from 'supertest';
import { app } from '../src/app.js';
import { User, StaffMember } from '../src/models/User.js';
import { Opportunity } from '../src/models/Platform.js';
import { signAdminToken } from '../src/middleware/auth.js';
import { moveListingImages } from '../src/lib/listing-images.js';

// Listing images are uploaded and stored as links (found under GOD-T95). The admin form used to send the picked picture
// as base64 text inside the listing: production's one published listing weighed about 1.1 MB, in every API response
// and in every push to the website. ALL DATA IS FAKE.

const api = (path) => `/api/v1${path}`;
// A real 1x1 PNG, as bytes and as the data: URL the old form saved.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const PNG_DATA_URL = `data:image/png;base64,${PNG.toString('base64')}`;
// The start of an AVIF file: a type the server does not store (SEC-013 keeps PNG, JPEG and WebP).
const AVIF_DATA_URL = 'data:image/avif;base64,AAAAHGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZg==';
const LINK = 'https://api.test/uploads/kredibble/admin/listing-image/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png';

const listing = (overrides = {}) => ({
  title: 'Test Fellowship 2027',
  type: 'fellowship',
  company: 'Test Foundation',
  organisation: 'Test Foundation',
  location: 'Online',
  country: 'Ghana',
  description: 'A fellowship made in a test.',
  ...overrides,
});

let cookie;
beforeEach(async () => {
  const admin = await User.create({ name: 'Test Root Admin', email: `images-${Date.now()}@example.com`, role: 'admin', passwordHash: 'x' });
  cookie = ['Cookie', `kredibble_admin_token=${signAdminToken(admin)}`];
});

describe('Listing images: the admin API stores links, never the picture itself', () => {
  it('a new listing with a picture in a data: URL is refused, with a reason; with a link it is saved', async () => {
    for (const field of ['logoUrl', 'organizationLogo', 'imageUrl', 'coverImage']) {
      const refused = await request(app).post(api('/admin/opportunities')).set(...cookie).send(listing({ [field]: PNG_DATA_URL }));
      expect(refused.status).toBe(400);
      expect(JSON.stringify(refused.body)).toMatch(/upload the image/i);
    }
    const refusedList = await request(app).post(api('/admin/opportunities')).set(...cookie).send(listing({ images: [LINK, PNG_DATA_URL] }));
    expect(refusedList.status).toBe(400);

    const saved = await request(app).post(api('/admin/opportunities')).set(...cookie).send(listing({ imageUrl: LINK, logoUrl: LINK }));
    expect(saved.status).toBe(201);
    expect(saved.body.data.imageUrl).toBe(LINK);
    expect(await Opportunity.countDocuments()).toBe(1);
  });

  it('an edit that puts a data: URL in an image field is refused and changes nothing', async () => {
    const created = await request(app).post(api('/admin/opportunities')).set(...cookie).send(listing({ imageUrl: LINK }));
    const id = created.body.data.id;
    const refused = await request(app).patch(api(`/admin/opportunities/${id}`)).set(...cookie).send({ coverImage: PNG_DATA_URL });
    expect(refused.status).toBe(400);
    expect((await Opportunity.findById(id).lean()).coverImage).not.toMatch(/^data:/);
  });

  it('the upload route takes listing images into their own folder, for staff who can edit listings', async () => {
    const upload = (cookiePair) =>
      request(app).post(api('/admin/upload?purpose=listing-image')).set(...cookiePair).attach('file', PNG, { filename: 'cover.png', contentType: 'image/png' });
    const res = await upload(cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.url).toMatch(/\/kredibble\/admin\/listing-image\/[a-f0-9]{32}\.png$/);

    const staffCookie = async (roles) => {
      const user = await User.create({ name: `Test ${roles[0]}`, email: `images-${roles[0]}-${Date.now()}@example.com`, role: 'admin', passwordHash: 'x' });
      await StaffMember.create({ userId: user._id, name: user.name, email: user.email, roles, status: 'active' });
      return ['Cookie', `kredibble_admin_token=${signAdminToken(user)}`];
    };
    expect((await upload(await staffCookie(['opportunities_officer']))).status).toBe(200);
    expect((await upload(await staffCookie(['training_officer']))).status).toBe(403);
  });
});

describe('Listing images: moving pictures saved before this change', () => {
  const store = () => jest.fn(async (buffer, folder) => ({ secure_url: `https://api.test/uploads/${folder}/${'b'.repeat(32)}.png`, bytes: buffer.length }));

  it('a dry run reports what it would move and changes nothing', async () => {
    const saved = await Opportunity.create(listing({ logoUrl: PNG_DATA_URL, organizationLogo: PNG_DATA_URL, imageUrl: LINK }));
    const upload = store();
    const summary = await moveListingImages({ write: false, store: upload });
    expect(upload).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ write: false, listings: 1, moved: 2, skipped: [] });
    expect((await Opportunity.findById(saved._id).lean()).logoUrl).toBe(PNG_DATA_URL);
  });

  it('a write stores each picture once, puts its link in every field that held it, and leaves types it cannot store', async () => {
    const saved = await Opportunity.create(listing({
      logoUrl: PNG_DATA_URL,
      organizationLogo: PNG_DATA_URL,
      imageUrl: AVIF_DATA_URL,
      coverImage: AVIF_DATA_URL,
      images: [LINK, PNG_DATA_URL],
    }));
    const untouched = await Opportunity.create(listing({ title: 'Test Listing With Links', imageUrl: LINK }));
    const upload = store();

    const summary = await moveListingImages({ write: true, store: upload });

    expect(upload).toHaveBeenCalledTimes(1); // the same PNG in three places is stored once
    expect(upload.mock.calls[0][1]).toBe('kredibble/admin/listing-image');
    const after = await Opportunity.findById(saved._id).lean();
    const link = `https://api.test/uploads/kredibble/admin/listing-image/${'b'.repeat(32)}.png`;
    expect(after.logoUrl).toBe(link);
    expect(after.organizationLogo).toBe(link);
    expect(after.images).toEqual([LINK, link]);
    // AVIF cannot be stored by the server: reported for a person to pick again in the admin (the browser converts it).
    expect(after.imageUrl).toBe(AVIF_DATA_URL);
    expect(summary.skipped).toEqual([
      expect.objectContaining({ id: String(saved._id), field: 'imageUrl', type: 'image/avif' }),
      expect.objectContaining({ id: String(saved._id), field: 'coverImage', type: 'image/avif' }),
    ]);
    expect(summary).toMatchObject({ write: true, listings: 1, moved: 3 });
    expect((await Opportunity.findById(untouched._id).lean()).updatedAt).toEqual(untouched.updatedAt);
  });
});
