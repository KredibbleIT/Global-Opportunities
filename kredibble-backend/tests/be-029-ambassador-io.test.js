import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../src/app.js';
import { User, StaffMember, AuditLog } from '../src/models/User.js';
import { Ambassador, JobLock } from '../src/models/AdminPortal.js';
import { signToken, signAdminToken } from '../src/middleware/auth.js';
import { ambassadorsRouter } from '../src/routes/ambassadors.js';
import { ambassadorIoLimiter } from '../src/lib/rate-limiters.js';
import { acquireLock, releaseLock } from '../src/lib/job-lock.js';
import {
  analyseImport,
  csvCell,
  formatPhoneForExcel,
  mapHeaders,
  parseCsv,
  parseSubmittedAt,
  readRows,
  resolveExportColumns,
} from '../src/lib/ambassador-io.js';
import { driveFileId, processAmbassadorPictures, MAX_PICTURE_ATTEMPTS, STALE_CLAIM_MS } from '../src/lib/ambassador-pictures.js';

// The admin's own fixtures are the server's test vectors (BE-029 spec).
const FIXTURES = join(process.cwd(), '..', 'kredibble-admin', 'tests', 'fixtures');
const fixture = (name) => readFileSync(join(FIXTURES, name), 'utf8');

const api = (path) => `/api/v1${path}`;
const cookieHeader = (user) => ['Cookie', `kredibble_admin_token=${signAdminToken(user)}`];
const CODE = /^GOD-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;
// A real 1x1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

let emailCounter = 0;
const makeAdminUser = async () => {
  emailCounter += 1;
  const email = `be029-${emailCounter}@example.com`;
  return User.create({ name: 'Admin User', email, emailNormalized: email, role: 'admin', emailVerified: true, passwordHash: 'x' });
};

const makeCaller = async (roles, status = 'active') => {
  const user = await makeAdminUser();
  if (roles) {
    await StaffMember.create({ userId: user._id, name: user.name, email: user.email, roles, role: roles[0], status, joinedDate: '2026-10-16' });
  }
  return { user, cookie: cookieHeader(user) };
};
const superAdmin = () => makeCaller(['super_admin']);

const seedAmbassador = (overrides = {}) => Ambassador.create({
  fullName: 'Existing Person', email: 'existing@example.com', phone: '0200000001', country: 'Ghana', city: 'Accra',
  tier: 'ambassador', status: 'active', joinedAt: '2026-01-01', createdBy: new mongoose.Types.ObjectId(),
  ...overrides,
});

const postImport = (caller, csvText, { choice, status, fileName = 'ambassadors.csv' } = {}) => {
  const req = request(app).post(api('/admin/ambassadors/import')).set(...caller.cookie);
  if (choice) req.field('choice', choice);
  if (status) req.field('status', status);
  return req.attach('file', Buffer.from(csvText, 'utf8'), fileName);
};

const postExport = (caller, body) => request(app).post(api('/admin/ambassadors/export')).set(...caller.cookie).send(body);
const csvLines = (text) => text.replace(/^\uFEFF/, '').split('\r\n');

describe('BE-029 rules: CSV parsing and row reading', () => {
  it('parses quotes, doubled quotes, line breaks in fields, CRLF, a BOM and blank lines', () => {
    const rows = parseCsv('\uFEFFa,b\r\n"x, y","say ""hi""\nthere"\r\n\r\nlast,row');
    expect(rows).toEqual([['a', 'b'], ['x, y', 'say "hi"\nthere'], ['last', 'row']]);
  });

  it('maps the sign-up sheet headers and reports missing required columns', () => {
    const header = parseCsv(fixture('ambassadors-problem-rows.csv'))[0];
    expect(mapHeaders(header).columns).toEqual(['submittedAt', 'fullName', 'email', 'phoneCombined', 'country', 'city', 'picture', 'bio']);
    expect(mapHeaders(['Name', 'Phone']).missing).toEqual(['Email']);
  });

  it('reads the form timestamp with AM/PM and GMT', () => {
    expect(parseSubmittedAt('2026/10/01 9:15:00 AM GMT')?.iso).toBe('2026-10-01T09:15:00.000Z');
    expect(parseSubmittedAt('2026/10/03 12:00:00 PM GMT')?.iso).toBe('2026-10-03T12:00:00.000Z');
    expect(parseSubmittedAt('13/10/2026 15:45')?.iso).toBe('2026-10-13T15:45:00.000Z');
    expect(parseSubmittedAt('2026/02/30')).toBeNull();
  });

  it('flags the problem rows the way the admin preview does', () => {
    const [header, ...data] = parseCsv(fixture('ambassadors-problem-rows.csv'));
    const rows = readRows(data, mapHeaders(header));
    const byEmail = (email) => rows.find((row) => row.record.email === email);
    const levels = (row) => row.issues.map((issue) => issue.level);

    expect(rows).toHaveLength(17);
    expect(byEmail('test four @example.com').issues).toContainEqual(expect.objectContaining({ level: 'error', field: 'Email' }));
    expect(levels(byEmail('test.fourteen@example.com'))).toContain('error');
    expect(levels(byEmail('test.thirteen@example.com'))).toEqual(expect.arrayContaining(['warning']));
    expect(levels(byEmail('test.thirteen@example.com'))).not.toContain('error');
    expect(byEmail('test.three@example.com').record.fullName).toBe('Test Person Three');
    expect(byEmail('test.five@example.com').record.phone).toBe('0200000006');
    expect(byEmail('test.six@example.com').record.phone).toBe('0200000007');
    expect(byEmail('test.seven@example.com').record).toMatchObject({ phone: '0200000008', whatsapp: '0200000009' });
    expect(byEmail('test.eight@example.com').record).toMatchObject({ phone: '0200000010', whatsapp: '0200000011' });
    expect(byEmail('test.nine@example.com').issues).toContainEqual(expect.objectContaining({ level: 'warning', field: 'Phone' }));
    expect(byEmail('test.ten@example.com').issues).toContainEqual(expect.objectContaining({ level: 'warning', field: 'City' }));
    expect(byEmail('test.eleven@example.com').record.region).toBe('Northern');
    expect(byEmail('test.fifteen@example.com').record.bio).toContain('\n\nThird paragraph.');
    // Every Drive link is the SOURCE; nothing is a stored picture yet.
    expect(rows.every((row) => row.record.pictureUrl === '' && row.record.pictureSourceUrl.startsWith('https://drive.google.com/'))).toBe(true);
  });

  it('merges the same person: the latest submission wins and email matching ignores case and spaces', () => {
    const [header, ...data] = parseCsv(fixture('ambassadors-problem-rows.csv'));
    const preview = analyseImport(readRows(data, mapHeaders(header)), new Set(['test.one@example.com']));
    const twos = preview.rows.filter((row) => row.emailKey === 'test.two@example.com');
    expect(twos.map((row) => row.mergedInto)).toEqual([4, undefined]);
    // Warnings: nine (12-digit phone), ten (unknown city), thirteen (bio over 400).
    expect(preview.counts).toEqual({ total: 17, valid: 11, warnings: 3, errors: 2, merged: 1, exists: 1 });
  });

  it('bounds what a file can store more tightly than the preview does', () => {
    const [row] = readRows([['x'.repeat(201), 'long.name@example.com']], mapHeaders(['fullName', 'email']));
    expect(row.issues).toContainEqual(expect.objectContaining({ level: 'error', field: 'Full name' }));
  });
});

describe('BE-029 rules: export cells', () => {
  it('neutralises formulas and quotes cells that need it', () => {
    expect(csvCell('=SUM(1,1)')).toBe('"\'=SUM(1,1)"');
    expect(csvCell('+233')).toBe("'+233");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('plain')).toBe('plain');
  });

  it('keeps phones as text Excel will not turn into numbers', () => {
    expect(formatPhoneForExcel('0257349584')).toBe('025 734 9584');
    expect(formatPhoneForExcel('020000001212')).toBe('020 000 001 212');
    expect(formatPhoneForExcel('')).toBe('');
  });

  it('drops sensitive columns without the opt-in, whatever the list says, in template order', () => {
    expect(resolveExportColumns(['status', 'email', 'fullName', 'phone'], false)).toEqual(['fullName', 'status']);
    expect(resolveExportColumns(['status', 'email', 'fullName'], true)).toEqual(['fullName', 'email', 'status']);
    expect(resolveExportColumns(undefined, true)).toEqual(['fullName', 'country', 'region', 'city', 'bio', 'submittedAt', 'status']);
  });
});

describe('BE-029: who may import and export', () => {
  const CSV = () => fixture('ambassadors-update.csv');

  it.each([
    ['root admin (no staff record)', null],
    ['staff Super Admin', ['super_admin']],
    ['Desk Lead', ['desk_lead']],
    ['a person with Desk Lead as second role', ['country_lead', 'desk_lead']],
  ])('%s can import and export', async (_label, roles) => {
    const caller = await makeCaller(roles);
    expect((await postImport(caller, CSV())).statusCode).toBe(200);
    expect((await postExport(caller, { scope: 'all' })).statusCode).toBe(200);
  });

  it.each([
    ['support', ['support']],
    ['country lead (edits the Network, but has no bulk grant)', ['country_lead']],
    ['moderator', ['moderator']],
  ])('%s is refused with 403 and nothing is written', async (_label, roles) => {
    const caller = await makeCaller(roles);
    expect((await postImport(caller, CSV())).statusCode).toBe(403);
    expect((await postExport(caller, { scope: 'all' })).statusCode).toBe(403);
    expect(await Ambassador.countDocuments()).toBe(0);
    expect(await AuditLog.countDocuments({ action: { $in: ['ambassadors.import', 'ambassadors.export'] } })).toBe(0);
  });

  it('a suspended Super Admin gets no root-admin fallback', async () => {
    const caller = await makeCaller(['super_admin'], 'suspended');
    expect((await postImport(caller, CSV())).statusCode).toBe(403);
  });

  it('a user-app token and anonymous callers are refused before the file is read', async () => {
    const seeker = await User.create({ name: 'Seeker', email: 'seeker29@example.com', emailNormalized: 'seeker29@example.com', role: 'seeker', passwordHash: 'x' });
    const asSeeker = await request(app).post(api('/admin/ambassadors/import'))
      .set('Authorization', `Bearer ${signToken(seeker)}`)
      .attach('file', Buffer.from(CSV()), 'a.csv');
    expect(asSeeker.statusCode).toBe(401);
    const anonymous = await request(app).post(api('/admin/ambassadors/export')).send({ scope: 'all' });
    expect(anonymous.statusCode).toBe(401);
  });

  it('both routes run auth, then the role guard, then the rate limiter', () => {
    for (const path of ['/import', '/export']) {
      const layer = ambassadorsRouter.stack.find((entry) => entry.route?.path === path);
      const handlers = layer.route.stack.map((entry) => entry.handle);
      expect(handlers.indexOf(ambassadorIoLimiter)).toBe(2);
    }
  });
});

describe('BE-029: import', () => {
  it('imports the problem sheet: errors never import, duplicates merge, codes are unique', async () => {
    const caller = await superAdmin();
    const res = await postImport(caller, fixture('ambassadors-problem-rows.csv'));
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toMatchObject({ created: 14, updated: 0, skipped: 0, failed: 2, merged: 1, picturesQueued: 14, status: 'active', choice: 'skip' });
    expect(res.body.data.errors.map((error) => error.row)).toEqual([6, 16]);
    expect(res.body.data.errors[0].reason).toContain('Email contains spaces');
    expect(res.body.data.errors[1].reason).toContain('the limit is 1000');

    const stored = await Ambassador.find().lean();
    expect(stored).toHaveLength(14);
    expect(stored.find((a) => a.email === 'test.fourteen@example.com')).toBeUndefined();
    expect(stored.filter((a) => a.email === 'test.two@example.com')).toHaveLength(1);
    expect(stored.find((a) => a.email === 'test.two@example.com').description).toBe('NEW biography of person two.');
    expect(new Set(stored.map((a) => a.referralCode)).size).toBe(14);
    for (const ambassador of stored) {
      expect(ambassador.referralCode).toMatch(CODE);
      expect(ambassador.status).toBe('active');
      expect(ambassador.tier).toBe('ambassador');
      expect(ambassador.createdBy.toString()).toBe(caller.user._id.toString());
      expect(ambassador.profilePhoto).toBeUndefined();
      expect(ambassador.pictureImport).toMatchObject({ status: 'pending', attempts: 0 });
    }
    const seven = stored.find((a) => a.email === 'test.seven@example.com');
    expect(seven).toMatchObject({ phone: '0200000008', whatsapp: '0200000009', joinedAt: '2026-10-05' });
    expect(seven.submittedAt.toISOString()).toBe('2026-10-05T09:00:00.000Z');
    // Stored as typed; only the export escapes it.
    expect(stored.find((a) => a.email === 'test.sixteen@example.com').fullName).toBe('=SUM(1,1) Injection Test');
  });

  it('new people get the wizard status: pending is stored as applicant', async () => {
    const caller = await superAdmin();
    const res = await postImport(caller, fixture('ambassadors-update.csv'), { status: 'pending' });
    expect(res.body.data.created).toBe(1);
    expect((await Ambassador.findOne({ email: 'test.one@example.com' }).lean()).status).toBe('applicant');
  });

  it('ignores the file status column for new people', async () => {
    const caller = await superAdmin();
    await postImport(caller, fixture('ambassadors-status-column.csv'), { status: 'active' });
    const statuses = (await Ambassador.find().lean()).map((a) => a.status);
    expect(statuses).toEqual(['active', 'active', 'active']);
  });

  it('update: changes only what the file has and never the status, code, tier or join date', async () => {
    const caller = await superAdmin();
    const existing = await seedAmbassador({
      email: 'test.one@example.com', status: 'dormant', tier: 'senior', referralCode: 'GOD-KEEPCD', joinedAt: '2025-05-05', campus: 'Legon',
    });
    const res = await postImport(caller, fixture('ambassadors-update.csv'), { choice: 'update', status: 'pending' });
    expect(res.body.data).toMatchObject({ created: 0, updated: 1, skipped: 0 });
    expect(res.body.data.counts.exists).toBe(1);

    const current = await Ambassador.findById(existing._id).lean();
    expect(current).toMatchObject({
      fullName: 'Test Person One Updated', phone: '0200000099', region: 'Ashanti', city: 'Kumasi',
      description: 'UPDATED biography for person one.',
      status: 'dormant', tier: 'senior', referralCode: 'GOD-KEEPCD', joinedAt: '2025-05-05', campus: 'Legon',
    });
    expect(await Ambassador.countDocuments()).toBe(1);
  });

  it('skip: leaves existing people alone, and importing twice never duplicates', async () => {
    const caller = await superAdmin();
    const existing = await seedAmbassador({ email: 'test.one@example.com' });
    const first = await postImport(caller, fixture('ambassadors-update.csv'), { choice: 'skip' });
    expect(first.body.data).toMatchObject({ created: 0, updated: 0, skipped: 1 });
    expect((await Ambassador.findById(existing._id).lean()).fullName).toBe('Existing Person');

    await postImport(caller, fixture('ambassadors-problem-rows.csv'));
    await postImport(caller, fixture('ambassadors-problem-rows.csv'), { choice: 'update' });
    expect(await Ambassador.countDocuments({ email: 'test.two@example.com' })).toBe(1);
    expect(await Ambassador.countDocuments()).toBe(14);
  });

  it('a changed Drive link queues a new picture copy; the same link does not', async () => {
    const caller = await superAdmin();
    const header = 'fullName,email,pictureSourceUrl';
    await seedAmbassador({ email: 'pic@example.com', pictureSourceUrl: 'https://drive.google.com/open?id=OLDFILE0001', pictureImport: { status: 'done', attempts: 1 } });
    const same = await postImport(caller, `${header}\nPic Person,pic@example.com,https://drive.google.com/open?id=OLDFILE0001\n`, { choice: 'update' });
    expect(same.body.data.picturesQueued).toBe(0);
    const changed = await postImport(caller, `${header}\nPic Person,pic@example.com,https://drive.google.com/file/d/NEWFILE0002/view\n`, { choice: 'update' });
    expect(changed.body.data.picturesQueued).toBe(1);
    expect((await Ambassador.findOne({ email: 'pic@example.com' }).lean()).pictureImport).toMatchObject({ status: 'pending', attempts: 0 });
  });

  it.each([
    ['no email column', 'fullName,phone\nA Person,0200000001\n', 'ambassadors.csv', /no Email column/],
    ['only a header', 'fullName,email\n', 'ambassadors.csv', /no rows below the header/],
    ['not a .csv file', 'fullName,email\nA,a@example.com\n', 'notes.txt', /Only \.csv files/],
  ])('refuses a file with %s (400)', async (_label, text, fileName, message) => {
    const caller = await superAdmin();
    const res = await postImport(caller, text, { fileName });
    expect(res.statusCode).toBe(400);
    expect(res.body.error.message).toMatch(message);
  });

  it('refuses a file that is not UTF-8 text', async () => {
    const caller = await superAdmin();
    const res = await request(app).post(api('/admin/ambassadors/import')).set(...caller.cookie)
      .attach('file', Buffer.from([0x66, 0x75, 0x6c, 0x6c, 0xff, 0xfe, 0x00]), 'ambassadors.csv');
    expect(res.statusCode).toBe(400);
  });

  it('refuses a file over 5 MB with 413', async () => {
    const caller = await superAdmin();
    const big = `fullName,email\n${'x'.repeat(5 * 1024 * 1024)}\n`;
    const res = await postImport(caller, big);
    expect(res.statusCode).toBe(413);
  });

  it('refuses an unknown choice or extra form fields', async () => {
    const caller = await superAdmin();
    expect((await postImport(caller, fixture('ambassadors-update.csv'), { choice: 'overwrite' })).statusCode).toBe(400);
    const extra = await request(app).post(api('/admin/ambassadors/import')).set(...caller.cookie)
      .field('createdBy', 'someone').attach('file', Buffer.from(fixture('ambassadors-update.csv')), 'a.csv');
    expect(extra.statusCode).toBe(400);
  });

  it('answers 409 while another import holds the lock, and works once it is released', async () => {
    const caller = await superAdmin();
    const lease = await acquireLock('ambassador-import', 60_000);
    const busy = await postImport(caller, fixture('ambassadors-update.csv'));
    expect(busy.statusCode).toBe(409);
    expect(await Ambassador.countDocuments()).toBe(0);
    await releaseLock(lease);
    expect((await postImport(caller, fixture('ambassadors-update.csv'))).statusCode).toBe(200);
    expect(await JobLock.countDocuments()).toBe(0);
  });
});

describe('BE-029: export', () => {
  beforeEach(async () => {
    await seedAmbassador({ fullName: 'One Person', email: 'one@example.com', phone: '0200000001', whatsapp: '0200000002', city: 'Accra', status: 'active', tier: 'ambassador', campus: 'Legon' });
    await seedAmbassador({ fullName: 'Two Person', email: 'two@example.com', phone: '0200000003', city: 'Kumasi', status: 'applicant', tier: 'Senior Ambassador', country: 'Nigeria' });
  });

  it('default columns carry no contact details, as an attachment that is never cached', async () => {
    const caller = await superAdmin();
    const res = await postExport(caller, { scope: 'all' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="ambassadors-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.text.startsWith('\uFEFF')).toBe(true);
    const [header] = csvLines(res.text);
    expect(header).toBe('fullName,country,region,city,bio,submittedAt,status');
    expect(res.text).not.toMatch(/@example\.com|0200000001|020 000 0001/);
    expect(res.text).toContain('Two Person,Nigeria,,Kumasi,,2026-01-01,pending');
  });

  it('a contact column asked for without the opt-in is left out', async () => {
    const caller = await superAdmin();
    const res = await postExport(caller, { scope: 'all', columns: ['fullName', 'email', 'phone'] });
    expect(csvLines(res.text)[0]).toBe('fullName');
    expect(res.text).not.toContain('@example.com');
  });

  it('includes contact columns with the opt-in, phones as text', async () => {
    const caller = await superAdmin();
    const res = await postExport(caller, { scope: 'all', columns: ['fullName', 'email', 'phone', 'whatsapp'], includeSensitive: true });
    expect(csvLines(res.text)).toContain('One Person,one@example.com,020 000 0001,020 000 0002');
  });

  it('escapes formula injection', async () => {
    await seedAmbassador({ fullName: '=HYPERLINK("http://evil.example","x")', email: 'formula@example.com' });
    await seedAmbassador({ fullName: '@SUM(A1)', email: 'formula2@example.com' });
    const caller = await superAdmin();
    const res = await postExport(caller, { scope: 'all', columns: ['fullName'] });
    expect(res.text).toContain('"\'=HYPERLINK(""http://evil.example"",""x"")"');
    expect(res.text).toContain("'@SUM(A1)");
  });

  it('filtered scope uses the Network page filters (status, tier incl. old labels, country, name search)', async () => {
    const caller = await superAdmin();
    const names = async (filters) => {
      const res = await postExport(caller, { scope: 'filtered', columns: ['fullName'], filters });
      return csvLines(res.text).slice(1).sort();
    };
    expect(await names({ status: 'applicant' })).toEqual(['Two Person']);
    expect(await names({ tier: 'senior' })).toEqual(['Two Person']);
    expect(await names({ country: 'Ghana' })).toEqual(['One Person']);
    expect(await names({ search: 'legon' })).toEqual(['One Person']);
    expect(await names({ search: '.*' })).toEqual([]);
  });

  it('selected scope exports exactly the named rows', async () => {
    const caller = await superAdmin();
    const one = await Ambassador.findOne({ email: 'one@example.com' }).lean();
    const res = await postExport(caller, { scope: 'selected', ids: [String(one._id)], columns: ['fullName'] });
    expect(csvLines(res.text)).toEqual(['fullName', 'One Person']);
  });

  it.each([
    ['selected without ids', { scope: 'selected' }],
    ['ids outside selected', { scope: 'all', ids: [String(new mongoose.Types.ObjectId())] }],
    ['filters outside filtered', { scope: 'all', filters: { status: 'active' } }],
    ['an unknown column', { scope: 'all', columns: ['passwordHash'] }],
    ['an unknown field', { scope: 'all', includeEverything: true }],
    ['a non-boolean opt-in', { scope: 'all', includeSensitive: 'true' }],
  ])('refuses %s (400)', async (_label, body) => {
    const caller = await superAdmin();
    expect((await postExport(caller, body)).statusCode).toBe(400);
  });

  it('round-trips: an export with every column imports back as updates only', async () => {
    const caller = await superAdmin();
    const all = ['fullName', 'email', 'phone', 'whatsapp', 'country', 'region', 'city', 'pictureUrl', 'pictureSourceUrl', 'bio', 'submittedAt', 'status'];
    const exported = await postExport(caller, { scope: 'all', columns: all, includeSensitive: true });
    const res = await postImport(caller, exported.text, { choice: 'update' });
    expect(res.body.data).toMatchObject({ created: 0, updated: 2, failed: 0 });
    expect((await Ambassador.findOne({ email: 'one@example.com' }).lean()).phone).toBe('0200000001');
  });
});

describe('BE-029: audit trail', () => {
  it('records each import with its counts, and no personal data', async () => {
    const caller = await superAdmin();
    await postImport(caller, fixture('ambassadors-problem-rows.csv'), { status: 'pending' });
    const [entry] = await AuditLog.find({ action: 'ambassadors.import' }).lean();
    expect(entry).toMatchObject({ actorId: caller.user._id, outcome: 'success', resourceType: 'ambassador' });
    expect(entry.metadata).toMatchObject({
      file: 'ambassadors.csv', rows: 17, choice: 'skip', status: 'pending', created: 14, updated: 0, skipped: 0, failed: 2, merged: 1,
    });
    expect(JSON.stringify(entry)).not.toMatch(/@example\.com|0200000/);
  });

  it('records each export with scope, columns, row count and the opt-in', async () => {
    await seedAmbassador();
    const caller = await superAdmin();
    await postExport(caller, { scope: 'filtered', filters: { status: 'active' }, columns: ['fullName', 'email'], includeSensitive: true });
    const [entry] = await AuditLog.find({ action: 'ambassadors.export' }).lean();
    expect(entry.metadata).toMatchObject({ scope: 'filtered', rows: 1, columns: ['fullName', 'email'], includeSensitive: true, filters: { status: 'active' } });
  });
});

describe('BE-029: the import lock', () => {
  it('lets one holder in, refuses the second, and frees on release or expiry', async () => {
    const first = await acquireLock('test-lock', 60_000);
    expect(first).not.toBeNull();
    expect(await acquireLock('test-lock', 60_000)).toBeNull();
    await releaseLock({ name: 'test-lock', holder: 'not-the-holder' });
    expect(await acquireLock('test-lock', 60_000)).toBeNull();
    await releaseLock(first);
    const second = await acquireLock('test-lock', 1);
    expect(second).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await acquireLock('test-lock', 60_000)).not.toBeNull();
  });
});

describe('BE-029: picture job', () => {
  const stubFetch = (respond) => jest.fn(async (url) => {
    const { body = PNG, status = 200, headers = { 'content-type': 'image/png' } } = respond(url) ?? {};
    const response = new Response(body, { status, headers });
    Object.defineProperty(response, 'url', { value: url });
    return response;
  });
  const upload = jest.fn(async () => ({ secure_url: 'https://res.cloudinary.com/test/image/upload/ambassadors/copy.png' }));
  const pending = (overrides = {}) => seedAmbassador({
    email: `pic-${Math.random()}@example.com`,
    pictureSourceUrl: 'https://drive.google.com/open?id=FAKEID0001',
    pictureImport: { status: 'pending', attempts: 0 },
    ...overrides,
  });

  it('reads the Drive file id and never accepts another host', () => {
    expect(driveFileId('https://drive.google.com/open?id=FAKEID0001')).toBe('FAKEID0001');
    expect(driveFileId('https://drive.google.com/file/d/1AbC_dEf-GhIjK/view?usp=sharing')).toBe('1AbC_dEf-GhIjK');
    expect(driveFileId('https://docs.google.com/uc?id=FAKEID0002&export=download')).toBe('FAKEID0002');
    expect(driveFileId('https://drive.google.com.evil.example/open?id=FAKEID0001')).toBeNull();
    expect(driveFileId('http://169.254.169.254/latest/meta-data?id=FAKEID0001')).toBeNull();
    expect(driveFileId('https://drive.google.com/open?id=../../etc')).toBeNull();
  });

  it('copies a shared picture into our storage, fetching only the address it built', async () => {
    const ambassador = await pending();
    const fetchImpl = stubFetch(() => null);
    const summary = await processAmbassadorPictures({ fetchImpl, upload });
    expect(summary).toEqual({ tried: 1, done: 1, failed: 0 });
    expect(fetchImpl).toHaveBeenCalledWith('https://drive.google.com/uc?export=download&id=FAKEID0001', expect.any(Object));
    expect(upload).toHaveBeenCalledWith(expect.any(Buffer), 'ambassadors');
    const current = await Ambassador.findById(ambassador._id).lean();
    expect(current.profilePhoto).toBe('https://res.cloudinary.com/test/image/upload/ambassadors/copy.png');
    expect(current.pictureImport).toMatchObject({ status: 'done', attempts: 1 });
  });

  it.each([
    ['a file not shared with anyone with the link', { body: '<html>Sign in</html>', headers: { 'content-type': 'text/html' } }, /anyone with the link/],
    ['a file that is not a picture', { body: 'MZ\u0090\u0000not an image', headers: { 'content-type': 'image/png' } }, /not a PNG, JPEG or WebP/],
    ['a file over 5 MB', { body: Buffer.alloc(5 * 1024 * 1024 + 1), headers: { 'content-type': 'image/png' } }, /larger than 5 MB/],
    ['a Drive error', { status: 404, body: '' }, /answered 404/],
  ])('records %s as a failure with the reason', async (_label, answer, reason) => {
    const ambassador = await pending();
    const summary = await processAmbassadorPictures({ fetchImpl: stubFetch(() => answer), upload });
    expect(summary.failed).toBe(1);
    const current = await Ambassador.findById(ambassador._id).lean();
    expect(current.profilePhoto).toBeUndefined();
    expect(current.pictureImport.status).toBe('failed');
    expect(current.pictureImport.lastError).toMatch(reason);
  });

  it('retries failures until the attempt limit, skips fresh claims, and takes over stale ones', async () => {
    const spent = await pending({ pictureImport: { status: 'failed', attempts: MAX_PICTURE_ATTEMPTS } });
    const retry = await pending({ pictureImport: { status: 'failed', attempts: 1 } });
    const busy = await pending({ pictureImport: { status: 'processing', attempts: 1, lastAttemptAt: new Date() } });
    const stale = await pending({ pictureImport: { status: 'processing', attempts: 1, lastAttemptAt: new Date(Date.now() - STALE_CLAIM_MS - 1000) } });
    const summary = await processAmbassadorPictures({ fetchImpl: stubFetch(() => null), upload });
    expect(summary.done).toBe(2);
    const status = async (doc) => (await Ambassador.findById(doc._id).lean()).pictureImport.status;
    expect(await status(spent)).toBe('failed');
    expect(await status(retry)).toBe('done');
    expect(await status(busy)).toBe('processing');
    expect(await status(stale)).toBe('done');
  });
});
