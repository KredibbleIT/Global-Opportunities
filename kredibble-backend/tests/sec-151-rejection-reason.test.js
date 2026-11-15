import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { app } from '../src/app.js';
import { User, StaffMember, AuditLog } from '../src/models/User.js';
import { HirerAccount } from '../src/models/Profiles.js';
import { Opportunity, CompanyVerification } from '../src/models/Platform.js';
import { Notification } from '../src/models/Content.js';
import { signToken, signAdminToken } from '../src/middleware/auth.js';
import { invalidateTogglesCache } from '../src/lib/permissions.js';
import { OPPORTUNITY_REJECTION_REASONS } from '../src/lib/opportunity-rejection.js';

/**
 * SEC-151: rejecting a hirer's posting used to save "rejected" and nothing else, so the hirer never learned why.
 * A rejection now needs a reason (and a note for "other"), the hirer is told in the app, can read it on the posting,
 * and an edit sends the posting back for review. The review page also gets the deadline, apply link and the hirer's
 * contact and verification.
 */

const api = (path) => `/api/v1${path}`;
let sequence = 0;

/** A hirer account (User + HirerAccount) and a Bearer token for the app. */
const createHirer = async () => {
  sequence += 1;
  const email = `sec151-hirer-${sequence}@example.com`;
  const user = await User.create({ name: `Hirer ${sequence}`, email, emailNormalized: email, role: 'hirer', emailVerified: true, passwordHash: 'x' });
  const account = await HirerAccount.create({
    userId: user._id,
    companyName: `Acme ${sequence}`,
    industry: 'Finance',
    location: 'Accra',
    recruiterName: 'Ama Recruiter',
    recruiterEmail: `recruiting-${sequence}@acme.example.com`,
    recruiterPhone: '+233 20 000 0000',
  });
  return { user, account, bearer: `Bearer ${signToken(user)}` };
};

/** A staff caller with an admin session; no roles means the root admin. */
const createStaff = async (roles) => {
  sequence += 1;
  const email = `sec151-staff-${sequence}@example.com`;
  const user = await User.create({ name: `Staff ${sequence}`, email, role: 'admin', passwordHash: 'x' });
  if (roles) await StaffMember.create({ userId: user._id, name: user.name, email, roles, status: 'active' });
  return { user, cookie: `kredibble_admin_token=${signAdminToken(user)}`, bearer: `Bearer ${signToken(user)}` };
};

/** A hirer's pending posting, owned the way the app's POST /opportunities records it. */
const createPosting = (hirer) => Opportunity.create({
  title: 'Junior Data Analyst',
  type: 'job',
  company: hirer.account.companyName,
  location: 'Accra, Ghana',
  description: 'Analyse data for the finance team.',
  createdBy: hirer.user._id,
  hirerId: hirer.user._id,
  deadline: new Date('2027-01-31T00:00:00Z'),
  applyUrl: 'https://acme.example.com/jobs/analyst',
  moderationStatus: 'pending',
});

const moderate = (id, cookie, body) => request(app).patch(api(`/admin/opportunities/${id}`)).set('Cookie', cookie).send(body);

beforeEach(() => invalidateTogglesCache());

describe('SEC-151: a rejection needs a reason', () => {
  it('refuses a rejection without a reason and leaves the posting pending', async () => {
    const moderator = await createStaff(['moderator']);
    const posting = await createPosting(await createHirer());

    const res = await moderate(posting._id, moderator.cookie, { moderationStatus: 'rejected' });

    expect(res.status).toBe(400);
    expect((await Opportunity.findById(posting._id).lean()).moderationStatus).toBe('pending');
  });

  it('needs a note when the reason is "other", and refuses an unknown reason', async () => {
    const moderator = await createStaff(['moderator']);
    const posting = await createPosting(await createHirer());

    expect((await moderate(posting._id, moderator.cookie, { moderationStatus: 'rejected', rejectionReason: 'other' })).status).toBe(400);
    expect((await moderate(posting._id, moderator.cookie, { moderationStatus: 'rejected', rejectionReason: 'bad_vibes' })).status).toBe(400);
    const tooLong = await moderate(posting._id, moderator.cookie, { moderationStatus: 'rejected', rejectionReason: 'incomplete', rejectionNote: 'x'.repeat(501) });
    expect(tooLong.status).toBe(400);

    const ok = await moderate(posting._id, moderator.cookie, { moderationStatus: 'rejected', rejectionReason: 'other', rejectionNote: 'We only list paid roles.' });
    expect(ok.status).toBe(200);
  });

  it('refuses a reason sent without a rejection', async () => {
    const moderator = await createStaff(['moderator']);
    const posting = await createPosting(await createHirer());

    const res = await moderate(posting._id, moderator.cookie, { vetted: true, moderationStatus: 'published', rejectionReason: 'duplicate' });

    expect(res.status).toBe(400);
  });

  it('a model save cannot turn a posting down without a reason', async () => {
    const posting = await createPosting(await createHirer());
    posting.moderationStatus = 'rejected';
    await expect(posting.save()).rejects.toThrow(/needs a reason/);
  });
});

describe('SEC-151: a rejection with a reason', () => {
  it('saves the reason, tells the hirer in the app and is audited', async () => {
    const moderator = await createStaff(['moderator']);
    const hirer = await createHirer();
    const posting = await createPosting(hirer);

    const res = await moderate(posting._id, moderator.cookie, {
      moderationStatus: 'rejected',
      rejectionReason: 'application_link',
      rejectionNote: 'The link opens a 404 page.',
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      moderationStatus: 'rejected',
      rejectionReason: 'application_link',
      rejectionReasonLabel: OPPORTUNITY_REJECTION_REASONS.application_link,
      rejectionNote: 'The link opens a 404 page.',
    });
    expect(res.body.data.rejectedAt).toEqual(expect.any(String));

    // Stored, not just answered: before SEC-151 the WordPress bookkeeping save right after a rejection turned
    // every rejected posting back into "pending".
    const saved = await Opportunity.findById(posting._id).lean();
    expect(saved.moderationStatus).toBe('rejected');
    expect(String(saved.rejectedBy)).toBe(String(moderator.user._id));
    expect(saved.status).toBe('draft');

    const notice = await Notification.findOne({ userId: hirer.user._id, audience: 'user' }).lean();
    expect(notice.title).toBe('Your posting was not approved');
    expect(notice.message).toContain('Junior Data Analyst');
    expect(notice.message).toContain(OPPORTUNITY_REJECTION_REASONS.application_link);
    expect(notice.message).toContain('The link opens a 404 page.');

    const audit = await AuditLog.findOne({ action: 'opportunity.update', resourceId: posting._id }).lean();
    expect(audit.metadata).toMatchObject({ moderationStatus: 'rejected', rejectionReason: 'application_link', hirerNotified: true });
  });

  it('lets the hirer read why, but not who decided; other app users cannot read it at all', async () => {
    const moderator = await createStaff(['moderator']);
    const hirer = await createHirer();
    const posting = await createPosting(hirer);
    await moderate(posting._id, moderator.cookie, { moderationStatus: 'rejected', rejectionReason: 'deadline_passed' });

    const own = await request(app).get(api(`/opportunities/${posting._id}`)).set('Authorization', hirer.bearer);
    expect(own.status).toBe(200);
    expect(own.body.data).toMatchObject({
      moderationStatus: 'rejected',
      rejectionReason: 'deadline_passed',
      rejectionReasonLabel: OPPORTUNITY_REJECTION_REASONS.deadline_passed,
    });
    expect(own.body.data.rejectedBy).toBeUndefined();

    const mine = await request(app).get(api('/opportunities')).set('Authorization', hirer.bearer);
    expect(mine.body.data.find((item) => item.id === String(posting._id))).toMatchObject({ rejectionReason: 'deadline_passed' });

    const other = await createHirer();
    expect((await request(app).get(api(`/opportunities/${posting._id}`)).set('Authorization', other.bearer)).status).toBe(404);
  });

  it('approving afterwards forgets the reason', async () => {
    const moderator = await createStaff(['moderator']);
    const posting = await createPosting(await createHirer());
    await moderate(posting._id, moderator.cookie, { moderationStatus: 'rejected', rejectionReason: 'incomplete' });

    const approved = await moderate(posting._id, moderator.cookie, { vetted: true, moderationStatus: 'published' });

    expect(approved.status).toBe(200);
    expect(approved.body.data.rejectionReason).toBeUndefined();
    const saved = await Opportunity.findById(posting._id).lean();
    expect(saved.rejectionReason).toBeUndefined();
    expect(saved.rejectedAt).toBeUndefined();
  });

  it("the hirer's edit sends the posting back for review", async () => {
    const moderator = await createStaff(['moderator']);
    const hirer = await createHirer();
    const posting = await createPosting(hirer);
    await moderate(posting._id, moderator.cookie, { moderationStatus: 'rejected', rejectionReason: 'incomplete', rejectionNote: 'Add the salary.' });

    const edited = await request(app).patch(api(`/opportunities/${posting._id}`)).set('Authorization', hirer.bearer).send({ salary: 'GHS 6,000 a month' });

    expect(edited.status).toBe(200);
    expect(edited.body.data.moderationStatus).toBe('pending');
    const saved = await Opportunity.findById(posting._id).lean();
    expect(saved).toMatchObject({ moderationStatus: 'pending', salary: 'GHS 6,000 a month' });
    expect(saved.rejectionReason ?? null).toBeNull();
    expect(saved.rejectionNote ?? null).toBeNull();
  });

  it('the standard opportunities route cannot reject, even with an admin token', async () => {
    const admin = await createStaff();
    const posting = await createPosting(await createHirer());

    const res = await request(app).patch(api(`/opportunities/${posting._id}`)).set('Authorization', admin.bearer).send({ moderationStatus: 'rejected' });

    expect(res.status).toBe(400);
    expect((await Opportunity.findById(posting._id).lean()).moderationStatus).toBe('pending');
  });
});

describe('SEC-151: the review page has what a decision needs', () => {
  it("returns the deadline, apply link and the hirer's contact and verification", async () => {
    const moderator = await createStaff(['moderator']);
    const hirer = await createHirer();
    const posting = await createPosting(hirer);

    const before = await request(app).get(api(`/admin/opportunities/${posting._id}`)).set('Cookie', moderator.cookie);
    expect(before.status).toBe(200);
    expect(before.body.data.deadline).toBe('2027-01-31T00:00:00.000Z');
    expect(before.body.data.applyUrl).toBe('https://acme.example.com/jobs/analyst');
    expect(before.body.data.hirer).toMatchObject({
      accountId: String(hirer.account._id),
      userId: String(hirer.user._id),
      companyName: hirer.account.companyName,
      recruiterName: 'Ama Recruiter',
      email: hirer.account.recruiterEmail,
      phone: '+233 20 000 0000',
      verificationStatus: 'not_submitted',
    });

    await CompanyVerification.create({ hirerId: hirer.account._id, name: hirer.account.companyName, overallStatus: 'approved' });
    const after = await request(app).get(api(`/admin/opportunities/${posting._id}`)).set('Cookie', moderator.cookie);
    expect(after.body.data.hirer.verificationStatus).toBe('verified');
  });

  it('a staff-curated listing has no hirer', async () => {
    const officer = await createStaff(['opportunities_officer']);
    const created = await request(app).post(api('/admin/opportunities')).set('Cookie', officer.cookie)
      .send({ title: 'Curated fellowship', type: 'fellowship', company: 'Desk Partner', description: 'A listing the desk curated.' });
    expect(created.status).toBe(201);

    const res = await request(app).get(api(`/admin/opportunities/${created.body.data.id}`)).set('Cookie', officer.cookie);
    expect(res.body.data.hirer).toBeNull();
  });
});

describe('SEC-151: the admin dialog offers the reasons the API accepts', () => {
  it('kredibble-admin/src/lib/rejection-reasons.ts lists the same codes and labels', () => {
    const adminFile = fileURLToPath(new URL('../../kredibble-admin/src/lib/rejection-reasons.ts', import.meta.url));
    const source = readFileSync(adminFile, 'utf8');
    const pairs = [...source.matchAll(/code: "([a-z_]+)",\s*label: "([^"]+)"/g)].map(([, code, label]) => [code, label]);
    expect(Object.fromEntries(pairs)).toEqual(OPPORTUNITY_REJECTION_REASONS);
  });
});
