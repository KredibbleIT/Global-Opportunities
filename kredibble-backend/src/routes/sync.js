import { Router } from 'express';
import { asyncHandler, ApiError } from '../utils/http.js';
import { validate } from '../middleware/validate.js';
import { webhookLimiter } from '../lib/rate-limiters.js';
import { verifyWebhookRequest } from '../lib/website-sync.js';
import { applySyncEvent } from '../lib/website-sync.js';
import { websiteWebhookSchema } from '../schemas/website-sync.js';
import { WEBHOOK_SIGNATURE_HEADER, WEBHOOK_TIMESTAMP_HEADER } from '../lib/website-sync.js';

export const syncRouter = Router();

/**
 * BE-026: inbound website webhook. Authentication is the HMAC signature, not
 * a user token, so this route intentionally carries no requireAuth — the
 * manifest sweep treats it as guarded because every verification failure
 * (including an unconfigured secret) answers 401 without saying why.
 */
const verifyWebsiteWebhook = (req, _res, next) => {
  try {
    verifyWebhookRequest({
      rawBody: req.rawBody || '',
      signature: req.get(WEBHOOK_SIGNATURE_HEADER),
      timestamp: req.get(WEBHOOK_TIMESTAMP_HEADER),
    });
    next();
  } catch (error) {
    next(error instanceof ApiError ? error : new ApiError(401, 'Invalid webhook signature'));
  }
};

syncRouter.post(
  '/website-webhook',
  webhookLimiter,
  verifyWebsiteWebhook,
  validate(websiteWebhookSchema),
  asyncHandler(async (req, res) => {
    const { eventId, resource, externalId, attributes } = req.body;
    const result = await applySyncEvent({
      eventId,
      resource,
      externalId,
      attributes,
      source: 'webhook',
      auditContext: req.auditContext,
    });
    if (result.duplicate) {
      return res.json({ data: { status: 'duplicate', eventId } });
    }
    res.status(201).json({ data: { status: 'applied', eventId, created: result.created } });
  }),
);
