import { jest } from '@jest/globals';

// GOD-T95: published listings never reached the website. Production had WORDPRESS_SYNC_BASE_URL set to the site's
// REST root (https://globalopportunitydesk.com/wp-json), so every push went to /wp-json/opportunities, which WordPress
// answers "No route was found matching the URL and request method." The plugin's routes live under /god/v1/admin.
// These tests load lib/wordpress-sync.js against a stand-in env and fetch, so nothing reaches a real website.
const mockEnv = {
  wordpressSyncBaseUrl: undefined,
  wordpressApiKey: 'test-wordpress-key',
  outboundRequestTimeoutMs: 10000,
};
jest.unstable_mockModule('../src/config/env.js', () => ({ env: mockEnv }));

const { syncToWordpress, deleteFromWordpress, wordpressAdminBaseUrl } = await import('../src/lib/wordpress-sync.js');

/** A listing as the sync sees it: a plain record whose save is recorded. */
const listing = (wordpressId) => ({
  _id: 'listing-1',
  title: 'Thrive Capital Summer Fellowship 2027',
  wordpressSync: wordpressId ? { wordpressId, status: 'synced' } : { status: 'pending' },
  save: jest.fn(async () => undefined),
});

const jsonResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('GOD-T95: the WordPress base URL reaches the plugin routes', () => {
  let fetchSpy;
  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('the plugin base is used as given, and the REST root or the site address get the plugin path added', () => {
    const admin = 'https://site.example/wp-json/god/v1/admin';
    expect(wordpressAdminBaseUrl('https://site.example/wp-json/god/v1/admin')).toBe(admin);
    expect(wordpressAdminBaseUrl('https://site.example/wp-json/god/v1/admin/')).toBe(admin);
    expect(wordpressAdminBaseUrl('https://site.example/wp-json')).toBe(admin); // production's value on 21 Nov
    expect(wordpressAdminBaseUrl('https://site.example/wp-json/')).toBe(admin);
    expect(wordpressAdminBaseUrl('https://site.example')).toBe(admin);
    expect(wordpressAdminBaseUrl(' https://site.example/ ')).toBe(admin);
    // Any other path is someone's deliberate choice: kept as written.
    expect(wordpressAdminBaseUrl('https://site.example/custom/admin-api')).toBe('https://site.example/custom/admin-api');
  });

  it('with the REST root configured, a new listing is posted to the plugin route and stored as synced', async () => {
    mockEnv.wordpressSyncBaseUrl = 'https://site.example/wp-json';
    fetchSpy.mockResolvedValue(jsonResponse(200, { wordpressId: 8530 }));
    const record = listing();

    const result = await syncToWordpress('opportunities', record);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://site.example/wp-json/god/v1/admin/opportunities');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer test-wordpress-key');
    expect(result).toMatchObject({ status: 'synced', wordpressId: '8530' });
    expect(record.wordpressSync).toMatchObject({ status: 'synced', wordpressId: '8530' });
  });

  it('an update goes to the listing\'s own route, and a delete to the same one', async () => {
    mockEnv.wordpressSyncBaseUrl = 'https://site.example/wp-json';
    fetchSpy.mockResolvedValue(jsonResponse(200, { wordpressId: '8530' }));
    await syncToWordpress('opportunities', listing('8530'));
    await deleteFromWordpress('opportunities', listing('8530'));
    expect(fetchSpy.mock.calls.map(([url, options]) => `${options.method} ${url}`)).toEqual([
      'POST https://site.example/wp-json/god/v1/admin/opportunities/8530',
      'DELETE https://site.example/wp-json/god/v1/admin/opportunities/8530',
    ]);
  });

  it('when WordPress has no such route, the saved error names the URL and the setting to check', async () => {
    mockEnv.wordpressSyncBaseUrl = 'https://site.example/custom/admin-api';
    fetchSpy.mockResolvedValue(jsonResponse(404, { code: 'rest_no_route', message: 'No route was found matching the URL and request method.', data: { status: 404 } }));
    const record = listing();

    const result = await syncToWordpress('opportunities', record);

    expect(result.status).toBe('failed');
    expect(record.wordpressSync.status).toBe('failed');
    expect(record.wordpressSync.lastError).toContain('https://site.example/custom/admin-api/opportunities');
    expect(record.wordpressSync.lastError).toContain('WORDPRESS_SYNC_BASE_URL');
    expect(record.wordpressSync.lastError).toContain('No route was found');
  });

  it('other WordPress errors keep their own message', async () => {
    mockEnv.wordpressSyncBaseUrl = 'https://site.example/wp-json/god/v1/admin';
    fetchSpy.mockResolvedValue(jsonResponse(401, { code: 'god_sync_unauthorized', message: 'A valid Bearer credential is required.' }));
    const record = listing();
    await syncToWordpress('opportunities', record);
    expect(record.wordpressSync.lastError).toBe('A valid Bearer credential is required.');
  });
});
