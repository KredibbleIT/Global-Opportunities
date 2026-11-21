import { jest } from '@jest/globals';
import request from 'supertest';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Opportunity } from '../src/models/Platform.js';
import { signAdminToken } from '../src/middleware/auth.js';
import { fetchWebsiteSnapshot } from '../src/lib/website-tally.js';
import { testIntegrationConnection } from '../src/lib/integrations.js';

// Three places where the admin and the website disagreed without anyone noticing (found under GOD-T95):
// unpublishing never told WordPress, the tally read a route the plugin doesn't serve, and "Test connection" passed on a
// refused key while testing something publishing never uses. Every request goes to a stub; nothing reaches a website.
// ALL DATA IS FAKE.

const api = (path) => `/api/v1${path}`;
const SITE = 'https://site.example';
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let fetchSpy;
let saved;
beforeEach(() => {
  saved = { baseUrl: env.wordpressSyncBaseUrl, apiKey: env.wordpressApiKey };
  env.wordpressSyncBaseUrl = `${SITE}/wp-json`; // the form production holds (GOD-T95)
  env.wordpressApiKey = 'test-wordpress-key';
  fetchSpy = jest.spyOn(globalThis, 'fetch');
});
afterEach(() => {
  fetchSpy.mockRestore();
  env.wordpressSyncBaseUrl = saved.baseUrl;
  env.wordpressApiKey = saved.apiKey;
});

describe('Unpublishing a listing tells the website', () => {
  it('sends the listing, now a draft, to its WordPress record and reports the sync', async () => {
    const admin = await User.create({ name: 'Test Root Admin', email: `gaps-${Date.now()}@example.com`, role: 'admin', passwordHash: 'x' });
    const listing = await Opportunity.create({
      title: 'Test Published Fellowship',
      type: 'fellowship',
      company: 'Test Foundation',
      location: 'Online',
      description: 'A published listing made in a test.',
      status: 'published',
      vetted: true,
      publishedAt: new Date(),
      wordpressSync: { wordpressId: '8530', status: 'synced' },
    });
    fetchSpy.mockResolvedValue(json(200, { wordpressId: 8530 }));

    const res = await request(app)
      .post(api(`/admin/opportunities/${listing._id}/unpublish`))
      .set('Cookie', `kredibble_admin_token=${signAdminToken(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('draft');
    expect(res.body.data.sync).toMatchObject({ status: 'synced' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(`${options.method} ${url}`).toBe(`POST ${SITE}/wp-json/god/v1/admin/opportunities/8530`);
    expect(JSON.parse(options.body).record).toMatchObject({ status: 'draft' });
  });
});

describe('The website tally reads the public list and the category list', () => {
  const routes = {
    [`${SITE}/wp-json/god/v1/opportunities?per_page=50&page=1`]: { items: [{ id: 8526, title: 'Test Grant &amp; Award', types: ['Grants'] }], total: 2, pages: 2 },
    [`${SITE}/wp-json/god/v1/opportunities?per_page=50&page=2`]: { items: [{ id: 8520, title: 'Test Women&#8217;s Fellowship', types: ['Jobs &amp; Internships', 'Fellowships'] }], total: 2, pages: 2 },
    [`${SITE}/wp-json/wp/v2/god_opportunity_type?per_page=100`]: [{ id: 473, name: 'Grants' }, { id: 475, name: 'Jobs &amp; Internships' }],
  };

  it('reads every page, decodes names, and sends no key to the public routes', async () => {
    fetchSpy.mockImplementation(async (url) => (routes[url] ? json(200, routes[url]) : json(404, { code: 'rest_no_route', message: 'No route was found matching the URL and request method.' })));

    const snapshot = await fetchWebsiteSnapshot();

    expect(snapshot.opportunities).toEqual([
      { id: '8526', title: 'Test Grant & Award', category: 'Grants' },
      { id: '8520', title: 'Test Women’s Fellowship', category: 'Jobs & Internships' },
    ]);
    expect(snapshot.categories).toEqual([{ name: 'Grants' }, { name: 'Jobs & Internships' }]);
    for (const [, options] of fetchSpy.mock.calls) expect(options?.headers?.Authorization).toBeUndefined();
  });

  it('a website that does not answer the list is a 503 that names the address', async () => {
    fetchSpy.mockResolvedValue(json(404, { code: 'rest_no_route', message: 'No route was found matching the URL and request method.' }));
    await expect(fetchWebsiteSnapshot()).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining(`${SITE}/wp-json/god/v1/opportunities`),
    });
  });
});

describe('"Test connection" checks what publishing uses', () => {
  it('asks the plugin\'s status route with the server\'s key, and passes only when WordPress accepts it', async () => {
    fetchSpy.mockResolvedValue(json(200, { ok: true }));
    const result = await testIntegrationConnection('wordpress');
    expect(result.success).toBe(true);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${SITE}/wp-json/god/v1/admin/status`);
    expect(options.headers.Authorization).toBe('Bearer test-wordpress-key');
  });

  it('a refused key fails and says which setting to check', async () => {
    fetchSpy.mockResolvedValue(json(401, { code: 'god_sync_unauthorized', message: 'A valid Bearer credential is required.' }));
    const result = await testIntegrationConnection('wordpress');
    expect(result.success).toBe(false);
    expect(result.message).toContain('WORDPRESS_API_KEY');
  });

  it('a missing plugin route fails and names the address and the setting', async () => {
    env.wordpressSyncBaseUrl = `${SITE}/somewhere-else`;
    fetchSpy.mockResolvedValue(json(404, { code: 'rest_no_route', message: 'No route was found matching the URL and request method.' }));
    const result = await testIntegrationConnection('wordpress');
    expect(result.success).toBe(false);
    expect(result.message).toContain(`${SITE}/somewhere-else/status`);
    expect(result.message).toContain('WORDPRESS_SYNC_BASE_URL');
  });

  it('without the server settings it says publishing is not configured, and asks nothing', async () => {
    env.wordpressSyncBaseUrl = undefined;
    const result = await testIntegrationConnection('wordpress');
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not configured/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
