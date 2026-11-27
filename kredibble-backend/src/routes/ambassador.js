import { Router } from 'express';
import { asyncHandler, itemResponse, ApiError } from '../utils/http.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createAmbassadorRequestSchema } from '../schemas/ambassador.js';
import { User } from '../models/User.js';
import { SeekerProfile, HirerAccount } from '../models/Profiles.js';
import { Ambassador, AmbassadorRequest } from '../models/AdminPortal.js';
import { auditReq, AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../lib/audit.js';

export const ambassadorRouter = Router();

// After a rejection the user may apply again, but not straight away.
const REAPPLY_AFTER_DAYS = 7;

export const toRequestResponse = (doc) => doc && ({
  id: String(doc._id),
  userId: String(doc.userId?._id || doc.userId),
  role: doc.role,
  name: doc.name,
  email: doc.email,
  phone: doc.phone,
  country: doc.country,
  city: doc.city,
  profession: doc.profession,
  organisation: doc.organisation,
  motivation: doc.motivation,
  status: doc.status,
  reviewNote: doc.reviewNote,
  reviewedAt: doc.reviewedAt,
  channelId: doc.channelId ? String(doc.channelId) : undefined,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

/** Build the snapshot the admin reviews from the user's own records (never from the request body). */
const buildSnapshot = async (user) => {
  if (user.role === 'hirer') {
    const hirer = await HirerAccount.findOne({ userId: user._id }).lean();
    return {
      organisation: hirer?.companyName,
      country: undefined,
      city: hirer?.location,
      phone: hirer?.recruiterPhone,
      profession: hirer?.recruiterRole || 'Recruiter',
    };
  }
  const seeker = await SeekerProfile.findOne({ userId: user._id }).lean();
  return {
    organisation: seeker?.university,
    country: seeker?.country,
    city: seeker?.city,
    phone: seeker?.phone,
    profession: seeker?.profession,
  };
};

const ownAmbassador = async (userOrId) => {
  if (!userOrId) return null;
  const user = typeof userOrId === 'object' && userOrId._id
    ? userOrId
    : await User.findById(userOrId).select('email').lean();
  if (!user) return null;
  const email = user.email ? String(user.email).trim().toLowerCase() : undefined;
  return Ambassador.findOne({
    $or: [
      { linkedUserId: user._id },
      ...(email ? [{ email }] : []),
    ],
    status: { $in: ['onboarding', 'active'] },
  }).lean();
};

ambassadorRouter.post('/', requireAuth, validate(createAmbassadorRequestSchema), asyncHandler(async (req, res) => {
  const user = await User.findById(req.auth.sub);
  if (!user || !['seeker', 'hirer'].includes(user.role)) throw new ApiError(403, 'Only seekers and hirers can apply to become an ambassador');

  if (await ownAmbassador(user)) throw new ApiError(409, 'You are already a Global Opportunity Desk’s ambassador');
  if (await AmbassadorRequest.exists({ userId: user._id, status: 'pending' })) {
    throw new ApiError(409, 'You already have a pending ambassador request');
  }
  const lastRejected = await AmbassadorRequest.findOne({ userId: user._id, status: 'rejected' }).sort({ reviewedAt: -1 }).lean();
  if (lastRejected?.reviewedAt && Date.now() - new Date(lastRejected.reviewedAt).getTime() < REAPPLY_AFTER_DAYS * 86400000) {
    throw new ApiError(429, `You can apply again ${REAPPLY_AFTER_DAYS} days after a decision`);
  }

  const snapshot = await buildSnapshot(user);
  let request;
  try {
    request = await AmbassadorRequest.create({
      userId: user._id,
      role: user.role,
      name: user.name,
      email: user.email,
      motivation: req.body.motivation || undefined,
      ...snapshot,
    });
  } catch (err) {
    // The partial unique index closes the race between two simultaneous taps.
    if (err?.code === 11000) throw new ApiError(409, 'You already have a pending ambassador request');
    throw err;
  }

  await auditReq(req, {
    action: AUDIT_ACTIONS.AMBASSADOR_REQUEST,
    resourceType: AUDIT_RESOURCE_TYPES.AMBASSADOR_REQUEST,
    resourceId: request._id,
    outcome: 'success',
    metadata: { role: user.role },
  });
  res.status(201).json({ data: toRequestResponse(request) });
}));

/** A month as YYYY-MM: the one asked for when it is valid, otherwise this month. */
const monthOf = (value) => (typeof value === 'string' && /^\d{4}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 7));

/**
 * The month's leaderboard, from the same calculation as the admin's Leaderboard page (calculateLeaderboard in admin-api.js:
 * verified sign-ups, then referred clicks, then shares). Loaded when needed because admin-api.js imports this file.
 */
const monthLeaderboard = async (month) => {
  const { calculateLeaderboard } = await import('./admin-api.js');
  return calculateLeaderboard(month);
};

/** What an ambassador sees of a leaderboard row: no email, phone or staff notes. */
const leaderboardRow = (entry, ownId) => ({
  rank: entry.rank,
  name: entry.ambassador?.name || entry.name || 'Ambassador',
  campus: entry.ambassador?.campus || entry.campus || '',
  country: entry.ambassador?.country || entry.country || '',
  tier: entry.ambassador?.tier || entry.tier || '',
  signups: entry.signups,
  clicks: entry.clicks,
  shares: entry.shares,
  isYou: Boolean(ownId) && String(entry.ambassador?.id) === ownId,
});

/**
 * GOD-T106: the signed-in ambassador's results for a month (?month=YYYY-MM, default this month): rank among the month's
 * ambassadors, verified sign-ups, referred clicks and shares, and their referral code. Only for a current ambassador.
 */
ambassadorRouter.get('/me/results', requireAuth, asyncHandler(async (req, res) => {
  const ambassador = await ownAmbassador(req.auth.sub);
  if (!ambassador) throw new ApiError(403, 'Only Global Opportunity Desk ambassadors have results');
  const month = monthOf(req.query.month);
  const entries = await monthLeaderboard(month);
  const ownId = String(ambassador._id);
  const mine = entries.find((entry) => String(entry.ambassador?.id) === ownId);
  itemResponse(res, {
    month,
    rank: mine?.rank ?? null,
    of: entries.length,
    signups: mine?.signups ?? 0,
    clicks: mine?.clicks ?? 0,
    shares: mine?.shares ?? 0,
    referralCode: ambassador.referralCode || null,
    tier: ambassador.tier || null,
  });
}));

/**
 * GOD-T106: the month's ambassador leaderboard for ambassadors in the app (?month=YYYY-MM, default this month), top 50, with the
 * caller's own row marked. Names, campus, country, tier and counts only. Only for a current ambassador.
 */
ambassadorRouter.get('/leaderboard', requireAuth, asyncHandler(async (req, res) => {
  const ambassador = await ownAmbassador(req.auth.sub);
  if (!ambassador) throw new ApiError(403, 'The leaderboard is for Global Opportunity Desk ambassadors');
  const month = monthOf(req.query.month);
  const entries = await monthLeaderboard(month);
  const ownId = String(ambassador._id);
  const rows = entries.slice(0, 50).map((entry) => leaderboardRow(entry, ownId));
  const mine = entries.find((entry) => String(entry.ambassador?.id) === ownId);
  itemResponse(res, {
    month,
    total: entries.length,
    rows,
    // Below the top 50, the caller still sees their own place.
    you: mine && !rows.some((row) => row.isYou) ? leaderboardRow(mine, ownId) : null,
  });
}));

ambassadorRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const [latest, ambassador] = await Promise.all([
    AmbassadorRequest.findOne({ userId: req.auth.sub }).sort({ createdAt: -1 }).lean(),
    ownAmbassador(req.auth.sub),
  ]);
  itemResponse(res, {
    isAmbassador: Boolean(ambassador),
    request: latest ? toRequestResponse(latest) : null,
  });
}));
