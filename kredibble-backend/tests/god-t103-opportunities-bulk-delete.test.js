import request from 'supertest';
import { app } from '../src/app.js';
import { signAdminToken, signToken } from '../src/middleware/auth.js';
import { AuditLog, User } from '../src/models/User.js';
import { Opportunity } from '../src/models/Platform.js';

// GOD-T103 (task sheet, 18 Nov 2026): the admin's Opportunities queue had no select-all and no way to delete. The queue now deletes
// the ticked opportunities in one request; each goes through the same steps as the single delete (website copy first, then the
// record, then the audit entry), and one that cannot be deleted is reported without stopping the rest.
const listing = (title) => ({
  title, type: 'fellowship', company: 'Example Org', location: 'Accra', description: 'About it', status: 'draft',
});

describe('GOD-T103: bulk delete in the Opportunities queue', () => {
  let adminCookie;
  beforeEach(async () => {
    await Opportunity.deleteMany({});
    const admin = await User.create({
      name: 'Desk Admin', email: `admin-${Date.now()}-${Math.random()}@example.com`, role: 'admin', passwordHash: 'x', tokenVersion: 1, emailVerified: true,
    });
    adminCookie = `kredibble_admin_token=${signAdminToken(admin)}`;
  });

  const bulkDelete = (ids, cookie = adminCookie) =>
    request(app).post('/api/v1/admin/opportunities/bulk-delete').set('Cookie', cookie).send({ ids });

  it('deletes every ticked opportunity, audits each one, and leaves the rest', async () => {
    const [first, second, kept] = await Opportunity.create([listing('First'), listing('Second'), listing('Kept')]);

    const response = await bulkDelete([String(first._id), String(second._id)]);

    expect(response.statusCode).toBe(200);
    const body = response.body.data ?? response.body;
    expect(body.deleted.sort()).toEqual([String(first._id), String(second._id)].sort());
    expect(body.failed).toEqual([]);
    expect((await Opportunity.find({}).lean()).map((row) => row.title)).toEqual(['Kept']);
    expect(String(kept._id)).toBeTruthy();
    expect(await AuditLog.countDocuments({ action: 'opportunity.delete' })).toBe(2);
  });

  it('reports one that is already gone and still deletes the others', async () => {
    const [present] = await Opportunity.create([listing('Present')]);
    const missing = '0123456789abcdef01234567';

    const response = await bulkDelete([missing, String(present._id)]);

    expect(response.statusCode).toBe(200);
    const body = response.body.data ?? response.body;
    expect(body.deleted).toEqual([String(present._id)]);
    expect(body.failed).toEqual([{ id: missing, reason: 'Not found: it may have been deleted already.' }]);
    expect(await Opportunity.countDocuments()).toBe(0);
  });

  it('refuses an empty list, a bad id and more than 100 at once', async () => {
    expect((await bulkDelete([])).statusCode).toBe(400);
    expect((await bulkDelete(['not-an-id'])).statusCode).toBe(400);
    const tooMany = Array.from({ length: 101 }, (_, index) => index.toString(16).padStart(24, '0'));
    expect((await bulkDelete(tooMany)).statusCode).toBe(400);
  });

  it('is closed to app accounts and to anyone signed out', async () => {
    const [row] = await Opportunity.create([listing('Safe')]);
    const seeker = await User.create({ name: 'Seeker', email: `s-${Date.now()}@example.com`, role: 'seeker', passwordHash: 'x', tokenVersion: 1 });

    const signedOut = await request(app).post('/api/v1/admin/opportunities/bulk-delete').send({ ids: [String(row._id)] });
    const asSeeker = await request(app).post('/api/v1/admin/opportunities/bulk-delete')
      .set('Authorization', `Bearer ${signToken(seeker)}`).send({ ids: [String(row._id)] });

    expect([401, 403]).toContain(signedOut.statusCode);
    expect([401, 403]).toContain(asSeeker.statusCode);
    expect(await Opportunity.countDocuments()).toBe(1);
  });
});
