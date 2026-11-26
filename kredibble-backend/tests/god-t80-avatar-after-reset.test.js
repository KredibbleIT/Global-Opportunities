import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../src/app.js';
import { User, PasswordResetCode } from '../src/models/User.js';
import { hashVerificationCode } from '../src/lib/email.js';

// GOD-T80 (task sheet, 16 Nov 2026): "The profile image is missing after password reset." Until 21 Nov (#206) the app kept the picture
// only on the phone, so signing in again after a reset showed none. The picture is now saved on the account (`avatarUrl`); these tests
// pin that a reset leaves it alone and that the sign-in and "me" answers the app builds its profile from carry it.
const PASSWORD = 'OldPassw0rd-x';
const NEW_PASSWORD = 'NewPassw0rd-y';
const KNOWN_CODE = '123456';
const AVATAR = 'https://api.test/uploads/kredibble/avatars/0123456789abcdef0123456789abcdef.jpg';

describe('GOD-T80: the profile picture survives a password reset', () => {
  it('a reset keeps the picture, and signing in again returns it', async () => {
    const user = await User.create({
      name: 'Picture Person', email: 'picture@example.com', role: 'seeker', emailVerified: true,
      passwordHash: await bcrypt.hash(PASSWORD, 12), avatarUrl: AVATAR,
    });

    expect((await request(app).post('/api/v1/auth/password/forgot').send({ email: 'picture@example.com' })).status).toBe(202);
    await PasswordResetCode.updateOne({ userId: user._id }, { codeHash: hashVerificationCode(KNOWN_CODE) });
    const reset = await request(app).post('/api/v1/auth/password/reset').send({ email: 'picture@example.com', code: KNOWN_CODE, newPassword: NEW_PASSWORD });
    expect(reset.status).toBe(200);

    expect((await User.findById(user._id).lean()).avatarUrl).toBe(AVATAR);

    const login = await request(app).post('/api/v1/auth/login').send({ email: 'picture@example.com', password: NEW_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.data.user.avatarUrl).toBe(AVATAR);

    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${login.body.data.token}`);
    expect(me.status).toBe(200);
    expect((me.body.data.user ?? me.body.data).avatarUrl).toBe(AVATAR);
  });
});
