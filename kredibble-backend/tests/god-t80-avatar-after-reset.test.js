import fs from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { app } from '../src/app.js';
import { User, PasswordResetCode } from '../src/models/User.js';
import { hashVerificationCode } from '../src/lib/email.js';
import { uploadRoot } from '../src/lib/storage.js';

// GOD-T80 (task sheet, 16 Nov 2026): "The profile image is missing after password reset."
// Then, the app kept the picture only on the phone, so signing out to reset lost it; since 21 Nov (#206) it is saved on the
// account (User.avatarUrl). This pins the whole path the app takes: set a picture, forget the password, reset it, sign in
// again; the account the app receives still carries the picture, and the file is still there. ALL DATA IS FAKE.

const api = (route) => `/api/v1${route}`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const OLD_PASSWORD = 'OldPassw0rd-x';
const NEW_PASSWORD = 'NewPassw0rd-y';
const KNOWN_CODE = '123456';
const exists = (file) => fs.access(file).then(() => true, () => false);

describe('GOD-T80: the profile picture survives a password reset', () => {
  it.each(['seeker', 'hirer'])('a %s signs in after a reset and still has their picture', async (role) => {
    const email = `t80-${role}-${Date.now()}@example.com`;
    const user = await User.create({ name: 'Reset Person', email, role, passwordHash: await bcrypt.hash(OLD_PASSWORD, 12) });

    const first = await request(app).post(api('/auth/login')).send({ email, password: OLD_PASSWORD }).expect(200);
    const bearer = ['Authorization', `Bearer ${first.body.data.token}`];
    const uploaded = (await request(app).post(api('/upload?purpose=avatars')).set(...bearer)
      .attach('file', PNG, { filename: 'me.png', contentType: 'image/png' }).expect(200)).body.data;
    await request(app).patch(api('/users/me/avatar')).set(...bearer).send({ avatarUrl: uploaded.url }).expect(200);

    await request(app).post(api('/auth/password/forgot')).send({ email }).expect(202);
    await PasswordResetCode.updateOne({ userId: user._id }, { codeHash: hashVerificationCode(KNOWN_CODE) });
    await request(app).post(api('/auth/password/reset')).send({ email, code: KNOWN_CODE, newPassword: NEW_PASSWORD }).expect(200);

    const again = await request(app).post(api('/auth/login')).send({ email, password: NEW_PASSWORD }).expect(200);
    expect(again.body.data.user.avatarUrl).toBe(uploaded.url);
    const me = await request(app).get(api('/auth/me')).set('Authorization', `Bearer ${again.body.data.token}`).expect(200);
    expect(me.body.data.avatarUrl ?? me.body.data.user?.avatarUrl).toBe(uploaded.url);
    expect(await exists(path.join(uploadRoot(), `${uploaded.publicId}.png`))).toBe(true);
  });
});
