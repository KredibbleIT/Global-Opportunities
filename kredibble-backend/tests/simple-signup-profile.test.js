import request from 'supertest';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { SeekerProfile, HirerAccount } from '../src/models/Profiles.js';
import { Opportunity, Applicant } from '../src/models/Platform.js';
import { Beneficiary } from '../src/models/AdminPortal.js';
import { uploadRoot } from '../src/lib/storage.js';
import { parseDateOfBirth, ageOn, checkDateOfBirth } from '../src/lib/age.js';
import { profileCompletion } from '../src/lib/profile-completion.js';

// Simple sign-up, then "Complete your profile". ALL DATA IS FAKE.

const api = (route) => `/api/v1${route}`;
const PASSWORD = 'Str0ngPassword!';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const bearer = (token) => ['Authorization', `Bearer ${token}`];
let counter = 0;
const email = (label) => `signup-${label}-${Date.now()}-${counter++}@example.com`;
const yearsAgo = (years, extraDays = 0) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() - extraDays);
  return d.toISOString().slice(0, 10);
};
const newSeeker = (overrides = {}) => ({
  firstName: 'Test', lastName: 'Person', dateOfBirth: '2000-05-01', gender: 'female', email: email('seeker'), password: PASSWORD, role: 'seeker', ...overrides,
});
const register = (body) => request(app).post(api('/auth/register')).send(body);

describe('age rules', () => {
  it('reads only real YYYY-MM-DD dates', () => {
    expect(parseDateOfBirth('2000-02-29')?.toISOString()).toBe('2000-02-29T00:00:00.000Z');
    for (const bad of ['2001-02-29', '2000-13-01', '01/05/2000', '2000-5-1', '', undefined, 20000501]) expect(parseDateOfBirth(bad)).toBeNull();
  });

  it('counts whole years, so the sixteenth birthday is the first day allowed', () => {
    const now = new Date('2026-11-18T12:00:00Z');
    expect(ageOn(new Date('2010-11-18T00:00:00Z'), now)).toBe(16);
    expect(ageOn(new Date('2010-11-19T00:00:00Z'), now)).toBe(15);
    expect(checkDateOfBirth('2010-11-18', now).ok).toBe(true);
    expect(checkDateOfBirth('2010-11-19', now)).toEqual({ ok: false, message: 'You must be at least 16 to create an account' });
    expect(checkDateOfBirth('1850-01-01', now).ok).toBe(false);
    expect(checkDateOfBirth('2027-01-01', now).ok).toBe(false);
  });
});

describe('simple sign-up', () => {
  it('creates a seeker from just names, date of birth, gender, email and password, and the profile starts partly filled in', async () => {
    const res = await register(newSeeker()).expect(201);
    const { user } = res.body.data;
    expect(user).toMatchObject({ name: 'Test Person', firstName: 'Test', lastName: 'Person', gender: 'female', role: 'seeker' });
    expect(user.dateOfBirth).toBe('2000-05-01T00:00:00.000Z');
    expect(user.seeker).toBeTruthy();
    expect(user.profileCompletion).toMatchObject({ percent: 20, complete: false });
    expect(user.profileCompletion.missing).toEqual(['contact', 'education', 'career', 'cv']);
    expect(res.body.data.token).toBeTruthy();
    expect(user.passwordHash).toBeUndefined();
  });

  it('creates a hirer the same way, with no company details', async () => {
    const res = await register(newSeeker({ role: 'hirer', email: email('hirer') })).expect(201);
    const { user } = res.body.data;
    expect(user.role).toBe('hirer');
    expect(user.profileCompletion).toMatchObject({ percent: 25 });
    expect(user.profileCompletion.missing).toEqual(['company', 'recruiter', 'verification']);
    expect(await HirerAccount.countDocuments({ userId: user.id })).toBe(1);
  });

  it('keeps gender optional', async () => {
    const { gender, ...withoutGender } = newSeeker();
    const res = await register(withoutGender).expect(201);
    expect(res.body.data.user.gender).toBeUndefined();
    expect((await register(newSeeker({ gender: 'unknown' }))).status).toBe(400);
  });

  it('refuses someone under 16, a missing or impossible date of birth, and a missing name, and creates nothing', async () => {
    const under = newSeeker({ dateOfBirth: yearsAgo(15, 200) });
    const res = await register(under);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('You must be at least 16');
    expect(await User.countDocuments({ email: under.email })).toBe(0);

    const { dateOfBirth, ...noDob } = newSeeker();
    expect((await register(noDob)).status).toBe(400);
    expect((await register(newSeeker({ dateOfBirth: '2001-02-29' }))).status).toBe(400);
    expect((await register(newSeeker({ firstName: undefined }))).status).toBe(400);
    expect((await register(newSeeker({ lastName: '' }))).status).toBe(400);
  });

  it('lets someone exactly 16 in', async () => {
    await register(newSeeker({ dateOfBirth: yearsAgo(16) })).expect(201);
  });

  it('still accepts the older app\'s single name while a date of birth is not yet required, and requires one once that is switched on', async () => {
    const legacy = { name: 'Older App', email: email('legacy'), password: PASSWORD, role: 'seeker' };
    const res = await register(legacy).expect(201);
    expect(res.body.data.user).toMatchObject({ name: 'Older App', firstName: 'Older', lastName: 'App' });
    expect(res.body.data.user.dateOfBirth).toBeUndefined();
    expect(res.body.data.user.profileCompletion.missing).toContain('basics');

    env.requireDateOfBirth = true;
    try {
      const refused = await register({ ...legacy, email: email('legacy2') });
      expect(refused.status).toBe(400);
      await register({ ...legacy, email: email('legacy3'), dateOfBirth: '1999-01-01' }).expect(201);
    } finally {
      env.requireDateOfBirth = false;
    }
  });

  it('shows the profile completion on sign-in and /auth/me too', async () => {
    const body = newSeeker();
    await register(body).expect(201);
    const login = await request(app).post(api('/auth/login')).send({ email: body.email, password: PASSWORD }).expect(200);
    expect(login.body.data.user.profileCompletion.percent).toBe(20);
    const me = await request(app).get(api('/auth/me')).set(...bearer(login.body.data.token)).expect(200);
    expect(me.body.data.profileCompletion.percent).toBe(20);
    expect(me.body.data.dateOfBirth).toBeTruthy();
  });
});

describe('profile completion', () => {
  it('never counts the placeholders the server fills in itself', () => {
    const user = { role: 'hirer', name: 'Test', dateOfBirth: new Date() };
    expect(profileCompletion(user, { industry: 'Not specified', location: 'Not specified', verification: 'pending' }).missing).toEqual(['company', 'recruiter', 'verification']);
    expect(profileCompletion({ role: 'seeker', name: 'Test', dateOfBirth: new Date() }, { profession: 'Opportunity Seeker', technicalSkills: '[]' }).percent).toBe(20);
  });

  it('reaches 100% when everything is filled in, and has nothing to complete for an admin', () => {
    const done = profileCompletion(
      { role: 'seeker', name: 'Test', dateOfBirth: new Date() },
      { country: 'Ghana', phone: '+233000', university: 'Test University', profession: 'Data Analyst', technicalSkills: '["SQL"]', resumeUrl: 'https://example.com/cv.pdf' },
    );
    expect(done).toMatchObject({ percent: 100, complete: true, missing: [] });
    expect(profileCompletion({ role: 'admin' }, null)).toBeNull();
  });
});

describe('PATCH /users/me/profile', () => {
  const signUp = async (overrides = {}) => {
    const body = newSeeker(overrides);
    const res = await register(body).expect(201);
    return { token: res.body.data.token, user: res.body.data.user, body };
  };
  const patch = (token, data) => request(app).patch(api('/users/me/profile')).set(...bearer(token)).send(data);
  const upload = (token, purpose, filename = 'file.png') =>
    request(app).post(api(`/upload?purpose=${purpose}`)).set(...bearer(token)).attach('file', PNG, { filename, contentType: 'image/png' });

  it('needs a signed-in person', async () => {
    await request(app).patch(api('/users/me/profile')).send({ phone: '+233000' }).expect(401);
  });

  it('lets a seeker fill in their profile step by step and moves the percentage', async () => {
    const { token, user } = await signUp();
    let res = await patch(token, { country: 'Ghana', city: 'Accra', phone: '+233000000' }).expect(200);
    expect(res.body.data.profileCompletion.percent).toBe(40);

    res = await patch(token, { university: 'Test University', education: [{ degree: 'BSc Computer Science', institution: 'Test University', duration: '2026' }] }).expect(200);
    expect(res.body.data.profileCompletion.percent).toBe(60);

    res = await patch(token, { profession: 'Data Analyst', technicalSkills: ['SQL', 'Excel'], softSkills: ['Teamwork'], preferredCountries: ['Canada'] }).expect(200);
    expect(res.body.data.profileCompletion.percent).toBe(80);
    expect(res.body.data.seeker.profession).toBe('Data Analyst');

    const stored = await SeekerProfile.findOne({ userId: user.id });
    expect(JSON.parse(stored.technicalSkills)).toEqual(['SQL', 'Excel']);
    expect(JSON.parse(stored.education)).toHaveLength(1);
    expect(JSON.parse(stored.preferredCountries)).toEqual(['Canada']);
  });

  it('saves a CV the person uploaded, deletes the one it replaces, and refuses anything else', async () => {
    const { token, user } = await signUp();
    const first = (await upload(token, 'cvs', 'cv1.png').expect(200)).body.data;
    const res = await patch(token, { resumeUrl: first.url }).expect(200);
    expect(res.body.data.profileCompletion.missing).not.toContain('cv');

    const second = (await upload(token, 'cvs', 'cv2.png').expect(200)).body.data;
    await patch(token, { resumeUrl: second.url }).expect(200);
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const exists = (file) => fs.access(path.join(uploadRoot(), file)).then(() => true, () => false);
    expect(await exists(`${first.publicId}.png`)).toBe(false);
    expect(await exists(`${second.publicId}.png`)).toBe(true);

    const other = await signUp();
    const theirs = (await upload(other.token, 'cvs').expect(200)).body.data;
    const avatar = (await upload(token, 'avatars').expect(200)).body.data;
    for (const bad of ['https://example.com/cv.pdf', theirs.url, avatar.url]) {
      expect((await patch(token, { resumeUrl: bad })).status).toBe(400);
    }
    expect((await SeekerProfile.findOne({ userId: user.id })).resumeUrl).toBe(second.url);
  });

  it('lets a hirer fill in company details, and refuses seeker-only fields for a hirer and hirer-only fields for a seeker', async () => {
    const hirer = await signUp({ role: 'hirer', email: email('hirer') });
    const res = await patch(hirer.token, { companyName: 'Test Company Ltd', industry: 'Technology', location: 'Accra, Ghana', companySize: '11-50', recruiterRole: 'HR Manager', recruiterPhone: '+233000' }).expect(200);
    expect(res.body.data.profileCompletion).toMatchObject({ percent: 75, missing: ['verification'] });
    expect(res.body.data.hirer.companyName).toBe('Test Company Ltd');
    expect((await patch(hirer.token, { university: 'Test University' })).status).toBe(400);

    const seeker = await signUp();
    expect((await patch(seeker.token, { companyName: 'Nope' })).status).toBe(400);
    expect((await patch(seeker.token, { role: 'admin' })).status).toBe(400);
  });

  it('changes the name everywhere it is shown, and keeps the admin Database record in step', async () => {
    const { token, user } = await signUp();
    await patch(token, { firstName: 'Renamed', phone: '+233111', country: 'Nigeria', university: 'Test University' }).expect(200);
    const stored = await User.findById(user.id);
    expect(stored).toMatchObject({ name: 'Renamed Person', firstName: 'Renamed', lastName: 'Person' });
    const record = await Beneficiary.findOne({ userId: user.id });
    expect(record).toMatchObject({ fullName: 'Renamed Person', country: 'Nigeria', institution: 'Test University' });
    expect(record.phone).toBe('+233111');
  });

  it('lets an older account add its date of birth once, but nobody change it afterwards', async () => {
    const legacy = await register({ name: 'Older App', email: email('older'), password: PASSWORD, role: 'seeker' }).expect(201);
    const token = legacy.body.data.token;
    expect((await patch(token, { dateOfBirth: yearsAgo(10) })).status).toBe(400);
    const set = await patch(token, { dateOfBirth: '1990-03-04' }).expect(200);
    expect(set.body.data.dateOfBirth).toBe('1990-03-04T00:00:00.000Z');
    expect(set.body.data.profileCompletion.missing).not.toContain('basics');
    const again = await patch(token, { dateOfBirth: '2005-03-04' });
    expect(again.status).toBe(400);
    expect((await User.findById(legacy.body.data.user.id)).dateOfBirth.toISOString()).toBe('1990-03-04T00:00:00.000Z');
  });

  it('can clear gender, and keeps date of birth and gender out of what other people see', async () => {
    const { token, user } = await signUp();
    await patch(token, { gender: null }).expect(200);
    expect((await User.findById(user.id)).gender).toBeUndefined();
    const channelMembers = await request(app).get(api('/seekers')).set(...bearer(token));
    expect(JSON.stringify(channelMembers.body)).not.toContain('dateOfBirth');
  });

  it('writes an audit record that names the fields but not their values', async () => {
    const { AuditLog } = await import('../src/models/User.js');
    const { token, user } = await signUp();
    await patch(token, { phone: '+233999888777' }).expect(200);
    const audit = await AuditLog.findOne({ action: 'profile.update', resourceId: user.id });
    expect(audit.metadata).toEqual({ fields: ['phone'] });
    expect(JSON.stringify(audit)).not.toContain('233999888777');
  });
});

describe('applying with a saved CV', () => {
  const listing = () => Opportunity.create({
    title: 'Test Fellowship', company: 'Test Foundation', type: 'fellowship', description: 'A fake listing for tests.', location: 'Remote', status: 'published',
  });
  const upload = (token) => request(app).post(api('/upload?purpose=cvs')).set(...bearer(token)).attach('file', PNG, { filename: 'cv.png', contentType: 'image/png' });

  it('sends the CV saved on the profile along with the application, without the app sending it again', async () => {
    const res = await register(newSeeker()).expect(201);
    const token = res.body.data.token;
    const cv = (await upload(token).expect(200)).body.data;
    await request(app).patch(api('/users/me/profile')).set(...bearer(token)).send({ resumeUrl: cv.url }).expect(200);

    const opp = await listing();
    await request(app).post(api(`/opportunities/${opp._id}/applicants`)).set(...bearer(token)).send({ name: 'Test Person' }).expect(201);
    expect((await Applicant.findOne({ opportunityId: opp._id })).resumeUrl).toBe(cv.url);
  });

  it('still accepts an application from someone with no CV yet', async () => {
    const res = await register(newSeeker()).expect(201);
    const opp = await listing();
    await request(app).post(api(`/opportunities/${opp._id}/applicants`)).set(...bearer(res.body.data.token)).send({ name: 'Test Person' }).expect(201);
    expect((await Applicant.findOne({ opportunityId: opp._id })).resumeUrl).toBeUndefined();
  });
});

describe('account deletion', () => {
  it('clears the date of birth, gender and names', async () => {
    const body = newSeeker();
    const res = await register(body).expect(201);
    await request(app).delete(api('/auth/me')).set(...bearer(res.body.data.token)).send({ password: PASSWORD, confirmation: 'DELETE MY ACCOUNT' }).expect(200);
    const stored = await User.findById(res.body.data.user.id);
    expect(stored.dateOfBirth).toBeUndefined();
    expect(stored.gender).toBeUndefined();
    expect(stored.firstName).toBeUndefined();
    expect(stored.lastName).toBeUndefined();
  });
});
