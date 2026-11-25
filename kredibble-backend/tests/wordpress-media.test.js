import { jest } from '@jest/globals';

// GOD-T95 follow-up, 25 Nov 2026: Thrive reached the website without a picture, because the GOD Track plugin shows
// images only from WordPress media IDs. The API now uploads a listing's stored logo and cover to /wp-json/wp/v2/media
// first and sends the IDs. These tests store a real file in the test upload folder and stand in for WordPress.
const mockEnv = {
  wordpressSyncBaseUrl: 'https://site.example/wp-json/god/v1/admin',
  wordpressApiKey: 'test-wordpress-key',
  wordpressMediaUser: 'listing-bot',
  wordpressMediaAppPassword: 'abcd efgh ijkl',
  outboundRequestTimeoutMs: 10000,
};
jest.unstable_mockModule('../src/config/env.js', () => ({ env: mockEnv }));

const { uploadBuffer } = await import('../src/lib/storage.js');
const { syncToWordpress } = await import('../src/lib/wordpress-sync.js');
const { ensureListingMedia } = await import('../src/lib/wordpress-media.js');

// A 1×1 PNG.
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c00000000049454e44ae426082', 'hex');

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Stand-in WordPress: media uploads get IDs 900, 901, …; the plugin push answers with post 8539. */
const fakeWordpress = (fetchSpy, { mediaStatus = 201 } = {}) => {
  let nextId = 900;
  fetchSpy.mockImplementation(async (url, options) => {
    if (String(url).endsWith('/wp/v2/media')) {
      return mediaStatus === 201 ? json(201, { id: nextId++ }) : json(mediaStatus, { code: 'rest_cannot_create', message: 'Sorry, you are not allowed to create posts as this user.' });
    }
    if (/\/wp\/v2\/media\/\d+$/.test(String(url))) return json(200, {});
    if (String(url).includes('/god/v1/admin/opportunities')) return json(201, { wordpressId: '8539' });
    throw new Error(`unexpected request ${options?.method} ${url}`);
  });
};

const mediaUploads = (fetchSpy) => fetchSpy.mock.calls.filter(([url]) => String(url).endsWith('/wp/v2/media'));
const pushedRecord = (fetchSpy) => {
  const call = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/god/v1/admin/opportunities')).at(-1);
  return JSON.parse(call[1].body).record;
};

const listing = (fields) => ({
  _id: '6af5df670524048a5126b269',
  title: 'Thrive Capital Summer Fellowship 2027',
  type: 'fellowship',
  company: 'Thrive Capital',
  status: 'published',
  vetted: true,
  wordpressSync: { status: 'pending' },
  save: jest.fn(async () => undefined),
  ...fields,
});

describe('GOD-T95: listing images reach the website as WordPress media IDs', () => {
  let fetchSpy;
  let logo;
  let cover;
  beforeAll(async () => {
    logo = (await uploadBuffer(PNG, 'kredibble/admin/listing-image')).secure_url;
    cover = (await uploadBuffer(PNG, 'kredibble/admin/listing-image')).secure_url;
  });
  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    mockEnv.wordpressMediaUser = 'listing-bot';
    mockEnv.wordpressMediaAppPassword = 'abcd efgh ijkl';
  });
  afterEach(() => fetchSpy.mockRestore());

  it('uploads the stored logo and cover once, sends their IDs, and reuses them on the next sync', async () => {
    fakeWordpress(fetchSpy);
    const document = listing({ logoUrl: logo, organizationLogo: logo, coverImage: cover, imageUrl: cover });

    const first = await syncToWordpress('opportunities', document);

    expect(first).toMatchObject({ status: 'synced', wordpressId: '8539' });
    const uploads = mediaUploads(fetchSpy);
    expect(uploads).toHaveLength(2);
    const [url, options] = uploads[0];
    expect(url).toBe('https://site.example/wp-json/wp/v2/media');
    expect(options.headers.Authorization).toBe(`Basic ${Buffer.from('listing-bot:abcdefghijkl').toString('base64')}`);
    expect(options.headers['Content-Type']).toBe('image/png');
    expect(options.headers['Content-Disposition']).toMatch(/^attachment; filename="[a-f0-9]{32}\.png"$/);
    expect(pushedRecord(fetchSpy)).toMatchObject({ logoId: 900, featuredImageId: 901 });
    expect(document.wordpressSync.media).toMatchObject({ logoUrl: logo, logoId: 900, coverUrl: cover, coverId: 901 });

    fetchSpy.mockClear();
    await syncToWordpress('opportunities', document);
    expect(mediaUploads(fetchSpy)).toHaveLength(0);
    expect(pushedRecord(fetchSpy)).toMatchObject({ logoId: 900, featuredImageId: 901 });
  });

  it('uploads a picture used as both logo and cover only once', async () => {
    fakeWordpress(fetchSpy);
    const ids = await ensureListingMedia(listing({ logoUrl: logo, coverImage: logo }));
    expect(mediaUploads(fetchSpy)).toHaveLength(1);
    expect(ids).toEqual({ logoId: 900, featuredImageId: 900 });
  });

  it('a changed image is uploaded again; a removed one is no longer sent', async () => {
    fakeWordpress(fetchSpy);
    const document = listing({ logoUrl: logo, wordpressSync: { media: { logoUrl: cover, logoId: 555, coverUrl: cover, coverId: 556 } } });

    const ids = await ensureListingMedia(document);

    expect(mediaUploads(fetchSpy)).toHaveLength(1);
    expect(ids).toEqual({ logoId: 900 });
    expect(document.wordpressSync.media.coverId).toBeUndefined();
  });

  it('a refused upload leaves the image out, keeps the error, and the listing still syncs', async () => {
    fakeWordpress(fetchSpy, { mediaStatus: 401 });
    const document = listing({ logoUrl: logo, wordpressSync: { media: { logoUrl: cover, logoId: 555 } } });

    const result = await syncToWordpress('opportunities', document);

    expect(result.status).toBe('synced');
    const record = pushedRecord(fetchSpy);
    expect(record).not.toHaveProperty('logoId'); // never the old picture for a changed image
    expect(document.wordpressSync.media.lastError).toMatch(/not allowed.*WORDPRESS_MEDIA_APP_PASSWORD/);
  });

  it('an image from another site is not fetched or uploaded', async () => {
    fakeWordpress(fetchSpy);
    const document = listing({ logoUrl: 'https://elsewhere.example/logo.png' });

    const ids = await ensureListingMedia(document);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(ids).toEqual({});
    expect(document.wordpressSync.media.lastError).toMatch(/not a file stored by this API/);
  });

  it('without the media user and password, nothing is uploaded and listings sync without images', async () => {
    mockEnv.wordpressMediaAppPassword = '';
    fakeWordpress(fetchSpy);

    const result = await syncToWordpress('opportunities', listing({ logoUrl: logo, coverImage: cover }));

    expect(result.status).toBe('synced');
    expect(mediaUploads(fetchSpy)).toHaveLength(0);
    expect(pushedRecord(fetchSpy)).not.toHaveProperty('featuredImageId');
  });
});
