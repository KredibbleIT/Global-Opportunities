import { jest } from '@jest/globals';

// GOD-T64: the app said "we sent a code" when no email went out. These tests load
// lib/email.js against a stand-in env and Resend client, so no real email is sent.
const mockEnv = {
  appEnv: 'test',
  nodeEnv: 'test',
  resendApiKey: undefined,
  resendFromEmail: 'verify@example.com',
  emailVerificationCodeTtlMinutes: 10,
  jwtSecret: 'test-secret',
};
const mockSend = jest.fn();

jest.unstable_mockModule('../src/config/env.js', () => ({ env: mockEnv }));
jest.unstable_mockModule('resend', () => ({
  Resend: class {
    constructor() {
      this.emails = { send: mockSend };
    }
  },
}));

/** Loads a fresh copy of lib/email.js with the env as currently set. */
const loadEmail = async ({ appEnv, resendApiKey }) => {
  Object.assign(mockEnv, { appEnv, resendApiKey });
  jest.resetModules();
  return import('../src/lib/email.js');
};

describe('GOD-T64: verification and reset emails never fail silently on a deployed API', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it('a deployed API without a Resend key refuses to pretend it sent a verification code', async () => {
    const { sendVerificationEmail } = await loadEmail({ appEnv: 'production', resendApiKey: undefined });
    await expect(sendVerificationEmail('a@example.com', '123456')).rejects.toMatchObject({ status: 503 });
  });

  it('a deployed API without a Resend key reports the password reset email as failed', async () => {
    const { sendPasswordResetEmail } = await loadEmail({ appEnv: 'staging', resendApiKey: undefined });
    await expect(sendPasswordResetEmail('a@example.com', '123456', 10)).rejects.toThrow(/RESEND_API_KEY is missing/);
  });

  it('local development and tests still skip quietly without a key', async () => {
    const { sendVerificationEmail } = await loadEmail({ appEnv: 'development', resendApiKey: undefined });
    await expect(sendVerificationEmail('a@example.com', '123456')).resolves.toBeUndefined();
  });

  it('an email Resend rejects (returned as an error, not thrown) is a failure', async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: 'The domain is not verified' } });
    const { sendVerificationEmail } = await loadEmail({ appEnv: 'production', resendApiKey: 're_test' });
    // 503 so the message survives Cloudflare, which replaces origin 502 responses.
    await expect(sendVerificationEmail('a@example.com', '123456')).rejects.toMatchObject({
      status: 503,
      message: 'We could not send the verification email. Please try again later.',
    });
  });

  it('an email Resend accepts is a success', async () => {
    mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    const { sendVerificationEmail } = await loadEmail({ appEnv: 'production', resendApiKey: 're_test' });
    await expect(sendVerificationEmail('a@example.com', '123456')).resolves.toEqual({ success: true });
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@example.com' }));
  });
});
