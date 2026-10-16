import { Router } from 'express';
import { env } from '../config/env.js';
import { getAssistantReply } from '../lib/ai.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { assistantChatSchema } from '../schemas/assistant.js';
import { ApiError, asyncHandler, itemResponse } from '../utils/http.js';
import { aiLimiter } from '../lib/rate-limiters.js';
import { auditReq, AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../lib/audit.js';
import { consumeAssistantBudget } from '../models/AiUsage.js';

export const assistantRouter = Router();

assistantRouter.post(
  '/chat',
  // BE-025: authenticate BEFORE the limiter so aiLimiter keys on
  // req.auth.sub (a real per-user budget) instead of a shared IP bucket, and
  // so unauthenticated callers can never consume the AI budget at all.
  requireAuth,
  aiLimiter,
  // BE-025: Zod bounds (roles, counts, sizes). `provider`/`systemPrompt`
  // are undeclared so `validate` strips them: the server alone chooses the
  // provider (env.aiProvider) and the system prompt (env.aiSystemPrompt).
  validate(assistantChatSchema),
  asyncHandler(async (req, res) => {
    if (!env.aiEnabled) {
      throw new ApiError(503, 'AI assistant service is currently unavailable or not enabled');
    }
    const messages = req.body.messages || [{ role: 'user', content: req.body.message }];
    const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    // BE-025: daily per-user cost cap, consumed before the provider call so
    // retry floods cannot blow past it. Counts attempts, not successes.
    const budget = await consumeAssistantBudget(req.auth.sub, env.aiDailyMessageLimit);
    if (!budget.allowed) {
      await auditReq(req, {
        action: AUDIT_ACTIONS.ASSISTANT_CHAT,
        resourceType: AUDIT_RESOURCE_TYPES.ASSISTANT,
        outcome: 'failure',
        metadata: { reason: 'daily_budget', used: budget.used, limit: budget.limit },
      });
      throw new ApiError(429, 'Daily AI message budget reached, please try again tomorrow');
    }
    const reply = await getAssistantReply({ provider: env.aiProvider, messages });
    // PII-free: counts only, never message content.
    await auditReq(req, {
      action: AUDIT_ACTIONS.ASSISTANT_CHAT,
      resourceType: AUDIT_RESOURCE_TYPES.ASSISTANT,
      outcome: 'success',
      metadata: {
        provider: reply.provider,
        model: reply.model,
        messageCount: messages.length,
        totalChars,
        budgetUsed: budget.used,
      },
    });
    itemResponse(res, reply);
  }),
);
