import mongoose from 'mongoose';

// BE-025: per-user daily AI budget. A dedicated TTL collection (not
// in-memory counters) so the cap holds across instances and restarts.
// `day` is a UTC `YYYY-MM-DD` string; documents expire 2 days after creation.
const aiAssistantUsageSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    day: { type: String, required: true, index: true },
    count: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: true } },
);

aiAssistantUsageSchema.index({ userId: 1, day: 1 }, { unique: true });
aiAssistantUsageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2 * 24 * 60 * 60 });

export const AiAssistantUsage = mongoose.model('AiAssistantUsage', aiAssistantUsageSchema);

export const utcDayKey = (when = new Date()) => when.toISOString().slice(0, 10);

/**
 * Atomically consume one unit of the caller's daily AI budget.
 * @param {string|ObjectId} userId
 * @param {number} limit - max consumed units per UTC day
 * @returns {Promise<{ allowed: boolean, used: number, limit: number }>}
 */
export async function consumeAssistantBudget(userId, limit) {
  const day = utcDayKey();
  const record = await AiAssistantUsage.findOneAndUpdate(
    { userId, day },
    { $inc: { count: 1 }, $setOnInsert: { userId, day } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  return { allowed: record.count <= limit, used: record.count, limit };
}
