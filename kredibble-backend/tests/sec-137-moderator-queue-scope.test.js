import request from 'supertest';
import { app } from '../src/app.js';
import { User, StaffMember } from '../src/models/User.js';
import { Opportunity } from '../src/models/Platform.js';
import { signAdminToken } from '../src/middleware/auth.js';
import { invalidateTogglesCache } from '../src/lib/permissions.js';

/**
 * SEC-137: the Moderator's "moderate" toggle gives `opportunities_queue` edit, which used to cover every opportunities
 * write. Moderating (approve, reject, unpublish) stays with the queue; creating, rewriting and deleting a listing need
 * `listings_curate` edit (Opportunities Officer, Desk Lead, Super Admin).
 */

const api = (path) => `/api/v1${path}`;
const LISTING = { title: 'Junior data analyst', type: 'job', company: 'Probe Co', description: 'A listing used by the SEC-137 tests.' };

let sequence = 0;
/** A staff User with an admin session, as BE-028 creates one. */
const staffWith = async (roles) => {
  sequence += 1;
  const email = `sec137-${sequence}@example.com`;
  const user = await User.create({ name: `Staff ${sequence}`, email, role: 'admin', passwordHash: 'x' });
  await StaffMember.create({ userId: user._id, name: user.name, email, roles, status: 'active' });
  return `kredibble_admin_token=${signAdminToken(user)}`;
};

const send = (method, path, cookie, body) => request(app)[method](api(path)).set('Cookie', cookie).send(body);

beforeEach(() => invalidateTogglesCache());

describe('SEC-137: the opportunities queue moderates; curating listings is listings_curate', () => {
  it('a Moderator approves, rejects and unpublishes, but cannot create, rewrite or delete a listing', async () => {
    const officer = await staffWith(['opportunities_officer']);
    const moderator = await staffWith(['moderator']);
    const created = await send('post', '/admin/opportunities', officer, LISTING);
    expect(created.status).toBe(201);
    const id = created.body.data.id;

    expect((await send('patch', `/admin/opportunities/${id}`, moderator, { moderationStatus: 'rejected' })).status).toBe(200);
    const approved = await send('patch', `/admin/opportunities/${id}`, moderator, { vetted: true, moderationStatus: 'published' });
    expect(approved.status).toBe(200);
    expect(approved.body.data.vetted).toBe(true);
    expect((await send('post', `/admin/opportunities/${id}/unpublish`, moderator, {})).status).toBe(200);

    expect((await send('post', '/admin/opportunities', moderator, LISTING)).status).toBe(403);
    expect((await send('patch', `/admin/opportunities/${id}`, moderator, { title: 'Rewritten by a moderator' })).status).toBe(403);
    // Moderation fields next to a content field still need listings_curate.
    expect((await send('patch', `/admin/opportunities/${id}`, moderator, { vetted: true, description: 'Rewritten while approving.' })).status).toBe(403);
    expect((await send('delete', `/admin/opportunities/${id}`, moderator)).status).toBe(403);

    const after = await Opportunity.findById(id).lean();
    expect(after.title).toBe(LISTING.title);
    expect(await Opportunity.countDocuments({ title: LISTING.title })).toBe(1);
  });

  it('an Opportunities Officer still creates, rewrites, moderates and deletes', async () => {
    const officer = await staffWith(['opportunities_officer']);
    const created = await send('post', '/admin/opportunities', officer, LISTING);
    expect(created.status).toBe(201);
    const id = created.body.data.id;

    expect((await send('patch', `/admin/opportunities/${id}`, officer, { title: 'Senior data analyst' })).status).toBe(200);
    expect((await send('patch', `/admin/opportunities/${id}`, officer, { moderationStatus: 'rejected' })).status).toBe(200);
    expect((await send('delete', `/admin/opportunities/${id}`, officer)).status).toBe(200);
  });

  it('an empty PATCH body is not moderation, so it needs listings_curate', async () => {
    const moderator = await staffWith(['moderator']);
    const officer = await staffWith(['opportunities_officer']);
    const created = await send('post', '/admin/opportunities', officer, LISTING);
    expect((await send('patch', `/admin/opportunities/${created.body.data.id}`, moderator, {})).status).toBe(403);
  });
});
