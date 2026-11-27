/**
 * GOD-T89: reactions, views and responses on community feed posts.
 *
 * A post's reactions are one row per person (ChannelPostReaction), so nobody can react twice or set the totals themselves; the feed
 * counts them for the page it shows. Views and responses are counted on the post as they happen (viewCount, responseCount), because
 * the feed shows them on every card and a view is recorded once per person.
 */
import mongoose from 'mongoose';
import { ChannelPost, ChannelPostReaction, ChannelPostResponse, ChannelPostView } from '../models/Community.js';
import { assertChannelImage } from './channel-image.js';

/** The reactions people can pick, in the order the app shows them. */
export const POST_REACTIONS = ['👍', '❤️', '🎉', '👏', '💡', '🙏'];

/** Where a person's post pictures are uploaded (POST /upload?purpose=post-images). */
export const postImageFolder = (userId) => `kredibble/${userId}/post-images/`;
// The app used to upload a post's single picture as a company logo; posts made that way still save.
const legacyBannerFolder = (userId) => `kredibble/${userId}/company-logos/`;

const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

/**
 * Checks that every picture on a new post is one the author uploaded, and returns the post's media fields. Throws a 400 otherwise.
 * @param {{ images?: string[], bannerImage?: string }} body - the validated request body
 * @param {string} userId - the author
 * @returns {Promise<{ images: string[], bannerImage?: string }>}
 */
export async function checkPostMedia(body, userId) {
  const images = [];
  for (const url of body.images ?? []) images.push(await assertChannelImage(url, postImageFolder(userId)));
  let bannerImage;
  if (body.bannerImage) {
    const inPostFolder = await assertChannelImage(body.bannerImage, postImageFolder(userId)).catch(() => undefined);
    bannerImage = inPostFolder ?? await assertChannelImage(body.bannerImage, legacyBannerFolder(userId));
  }
  return { images, ...(bannerImage ? { bannerImage } : {}) };
}

/**
 * Reaction totals for a set of posts, and which one the caller picked.
 * @param {Array<string|mongoose.Types.ObjectId>} postIds
 * @param {string} [userId] - the signed-in caller, if any
 * @returns {Promise<Map<string, { reactions: Array<{ emoji: string, count: number }>, myReaction: string|null }>>}
 */
export async function reactionSummaries(postIds, userId) {
  const ids = postIds.map(toObjectId);
  const [totals, mine] = await Promise.all([
    ChannelPostReaction.aggregate([
      { $match: { postId: { $in: ids } } },
      { $group: { _id: { postId: '$postId', emoji: '$emoji' }, count: { $sum: 1 } } },
    ]),
    userId ? ChannelPostReaction.find({ postId: { $in: ids }, userId }).select('postId emoji').lean() : [],
  ]);
  const summaries = new Map(ids.map((id) => [String(id), { reactions: [], myReaction: null }]));
  for (const row of totals) summaries.get(String(row._id.postId))?.reactions.push({ emoji: row._id.emoji, count: row.count });
  for (const summary of summaries.values()) {
    summary.reactions.sort((a, b) => b.count - a.count || POST_REACTIONS.indexOf(a.emoji) - POST_REACTIONS.indexOf(b.emoji));
  }
  for (const row of mine) summaries.get(String(row.postId)).myReaction = row.emoji;
  return summaries;
}

/**
 * The feed's view of posts: each client object with its reaction totals, the caller's reaction, and the view and response counts.
 * @param {object[]} posts - client objects (with `id`)
 * @param {string} [userId]
 */
export async function withEngagement(posts, userId) {
  if (posts.length === 0) return posts;
  const summaries = await reactionSummaries(posts.map((post) => post.id), userId);
  return posts.map((post) => ({
    ...post,
    images: post.images?.length ? post.images : (post.bannerImage ? [post.bannerImage] : []),
    viewCount: post.viewCount ?? 0,
    responseCount: post.responseCount ?? 0,
    ...summaries.get(String(post.id)),
  }));
}

/**
 * Sets the caller's reaction on a post (replacing the one they had), or removes it when `emoji` is null.
 * @returns {Promise<{ reactions: Array<{ emoji: string, count: number }>, myReaction: string|null }>}
 */
export async function setReaction({ post, userId, emoji }) {
  if (emoji) {
    await ChannelPostReaction.updateOne(
      { postId: post._id, userId },
      { $set: { emoji }, $setOnInsert: { channelId: post.channelId } },
      { upsert: true },
    );
  } else {
    await ChannelPostReaction.deleteOne({ postId: post._id, userId });
  }
  return (await reactionSummaries([post._id], userId)).get(String(post._id));
}

/**
 * Records that the caller saw these posts. Each person counts once per post, and authors seeing their own posts do not count.
 * @param {{ channelId: mongoose.Types.ObjectId, postIds: string[], userId: string }} input
 * @returns {Promise<number>} how many new views were counted
 */
export async function recordViews({ channelId, postIds, userId }) {
  const posts = await ChannelPost.find({ _id: { $in: postIds }, channelId, authorId: { $ne: userId } }).select('_id').lean();
  if (posts.length === 0) return 0;
  const result = await ChannelPostView.bulkWrite(
    posts.map((post) => ({
      updateOne: { filter: { postId: post._id, userId }, update: { $setOnInsert: { postId: post._id, userId } }, upsert: true },
    })),
    { ordered: false },
  );
  const newlySeen = Object.values(result.upsertedIds ?? {});
  if (newlySeen.length > 0) {
    // upsertedIds are the new view rows; their posts are the ones at the same positions.
    const indexes = Object.keys(result.upsertedIds).map(Number);
    await ChannelPost.updateMany({ _id: { $in: indexes.map((index) => posts[index]._id) } }, { $inc: { viewCount: 1 } });
  }
  return newlySeen.length;
}

/** A response as the app shows it. */
export const toResponse = (row) => ({
  id: String(row._id),
  postId: String(row.postId),
  authorId: row.authorId ? String(row.authorId) : null,
  authorName: row.authorName,
  body: row.body,
  createdAt: row.createdAt,
});

/** A post's responses, oldest first (the order a conversation reads in). */
export async function listResponses(postId, { skip = 0, limit = 50 } = {}) {
  const [rows, total] = await Promise.all([
    ChannelPostResponse.find({ postId }).sort({ createdAt: 1, _id: 1 }).skip(skip).limit(limit).lean(),
    ChannelPostResponse.countDocuments({ postId }),
  ]);
  return { responses: rows.map(toResponse), total };
}

/** Adds a response and counts it on the post. */
export async function addResponse({ post, author, body }) {
  const row = await ChannelPostResponse.create({
    postId: post._id, channelId: post.channelId, authorId: author._id, authorName: author.name || 'Community member', body,
  });
  await ChannelPost.updateOne({ _id: post._id }, { $inc: { responseCount: 1 } });
  return toResponse(row);
}

/** Removes a response and takes it off the post's count. */
export async function removeResponse(response) {
  const deleted = await ChannelPostResponse.findOneAndDelete({ _id: response._id });
  if (deleted) await ChannelPost.updateOne({ _id: deleted.postId, responseCount: { $gt: 0 } }, { $inc: { responseCount: -1 } });
}
