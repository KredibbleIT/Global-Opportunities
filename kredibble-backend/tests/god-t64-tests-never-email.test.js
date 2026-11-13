import { jest } from '@jest/globals';

// GOD-T64: Resend's log showed 47 failed sends to reset@example.com and similar
// test addresses: local test runs were loading a .env that held the production
// key. Under NODE_ENV=test the key is ignored, so tests can never send email.
describe('GOD-T64: tests never send real email', () => {
  const originalKey = process.env.RESEND_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
  });

  it('ignores RESEND_API_KEY when NODE_ENV is test', async () => {
    process.env.RESEND_API_KEY = 're_production_key_in_a_local_env';
    jest.resetModules();
    const { env } = await import('../src/config/env.js');

    expect(process.env.NODE_ENV).toBe('test');
    expect(env.resendApiKey).toBeUndefined();
    expect(env.emailEnabled).toBe(false);
  });
});
