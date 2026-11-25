import mongoose from 'mongoose';
import { OPPORTUNITY_REJECTION_REASON_CODES, REJECTION_NOTE_MAX } from '../lib/opportunity-rejection.js';

export const opportunityTypes = [
  'job',
  'jobs',
  'internship',
  'internships',
  'scholarship',
  'scholarships',
  'fellowship',
  'fellowships',
  'competition',
  'competitions',
  'training-workshop',
  'training',
  'trainings',
  'grant',
  'grants',
  'event',
  'events',
  'volunteer',
  'volunteers',
  'mentorship',
  'mentorships',
];

/** How a listing is paid for: free or paid to join, or funded for the person (a scholarship, a fellowship, a stipend). */
export const opportunityFundingTypes = ['free', 'paid', 'fully-funded', 'partially-funded', 'stipend', 'unfunded'];

const opportunitySchema = new mongoose.Schema({
  hirerId: { type: mongoose.Schema.Types.ObjectId, ref: 'HirerAccount', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  title: { type: String, required: true, index: true },
  type: { type: String, required: true, enum: opportunityTypes, index: true },
  company: { type: String, required: true, index: true },
  offeringOrganization: String,
  organizationLogo: String,
  location: { type: String, required: true, index: true },
  description: { type: String, required: true },
  applicantsCount: { type: Number, default: 0 },
  date: String,
  status: { type: String, enum: ['draft', 'published', 'pending', 'approved', 'rejected', 'archived'], default: 'draft', index: true },
  moderationStatus: { type: String, default: 'pending', index: true },
  // SEC-151: why the Desk turned the posting down (a code from lib/opportunity-rejection.js), the reviewer's
  // note for the hirer, and when and by whom. Kept only while moderationStatus is 'rejected'.
  rejectionReason: { type: String, enum: OPPORTUNITY_REJECTION_REASON_CODES },
  rejectionNote: { type: String, trim: true, maxlength: REJECTION_NOTE_MAX },
  rejectedAt: Date,
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  workType: String,
  salary: String,
  experienceLevels: { type: String, default: '[]' },
  applicationUrl: String,
  applicationLink: String,
  applyUrl: String,
  costLabel: String,
  durationLabel: String,
  format: { type: String, enum: ['online', 'in-person', 'hybrid'], default: 'online' },
  country: String,
  deadline: Date,
  closesAt: Date,
  eligibility: String,
  benefits: String,
  // Category details (volunteering, scholarships, fellowships, training, mentorship): what the app's cards and filters use.
  fundingType: { type: String, enum: opportunityFundingTypes },
  level: String,
  focusArea: String,
  organizer: String,
  coverImage: String,
  logoUrl: String,
  imageUrl: String,
  images: [{ type: String }],
  externalReferenceUrl: String,
  writerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  assignedWriterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  referralOnApply: { type: Boolean, default: false },
  referralCodeOnApply: { type: Boolean, default: false },
  vetted: { type: Boolean, default: false, index: true },
  vettedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  vettedAt: Date,
  vettedOn: String,
  publishedAt: { type: Date, index: true },
  views: {
    website: { type: Number, default: 0 },
    app: { type: Number, default: 0 },
  },
  applications: {
    website: { type: Number, default: 0 },
    app: { type: Number, default: 0 },
  },
  wordpressSync: {
    wordpressId: String,
    status: { type: String, enum: ['pending', 'synced', 'failed'], default: 'pending', index: true },
    lastAttemptAt: Date,
    lastError: String,
    // The listing's images in the WordPress media library, so each is uploaded once and reused until it changes.
    media: {
      logoUrl: String,
      logoId: Number,
      coverUrl: String,
      coverId: Number,
      lastError: String,
    },
  },
  // Competition specific
  competitionCategory: String,
  prizeDetails: String,
  submissionRequirements: String,
  // Fellowship specific
  fellowshipDuration: String,
  fellowshipFormat: String,
  stipendDetails: String,
  // Training and workshop specific
  trainingFormat: String,
  trainingDuration: String,
  registrationFee: String,
  certificateOffered: Boolean,
  // Event specific
  eventAt: String,
  eventDateTime: String,
  eventRegion: String,
  eventCategory: String,
  // Grant specific
  grantBudgetRange: String,
  grantSector: String,
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

// SEC-031: Text index for search on title, company, location
opportunitySchema.index({ title: 'text', company: 'text', location: 'text' });
opportunitySchema.index({ status: 1, publishedAt: -1 });
opportunitySchema.index({ vetted: 1, publishedAt: -1 });
opportunitySchema.index({ status: 1, vetted: 1 });
opportunitySchema.index({ status: 1, vetted: 1, publishedAt: -1 });
opportunitySchema.index({ status: 1, vetted: 1, type: 1, publishedAt: -1 });
opportunitySchema.index({ status: 1, closesAt: 1 });
opportunitySchema.index({ status: 1, eventAt: 1 });

opportunitySchema.virtual('organisation')
  .get(function () { return this.offeringOrganization || this.company; })
  .set(function (val) {
    this.company = val;
    this.offeringOrganization = val;
  });

opportunitySchema.virtual('vettedById')
  .get(function () { return this.vettedBy ? this.vettedBy.toString() : undefined; })
  .set(function (val) {
    this.vettedBy = val ? new mongoose.Types.ObjectId(val) : undefined;
  });

opportunitySchema.pre('validate', function () {
  // Sync company and organisation
  if (!this.company && this.offeringOrganization) {
    this.company = this.offeringOrganization;
  }
  if (!this.offeringOrganization && this.company) {
    this.offeringOrganization = this.company;
  }

  // Sync status and moderationStatus
  if (this.isNew) {
    if (this.status === 'published' || this.moderationStatus === 'published' || this.moderationStatus === 'approved') {
      this.status = 'published';
      this.moderationStatus = 'published';
    } else if (this.status === 'draft') {
      this.moderationStatus = 'pending';
    }
  } else if (typeof this.isModified === 'function' && this.isModified('status')) {
    if (this.status === 'published') {
      this.moderationStatus = 'published';
    } else if (this.status === 'draft') {
      this.moderationStatus = 'pending';
    }
  } else if (typeof this.isModified === 'function' && this.isModified('moderationStatus')) {
    if (this.moderationStatus === 'published' || this.moderationStatus === 'approved') {
      this.status = 'published';
    } else if (this.moderationStatus === 'pending' || this.moderationStatus === 'rejected') {
      this.status = 'draft';
    }
  } else if (this.status === 'published' || this.moderationStatus === 'published' || this.moderationStatus === 'approved') {
    this.status = 'published';
    this.moderationStatus = 'published';
  } else if (this.status === 'draft' && this.moderationStatus !== 'rejected') {
    // SEC-151: a later save that changes neither status (the WordPress bookkeeping right after a rejection,
    // a website edit) must not turn a rejection back into "pending"; only a decision or the hirer's edit does.
    this.moderationStatus = 'pending';
  }

  // Rule: A published listing is always vetted
  if (this.status === 'published') {
    this.vetted = true;
    if (!this.publishedAt) {
      this.publishedAt = new Date();
    }
    if (!this.vettedAt) {
      this.vettedAt = new Date();
    }
  }

  // Sync dates and aliases
  if (this.vetted && !this.vettedAt) {
    this.vettedAt = new Date();
  }
  if (this.vettedAt && !this.vettedOn) {
    this.vettedOn = this.vettedAt instanceof Date ? this.vettedAt.toISOString().slice(0, 10) : String(this.vettedAt).slice(0, 10);
  }
  if (this.closesAt && !this.deadline) {
    this.deadline = this.closesAt;
  }
  if (this.deadline && !this.closesAt) {
    this.closesAt = this.deadline;
  }
  if (this.writerId && !this.assignedWriterId) {
    this.assignedWriterId = this.writerId;
  }
  if (this.assignedWriterId && !this.writerId) {
    this.writerId = this.assignedWriterId;
  }
  if (this.applyUrl && !this.applicationUrl) {
    this.applicationUrl = this.applyUrl;
  }
  if (this.applicationUrl && !this.applyUrl) {
    this.applyUrl = this.applicationUrl;
  }
  if (this.eventAt && !this.eventDateTime) {
    this.eventDateTime = this.eventAt;
  }
  if (this.eventDateTime && !this.eventAt) {
    this.eventAt = this.eventDateTime;
  }
  if (this.logoUrl && !this.organizationLogo) {
    this.organizationLogo = this.logoUrl;
  }
  if (this.organizationLogo && !this.logoUrl) {
    this.logoUrl = this.organizationLogo;
  }
  if (this.imageUrl && !this.coverImage) {
    this.coverImage = this.imageUrl;
  }
  if (this.coverImage && !this.imageUrl) {
    this.imageUrl = this.coverImage;
  }
  if (this.referralOnApply !== undefined && this.referralCodeOnApply === undefined) {
    this.referralCodeOnApply = this.referralOnApply;
  }
  if (this.referralCodeOnApply !== undefined && this.referralOnApply === undefined) {
    this.referralOnApply = this.referralCodeOnApply;
  }
  if (!this.views) {
    this.views = { website: 0, app: 0 };
  }
  if (!this.applications) {
    this.applications = { website: 0, app: 0 };
  }

  // SEC-151: turning a posting down needs a reason the hirer can act on; leaving 'rejected'
  // (approved, unpublished, or back in review after the hirer's edit) forgets it.
  if (this.moderationStatus === 'rejected') {
    if (!this.isNew && this.isModified('moderationStatus') && !this.rejectionReason) {
      this.invalidate('rejectionReason', 'A rejected posting needs a reason');
    }
  } else if (this.rejectionReason || this.rejectionNote || this.rejectedAt || this.rejectedBy) {
    this.rejectionReason = undefined;
    this.rejectionNote = undefined;
    this.rejectedAt = undefined;
    this.rejectedBy = undefined;
  }
});

const applicantSchema = new mongoose.Schema({
  opportunityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Opportunity', required: true, index: true },
  seekerId: { type: mongoose.Schema.Types.ObjectId, ref: 'SeekerProfile', index: true },
  name: String,
  status: { type: String, default: 'Applied' },
  skills: { type: String, default: '[]' },
  resumeUrl: String,
  referralCode: String,
  ambassadorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ambassador', index: true },
}, { timestamps: true });
applicantSchema.index({ opportunityId: 1, seekerId: 1 }, { unique: true, sparse: true });

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true, index: true },
  hirer: { type: String, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  location: { type: String, required: true, index: true },
  dateTime: { type: String, required: true },
  capacity: { type: Number, required: true },
  attendeesCount: { type: Number, default: 0 },
  status: { type: String, default: 'upcoming' },
}, { timestamps: true });

// SEC-031: Text index for search on title, location
eventSchema.index({ title: 'text', location: 'text' });

const grantSchema = new mongoose.Schema({
  title: { type: String, required: true, index: true },
  hirer: { type: String, required: true },
  sector: { type: String, required: true, index: true },
  fundingPool: { type: Number, required: true },
  allocated: { type: Number, default: 0 },
  status: { type: String, default: 'open', index: true },
}, { timestamps: true });

// SEC-031: Text index for search on title, sector
grantSchema.index({ title: 'text', sector: 'text' });

const grantApplicationSchema = new mongoose.Schema({
  grantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Grant', required: true, index: true },
  applicantUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  applicantName: { type: String, required: true },
  requestedAmount: { type: Number, required: true },
  status: { type: String, default: 'pending' },
}, { timestamps: true });

const companyVerificationSchema = new mongoose.Schema({
  hirerId: { type: mongoose.Schema.Types.ObjectId, ref: 'HirerAccount', unique: true },
  name: { type: String, required: true },
  industry: String,
  companySize: String,
  location: String,
  website: String,
  companyEmail: String,
  recruiterName: String,
  recruiterRole: String,
  recruiterEmail: String,
  submittedDate: String,
  overallStatus: { type: String, default: 'pending', index: true },
}, { timestamps: true });

const verificationDocSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'HirerAccount', required: true, index: true },
  verificationCaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'CompanyVerification' },
  key: { type: String, required: true },
  label: String,
  fileName: String,
  status: { type: String, default: 'pending' },
}, { timestamps: true });

export const Opportunity = mongoose.model('Opportunity', opportunitySchema);
export const Applicant = mongoose.model('Applicant', applicantSchema);
export const Event = mongoose.model('Event', eventSchema);
export const Grant = mongoose.model('Grant', grantSchema);
export const GrantApplication = mongoose.model('GrantApplication', grantApplicationSchema);

const eventAttendeeSchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  fullName: { type: String, required: true },
  email: { type: String, required: true },
  quantity: { type: Number, default: 1 },
  status: { type: String, default: 'confirmed' },
}, { timestamps: true });
eventAttendeeSchema.index({ eventId: 1, email: 1 }, { unique: true });
export const EventAttendee = mongoose.model('EventAttendee', eventAttendeeSchema);

export const CompanyVerification = mongoose.model('CompanyVerification', companyVerificationSchema);
export const VerificationDoc = mongoose.model('VerificationDoc', verificationDocSchema);
