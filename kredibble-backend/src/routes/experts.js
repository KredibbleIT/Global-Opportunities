import { Router } from 'express';
import mongoose from 'mongoose';
import { asyncHandler, itemResponse, listResponse, parsePagination, ApiError, notFound } from '../utils/http.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { searchLimiter } from '../lib/rate-limiters.js';
import { User } from '../models/User.js';
import { SeekerProfile, ExpertRating } from '../models/Profiles.js';
import { Applicant, Opportunity } from '../models/Platform.js';
import { auditReq, AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../lib/audit.js';
import { expertApplySchema, expertPreferencesSchema, expertRatingSchema } from '../schemas/experts.js';
import { expertMissing, expertOwnState, publicExpert } from '../lib/experts.js';

/**
 * The Expert listing: seekers who asked to be shown, once an admin has approved them.
 *   GET    /experts              the approved experts (search and filters), for seekers, hirers and admins
 *   GET    /experts/me           where the signed-in seeker stands (status, what is missing, what their profile shows)
 *   POST   /experts/me/apply     apply to be listed (needs a profession, a summary and a skill)
 *   PATCH  /experts/me           change which contact details show
 *   POST   /experts/me/withdraw  leave the listing
 *   GET    /experts/:id          one approved expert's profile (the owner and admins can also open their own)
 *   POST   /experts/:id/rating   rate an expert 1 to 5 stars (one rating per person; rating again replaces it)
 */
export const expertsRouter = Router();

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const alternation = (value) => {
  const terms = String(value || '').split(',').map((term) => escapeRegex(term.trim())).filter(Boolean);
  return terms.length ? new RegExp(`^(?:${terms.join('|')})$`, 'i') : undefined;
};

const requireSeeker = (req) => {
  if (req.auth?.role !== 'seeker') throw new ApiError(403, 'Only seekers can be listed as experts');
};

const ownProfile = (req) => SeekerProfile.findOne({ userId: req.auth.sub });

expertsRouter.use(requireAuth);

expertsRouter.get('/', searchLimiter, asyncHandler(async (req, res) => {
  const { q, profession, experience, country, city, rating, skills } = req.query;
  for (const value of [q, profession, experience, country, city, rating, skills]) {
    if (value !== undefined && typeof value !== 'string') throw new ApiError(400, 'Invalid query parameters');
  }
  const { page, limit, skip } = parsePagination(req.query);
  const filter = { expertStatus: 'approved' };

  const professions = alternation(profession);
  if (professions) filter.profession = professions;
  const levels = alternation(experience);
  if (levels) filter.experienceLevel = levels;
  const countries = alternation(country);
  if (countries) filter.country = countries;
  if (city && city.trim()) filter.city = { $regex: escapeRegex(city.trim()), $options: 'i' };

  const skillTerms = String(skills || '').split(',').map((term) => escapeRegex(term.trim())).filter(Boolean);
  if (skillTerms.length) filter.technicalSkills = { $regex: skillTerms.join('|'), $options: 'i' };

  const stars = String(rating || '').split(',').map(Number).filter((value) => value >= 1 && value <= 5);
  const and = [];
  if (stars.length) and.push({ $or: stars.map((star) => ({ expertRatingAverage: star === 5 ? { $gte: 5 } : { $gte: star, $lt: star + 1 } })) });

  const text = String(q || '').trim();
  if (text) {
    const pattern = { $regex: escapeRegex(text), $options: 'i' };
    const owners = await User.find({ name: pattern }).select('_id').limit(500).lean();
    and.push({ $or: [{ profession: pattern }, { bio: pattern }, { technicalSkills: pattern }, { userId: { $in: owners.map((owner) => owner._id) } }] });
  }
  if (and.length) filter.$and = and;

  const [rows, total] = await Promise.all([
    SeekerProfile.find(filter).sort({ expertRatingAverage: -1, expertRatingCount: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    SeekerProfile.countDocuments(filter),
  ]);
  const users = await User.find({ _id: { $in: rows.map((row) => row.userId) } }).select('name email avatarUrl').lean();
  const byId = new Map(users.map((user) => [String(user._id), user]));
  listResponse(res, rows.map((row) => publicExpert(row, byId.get(String(row.userId)))), total, page, limit);
}));

// The choices the filter and the search suggestions offer: the professions and countries of the experts who are listed (most common first).
expertsRouter.get('/facets', asyncHandler(async (req, res) => {
  const common = async (field) => (await SeekerProfile.aggregate([
    { $match: { expertStatus: 'approved', [field]: { $nin: [null, ''] } } },
    { $group: { _id: { $toLower: `$${field}` }, label: { $first: `$${field}` }, count: { $sum: 1 } } },
    { $sort: { count: -1, label: 1 } },
    { $limit: 50 },
  ])).map((row) => row.label);
  const [professions, countries] = await Promise.all([common('profession'), common('country')]);
  itemResponse(res, { professions, countries });
}));

expertsRouter.get('/me', asyncHandler(async (req, res) => {
  requireSeeker(req);
  itemResponse(res, expertOwnState(await ownProfile(req)));
}));

expertsRouter.post('/me/apply', validate(expertApplySchema), asyncHandler(async (req, res) => {
  requireSeeker(req);
  const profile = await ownProfile(req);
  if (!profile) throw new ApiError(400, 'Complete your profile first');
  const missing = expertMissing(profile);
  if (missing.length) throw new ApiError(400, `Add your ${missing.join(', ').replace(/, ([^,]*)$/, ' and $1')} to your profile before applying`);
  if (profile.expertStatus === 'pending') throw new ApiError(409, 'Your application is already being reviewed');
  if (profile.expertStatus === 'approved') throw new ApiError(409, 'You are already on the Expert listing');
  if (profile.expertStatus === 'hidden') throw new ApiError(403, 'The team has hidden your listing. Please contact support');

  const { showEmail, showPhone, showWebsite, website } = req.body;
  if (showEmail !== undefined) profile.expertShowEmail = showEmail;
  if (showPhone !== undefined) profile.expertShowPhone = showPhone;
  if (website !== undefined) profile.expertWebsite = website;
  if (showWebsite !== undefined) profile.expertShowWebsite = showWebsite && Boolean(profile.expertWebsite);
  if (profile.expertShowPhone && !profile.phone) profile.expertShowPhone = false;
  profile.expertStatus = 'pending';
  profile.expertAppliedAt = new Date();
  profile.expertReviewNote = undefined;
  await profile.save();

  await auditReq(req, { action: AUDIT_ACTIONS.EXPERT_APPLY, resourceType: AUDIT_RESOURCE_TYPES.EXPERT, resourceId: profile._id, outcome: 'success' });
  res.status(201).json({ data: expertOwnState(profile) });
}));

expertsRouter.patch('/me', validate(expertPreferencesSchema), asyncHandler(async (req, res) => {
  requireSeeker(req);
  const profile = await ownProfile(req);
  if (!profile) throw new ApiError(400, 'Complete your profile first');
  const { showEmail, showPhone, showWebsite, website } = req.body;
  if (showEmail !== undefined) profile.expertShowEmail = showEmail;
  if (showPhone !== undefined) {
    if (showPhone && !profile.phone) throw new ApiError(400, 'Add a phone number to your profile first');
    profile.expertShowPhone = showPhone;
  }
  if (website !== undefined) profile.expertWebsite = website;
  if (showWebsite !== undefined) {
    if (showWebsite && !profile.expertWebsite) throw new ApiError(400, 'Add your website address first');
    profile.expertShowWebsite = showWebsite;
  }
  if (!profile.expertWebsite) profile.expertShowWebsite = false;
  await profile.save();
  itemResponse(res, expertOwnState(profile));
}));

expertsRouter.post('/me/withdraw', asyncHandler(async (req, res) => {
  requireSeeker(req);
  const profile = await ownProfile(req);
  if (!profile || !['pending', 'approved', 'rejected'].includes(profile.expertStatus)) throw new ApiError(409, 'You are not on the Expert listing');
  profile.expertStatus = 'none';
  await profile.save();
  itemResponse(res, expertOwnState(profile));
}));

const loadVisibleExpert = async (req) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Expert');
  const profile = await SeekerProfile.findById(req.params.id);
  if (!profile) throw notFound('Expert');
  const mine = String(profile.userId) === String(req.auth.sub);
  if (profile.expertStatus !== 'approved' && !mine && req.auth.role !== 'admin') throw notFound('Expert');
  return profile;
};

// A hirer opens the profile of someone who applied to one of their listings (listed as an expert or not). Only what the seeker chose to share is
// shown as contact, and a person who is not on the Expert listing cannot be rated from here.
expertsRouter.get('/applicant/:applicantId', asyncHandler(async (req, res) => {
  if (!['hirer', 'admin'].includes(req.auth.role)) throw new ApiError(403, 'Only the hirer of the listing can open an applicant');
  if (!mongoose.isValidObjectId(req.params.applicantId)) throw notFound('Applicant');
  const applicant = await Applicant.findById(req.params.applicantId).lean();
  if (!applicant) throw notFound('Applicant');
  const opportunity = await Opportunity.findById(applicant.opportunityId).select('createdBy hirerId').lean();
  const owns = opportunity && (String(opportunity.createdBy) === req.auth.sub || String(opportunity.hirerId) === req.auth.sub);
  if (!owns && req.auth.role !== 'admin') throw new ApiError(403, 'You do not have permission to view this applicant');
  const profile = await SeekerProfile.findOne({ userId: applicant.seekerId });
  if (!profile) throw notFound('Applicant profile');
  const user = await User.findById(profile.userId).select('name email avatarUrl').lean();
  itemResponse(res, { ...publicExpert(profile, user, { includeDetail: true }), myRating: null, isMe: false, listed: profile.expertStatus === 'approved' });
}));

expertsRouter.get('/:id', asyncHandler(async (req, res) => {
  const profile = await loadVisibleExpert(req);
  const [user, mineRating] = await Promise.all([
    User.findById(profile.userId).select('name email avatarUrl').lean(),
    ExpertRating.findOne({ expertId: profile._id, raterId: req.auth.sub }).select('stars').lean(),
  ]);
  itemResponse(res, { ...publicExpert(profile, user, { includeDetail: true }), myRating: mineRating?.stars ?? null, isMe: String(profile.userId) === String(req.auth.sub), listed: profile.expertStatus === 'approved' });
}));

expertsRouter.post('/:id/rating', validate(expertRatingSchema), asyncHandler(async (req, res) => {
  if (!['seeker', 'hirer'].includes(req.auth.role)) throw new ApiError(403, 'Only seekers and hirers can rate an expert');
  const profile = await loadVisibleExpert(req);
  if (profile.expertStatus !== 'approved') throw notFound('Expert');
  if (String(profile.userId) === String(req.auth.sub)) throw new ApiError(403, 'You cannot rate yourself');

  await ExpertRating.findOneAndUpdate(
    { expertId: profile._id, raterId: req.auth.sub },
    { $set: { stars: req.body.stars } },
    { upsert: true, setDefaultsOnInsert: true },
  );
  const [summary] = await ExpertRating.aggregate([
    { $match: { expertId: profile._id } },
    { $group: { _id: '$expertId', average: { $avg: '$stars' }, count: { $sum: 1 } } },
  ]);
  const average = summary ? Math.round(summary.average * 100) / 100 : 0;
  const count = summary ? summary.count : 0;
  await SeekerProfile.updateOne({ _id: profile._id }, { $set: { expertRatingAverage: average, expertRatingCount: count } });
  itemResponse(res, { rating: Math.round(average * 10) / 10, ratingCount: count, myRating: req.body.stars });
}));
