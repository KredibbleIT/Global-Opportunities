import crypto from 'crypto';
import { env } from '../config/env.js';
import { ApiError } from '../utils/http.js';
import { Resend } from 'resend';
import logger from './logger.js';

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;

/** A deployed API (staging or production) must actually send email; tests and local dev may skip it. */
const isDeployed = env.appEnv === 'staging' || env.appEnv === 'production';

export const createVerificationCode = () => {
  // SEC-062: Use cryptographically secure RNG for verification codes
  return crypto.randomInt(0, 1000000).toString().padStart(6, '0');
};

export const hashVerificationCode = (code) => {
  // SEC-101: Keyed HMAC with server secret prevents offline brute-forcing of 6-digit codes
  return crypto.createHmac('sha256', env.jwtSecret).update(String(code)).digest('hex');
};

/**
 * Emails a sign-up verification code. On a deployed API a missing Resend key or a
 * rejected email is an error the caller sees (GOD-T64): the app used to say "we
 * sent a code" when nothing was sent. Locally and in tests a missing key only logs.
 * @param {string} email - recipient
 * @param {string} code - the 6-digit code
 * @returns {Promise<{ success: true } | undefined>}
 */
export const sendVerificationEmail = async (email, code) => {
  if (!resend) {
    if (isDeployed) {
      logger.error('Resend is not configured: RESEND_API_KEY is missing, so verification codes cannot be emailed');
      throw new ApiError(503, 'We could not send the verification email. Please try again later.');
    }
    logger.warn('Resend not configured, skipping email send');
    return;
  }

  try {
    // Resend v6 reports a rejected email (e.g. an unverified sending domain) in
    // `error` instead of throwing, so check it.
    const result = await resend.emails.send({
      from: env.resendFromEmail || 'noreply@kredibble.app',
      to: email,
      subject: 'Your Kredibble verification code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Your verification code</h2>
          <p>Use this code to verify your email address:</p>
          <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 32px; letter-spacing: 8px; font-weight: bold; color: #1a1a1a;">
            ${code}
          </div>
          <p style="color: #666; font-size: 14px;">This code expires in ${env.emailVerificationCodeTtlMinutes} minutes.</p>
          <p style="color: #666; font-size: 14px;">If you didn't request this, please ignore this email.</p>
        </div>
      `,
    });
    if (result?.error) throw new Error(result.error.message);
    return { success: true };
  } catch (error) {
    logger.error({ error: error.message, email }, 'Failed to send verification email');
    // 503, not 502: Cloudflare replaces an origin 502 with its own "error code: 502" page,
    // so the app showed "Request failed with status 502" instead of this message.
    throw new ApiError(503, 'We could not send the verification email. Please try again later.');
  }
};

/**
 * Emails a password-reset code. The forgot-password route answers 202 either way
 * (it must not reveal whether an account exists) and calls this in the background,
 * so a failure here can only be logged: on a deployed API a missing key is an error
 * in the logs, not a quiet warning (GOD-T64).
 * @param {string} email - recipient
 * @param {string} code - the 6-digit code
 * @param {number} ttlMinutes - how long the code is valid
 */
export const sendPasswordResetEmail = async (email, code, ttlMinutes) => {
  if (!resend) {
    if (isDeployed) {
      throw new Error('Resend is not configured: RESEND_API_KEY is missing, so password reset codes cannot be emailed');
    }
    logger.warn('Resend not configured, skipping password reset email');
    return;
  }

  const result = await resend.emails.send({
    from: env.resendFromEmail || 'noreply@kredibble.app',
    to: email,
    subject: 'Reset your Kredibble password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a1a;">Reset your password</h2>
        <p>Enter this code in the Kredibble app to choose a new password:</p>
        <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 32px; letter-spacing: 8px; font-weight: bold; color: #1a1a1a;">
          ${code}
        </div>
        <p style="color: #666; font-size: 14px;">This code expires in ${ttlMinutes} minutes.</p>
        <p style="color: #666; font-size: 14px;">If you didn't ask to reset your password, ignore this email. Your password won't change.</p>
      </div>
    `,
  });
  if (result?.error) throw new Error(result.error.message);
};

/**
 * BE-028: team invite email. Best-effort like the other senders. Returns
 * `{ skipped: true }` when no email service is configured so the caller can
 * return the one-time invite link to the Super Admin instead.
 */
export const sendInviteEmail = async (email, name, inviteUrl, expiresAt) => {
  if (!resend) {
    logger.warn('Resend not configured, skipping invite email');
    return { skipped: true };
  }

  try {
    const result = await resend.emails.send({
      from: env.resendFromEmail || 'noreply@kredibble.app',
      to: email,
      subject: 'You are invited to the Kredibble team',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Team invitation</h2>
          <p>Hi ${name},</p>
          <p>You have been invited to join the Kredibble team. Open this link to set your password (single use, expires ${expiresAt}):</p>
          <p><a href="${inviteUrl}">${inviteUrl}</a></p>
          <p style="color: #666; font-size: 14px;">If you were not expecting this, please ignore this email.</p>
        </div>
      `,
    });
    if (result?.error) throw new Error(result.error.message);
    return { skipped: false };
  } catch (error) {
    // Best-effort: a bounced invite must not fail the creation. The caller
    // falls back to returning the one-time link to the Super Admin instead.
    logger.error({ error: error.message, email }, 'Failed to send invite email');
    return { skipped: true, emailFailed: true };
  }
};
