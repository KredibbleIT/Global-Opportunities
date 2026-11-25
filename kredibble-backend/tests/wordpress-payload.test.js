import { jest } from '@jest/globals';

// GOD-T95, 25 Nov 2026: once the website accepted the server's key, it refused Thrive with "Record fields must be
// scalar values.", because the API sent the whole database record (lists such as `images`, objects such as `views`).
// The GOD Track plugin accepts only the fields in its contract, as plain values. These tests pin what is sent.
const mockEnv = {
  wordpressSyncBaseUrl: 'https://site.example/wp-json/god/v1/admin',
  wordpressApiKey: 'test-wordpress-key',
  outboundRequestTimeoutMs: 10000,
};
jest.unstable_mockModule('../src/config/env.js', () => ({ env: mockEnv }));

const { syncToWordpress } = await import('../src/lib/wordpress-sync.js');
const { toWordpressRecord, descriptionHtml, websiteCategoryFor } = await import('../src/lib/wordpress-payload.js');

const isScalar = (value) => ['string', 'number', 'boolean'].includes(typeof value);

/** Thrive as production stores it on 25 Nov (trimmed), with the lists and objects the plugin refused. */
const thrive = () => ({
  _id: '6af5df670524048a5126b269',
  title: 'Thrive Capital Summer Fellowship 2027',
  type: 'fellowship',
  company: 'Thrive Capital',
  offeringOrganization: 'Thrive Capital',
  location: 'New York or San Francisco',
  description: 'The fellowship is **paid**.\n\nBenefits:\n- A paid internship\n- A stipend <script>x</script>',
  status: 'published',
  moderationStatus: 'published',
  experienceLevels: [],
  images: [],
  views: { website: 0, app: 0 },
  applications: { website: 0, app: 0 },
  applicationUrl: 'https://fellows.thrivecap.com/',
  applyUrl: 'https://fellows.thrivecap.com/',
  costLabel: 'Paid Internship',
  durationLabel: '8 to 10 weeks',
  format: 'in-person',
  country: 'Worldwide',
  deadline: new Date('2026-12-11T00:00:00.000Z'),
  coverImage: 'https://api.example/uploads/cover.webp',
  logoUrl: 'https://api.example/uploads/logo.png',
  referralCodeOnApply: false,
  vetted: true,
  vettedOn: '2026-11-12',
  vettedBy: '6acb45403aac33faffe1629d',
  wordpressSync: { status: 'failed', lastError: 'A valid Bearer credential is required.' },
});

describe('GOD-T95: the record sent to WordPress follows the plugin contract', () => {
  it('a listing is sent with contract fields only, all plain values', () => {
    const record = toWordpressRecord('opportunities', thrive());

    expect(Object.values(record).every(isScalar)).toBe(true);
    expect(record).toEqual({
      title: 'Thrive Capital Summer Fellowship 2027',
      description: expect.any(String),
      organization: 'Thrive Capital',
      deadline: '2026-12-11',
      applicationLink: 'https://fellows.thrivecap.com/',
      location: 'New York or San Francisco',
      costLabel: 'Paid Internship',
      duration: '8 to 10 weeks',
      opportunityType: 'Fellowships',
      referralCodeOnApply: false,
      vetted: true,
      vettedDate: '2026-11-12',
      status: 'published',
    });
    // Worldwide is a scope, not a country the website can convert; image URLs and user ids aren't contract values.
    expect(record).not.toHaveProperty('country');
    expect(record).not.toHaveProperty('vettedBy');
    expect(record).not.toHaveProperty('logoId');
  });

  it('a real country is sent, and an unvetted or unpublished listing goes as a draft', () => {
    const draft = toWordpressRecord('opportunities', { ...thrive(), country: 'Ghana', vetted: false });
    expect(draft.country).toBe('Ghana');
    expect(draft.status).toBe('draft');
    expect(toWordpressRecord('opportunities', { ...thrive(), status: 'archived' }).status).toBe('draft');
  });

  it('the description becomes escaped HTML: formatting marks are kept, typed markup is not', () => {
    const html = descriptionHtml(thrive().description);
    expect(html).toBe('<p>The fellowship is <strong>paid</strong>.</p>\n<p>Benefits:</p>\n<ul><li>A paid internship</li><li>A stipend &lt;script&gt;x&lt;/script&gt;</li></ul>');
    expect(descriptionHtml('## Who can apply\n1. Students\n2. Graduates\n[Apply](https://a.example) [bad](javascript:x)')).toBe(
      '<h3>Who can apply</h3>\n<ol><li>Students</li><li>Graduates</li></ol>\n<p><a href="https://a.example">Apply</a> [bad](javascript:x)</p>',
    );
  });

  it('a listing type uses the category map first, then the website default', () => {
    expect(websiteCategoryFor('internship')).toBe('Jobs & Internships');
    expect(websiteCategoryFor('fellowship', [{ websiteCategory: 'Fellowship Programmes', appCategory: 'fellowship' }])).toBe('Fellowship Programmes');
    expect(websiteCategoryFor('volunteer')).toBeUndefined();
  });

  it('the other five resources send plain contract fields', () => {
    const records = {
      programs: toWordpressRecord('programs', { title: 'Bootcamp', programType: 'bootcamp', status: 'planned', facilitators: ['Ama', 'Kofi'], participantCount: 12, participantTarget: 20, startAt: new Date('2026-12-01T09:00:00Z'), partnerId: 'x' }),
      partners: toWordpressRecord('partners', { organizationName: 'Acme', partnerType: 'corporate', stage: 'MOU', stageHistory: [{ stage: 'prospect' }], sourcedBy: 'Referral' }),
      ambassadors: toWordpressRecord('ambassadors', { fullName: 'Ama Mensah', email: 'ama@example.com', tier: 'Campus Lead', status: 'active', memberType: 'student', profilePhoto: 'https://img.example/a.jpg', trained: true }),
      beneficiaries: toWordpressRecord('beneficiaries', { fullName: 'Kofi', email: 'k@example.com', source: 'ambassador-referral', verified: true, ambassadorId: 'y' }),
      'social-posts': toWordpressRecord('social-posts', { platform: 'linkedin', title: 'Launch', url: 'https://l.example', reach: 40, engagement: 3, postedAt: new Date('2026-11-20T10:00:00Z') }),
    };
    for (const record of Object.values(records)) expect(Object.values(record).every(isScalar)).toBe(true);

    expect(records.programs).toMatchObject({ facilitators: 'Ama, Kofi', participants: 12, participantsTarget: 20, startsAt: '2026-12-01T09:00:00.000Z' });
    expect(records.programs).not.toHaveProperty('partnerId');
    expect(records.partners).toEqual({ organizationName: 'Acme', partnerType: 'corporate', stage: 'MOU', source: 'Referral' });
    expect(records.ambassadors).toEqual({ fullName: 'Ama Mensah', email: 'ama@example.com', tier: 'lead', status: 'active', photoUrl: 'https://img.example/a.jpg', trained: true });
    expect(records.beneficiaries).toEqual({ fullName: 'Kofi', email: 'k@example.com', sourceType: 'referral', verified: true });
    expect(records['social-posts']).toEqual({ platform: 'linkedin', postTitle: 'Launch', postUrl: 'https://l.example', reach: 40, engagement: 3, postedAt: '2026-11-20T10:00:00.000Z' });
  });

  it('an unknown resource is an error, not a silent full-record push', () => {
    expect(() => toWordpressRecord('testimonials', {})).toThrow('No WordPress field mapping');
  });
});

describe('GOD-T95: the push body', () => {
  let fetchSpy;
  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('carries the API id and the contract record, and a refusal names what WordPress said', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ wordpressId: 8530 }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    const document = { ...thrive(), save: jest.fn(async () => undefined) };

    const result = await syncToWordpress('opportunities', document);

    expect(result).toMatchObject({ status: 'synced', wordpressId: '8530' });
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.id).toBe('6af5df670524048a5126b269');
    expect(body).not.toHaveProperty('wordpressId');
    expect(Object.values(body.record).every(isScalar)).toBe(true);
    expect(body.record).not.toHaveProperty('views');

    fetchSpy.mockResolvedValue(new Response(JSON.stringify({
      code: 'god_sync_invalid',
      message: 'Invalid opportunityType.',
      data: { status: 400, allowed: ['Fellowships', 'Grants'] },
    }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    const failed = await syncToWordpress('opportunities', document);
    expect(failed).toEqual({ status: 'failed', error: 'Invalid opportunityType. (["Fellowships","Grants"])' });
  });
});
