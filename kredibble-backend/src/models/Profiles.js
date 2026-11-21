import mongoose from 'mongoose';

const seekerProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  profession: { type: String, required: true, index: true },
  university: { type: String, index: true },
  country: { type: String, index: true },
  city: String,
  phone: String,
  rating: { type: Number, default: 0 },
  verified: { type: Boolean, default: false },
  bio: String,
  professionalSummary: String,
  experienceLevel: String,
  technicalSkills: { type: String, default: '[]' },
  softSkills: { type: String, default: '[]' },
  tools: { type: String, default: '[]' },
  certifications: { type: String, default: '[]' },
  // Filled in after sign-up ("Complete your profile"). Lists are stored as JSON text, like the skill lists above.
  resumeUrl: String,
  currentStatus: String,
  preferredCountries: { type: String, default: '[]' },
  education: { type: String, default: '[]' },
  workExperience: { type: String, default: '[]' },
  projects: { type: String, default: '[]' },
  status: { type: String, default: 'active' },
  joinedDate: String,
  applicationsCount: { type: Number, default: 0 },
  savedCount: { type: Number, default: 0 },
  // Expert listing: a seeker who wants to be shown on the Expert listing page applies, an admin approves. Only 'approved' is public.
  expertStatus: { type: String, enum: ['none', 'pending', 'approved', 'rejected', 'hidden'], default: 'none', index: true },
  // Which contact details the seeker lets the public profile show (all off until they switch them on).
  expertShowEmail: { type: Boolean, default: false },
  expertShowPhone: { type: Boolean, default: false },
  expertShowWebsite: { type: Boolean, default: false },
  expertWebsite: String,
  expertAppliedAt: Date,
  expertReviewedAt: Date,
  expertReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  expertReviewNote: String,
  // Kept up to date from ExpertRating whenever someone rates.
  expertRatingAverage: { type: Number, default: 0 },
  expertRatingCount: { type: Number, default: 0 },
}, { timestamps: true });

// A person's star rating (1 to 5) of an expert; one per person per expert, and rating again replaces it.
const expertRatingSchema = new mongoose.Schema({
  expertId: { type: mongoose.Schema.Types.ObjectId, ref: 'SeekerProfile', required: true, index: true },
  raterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  stars: { type: Number, required: true, min: 1, max: 5 },
}, { timestamps: true });
expertRatingSchema.index({ expertId: 1, raterId: 1 }, { unique: true });

// SEC-031: Text index for search on profession, university, country
seekerProfileSchema.index({ profession: 'text', university: 'text', country: 'text' });

const hirerAccountSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true, index: true },
  companyName: { type: String, required: true, index: true },
  tagline: String,
  logo: String,
  bannerImage: String,
  industry: { type: String, required: true, index: true },
  companySize: String,
  location: { type: String, required: true, index: true },
  website: String,
  companyEmail: { type: String, index: true },
  description: String,
  recruiterName: String,
  recruiterRole: String,
  recruiterEmail: String,
  recruiterPhone: String,
  recruiterLinkedin: String,
  verification: { type: String, default: 'pending' },
  verified: { type: Boolean, default: false },
  status: { type: String, default: 'active' },
  joinedDate: String,
  postingsCount: { type: Number, default: 0 },
  publicCompanyProfile: { type: Boolean, default: true },
}, { timestamps: true });

// SEC-031: Text index for search on companyName, industry, location
hirerAccountSchema.index({ companyName: 'text', industry: 'text', location: 'text' });

const candidateSchema = new mongoose.Schema({
  name: { type: String, required: true, index: true },
  profession: { type: String, required: true, index: true },
  university: { type: String, index: true },
  location: { type: String, index: true },
  image: String,
  matchScore: { type: Number, default: 0 },
  skills: { type: String, default: '[]', index: true },
  bio: String,
}, { timestamps: true });

// SEC-031: Text index for search on name, profession, skills
candidateSchema.index({ name: 'text', profession: 'text', skills: 'text' });

export const SeekerProfile = mongoose.model('SeekerProfile', seekerProfileSchema);
export const ExpertRating = mongoose.model('ExpertRating', expertRatingSchema);
export const HirerAccount = mongoose.model('HirerAccount', hirerAccountSchema);
export const Candidate = mongoose.model('Candidate', candidateSchema);
