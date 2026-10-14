import mongoose from 'mongoose';

const articleSchema = new mongoose.Schema({
  category: { type: String, required: true, index: true },
  title: { type: String, required: true, index: true },
  duration: String,
  summary: { type: String, required: true },
  content: { type: String, required: true },
  status: { type: String, default: 'draft', index: true },
  bannerImage: String,
}, { timestamps: true });

// SEC-031: Text index for search on title, category
articleSchema.index({ title: 'text', category: 'text' });

const notificationSchema = new mongoose.Schema({
  title: { type: String, required: true, index: true },
  message: { type: String, required: true, index: true },
  audience: { type: String, required: true, index: true }, // e.g. seekers, hirers, all, both
  type: { type: String, default: 'general' },
  priority: { type: String, default: 'normal' },
  status: { type: String, enum: ['sent', 'scheduled', 'cancelled'], default: 'sent', index: true },
  scheduledFor: { type: Date, index: true },
  isActive: { type: Boolean, default: true, index: true },
  sentAt: { type: Date, default: Date.now, index: true },
  // Per-user notifications (for example an ambassador decision). Broadcasts leave this empty.
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  readAt: Date,
}, { timestamps: true });

// SEC-031: Compound index for notifications
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ status: 1, scheduledFor: 1 });
notificationSchema.index({ audience: 1, status: 1, sentAt: -1 });

export const Article = mongoose.model('Article', articleSchema);
export const Notification = mongoose.model('Notification', notificationSchema);

// BE-022: ingested news store (Insight Ghana, The African Journal).
// `externalId` (`<source>:<wordpressId>`) is stable across ingests so
// re-runs update instead of duplicating. `hidden` is staff-only and never
// overwritten by ingest (an admin hide decision always wins).
export const NEWS_SOURCES = Object.freeze(['insight_ghana', 'african_journal']);

const newsItemSchema = new mongoose.Schema({
  externalId: { type: String, required: true, unique: true, index: true },
  source: { type: String, required: true, enum: NEWS_SOURCES, index: true },
  title: { type: String, required: true, index: true },
  summary: { type: String, default: '' },
  content: { type: String, default: '' },
  link: { type: String, default: '' },
  imageUrl: { type: String, default: null },
  publishedAt: { type: Date, index: true },
  hidden: { type: Boolean, default: false, index: true },
  hiddenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  hiddenAt: { type: Date, default: null },
  lastSeenAt: { type: Date, default: Date.now },
}, { timestamps: true });

newsItemSchema.index({ source: 1, publishedAt: -1 });
newsItemSchema.index({ hidden: 1, publishedAt: -1 });

export const NewsItem = mongoose.model('NewsItem', newsItemSchema);
