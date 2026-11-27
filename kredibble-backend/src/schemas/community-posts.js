import { z } from 'zod';
import { POST_REACTIONS } from '../lib/channel-posts.js';

/**
 * GOD-T89: request shapes for community feed posts and what people do with them (reactions, views, responses).
 */
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

/** A web address people can open: http or https only (no javascript: or app links). */
const webAddress = (label) => z.string().trim().max(2000).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}, `${label} must be a web address starting with https://`);

const postParams = z.object({ channelId: objectId, postId: objectId });

export const createChannelPostSchema = z.object({
  body: z.object({
    body: z.string().trim().max(5000).optional().default(''),
    title: z.string().trim().max(140).optional(),
    images: z.array(z.string().trim().min(1)).max(4, 'A post can have up to four pictures').optional(),
    // Older app versions send one picture here.
    bannerImage: z.string().trim().min(1).optional(),
    videoUrl: webAddress('The video link').optional(),
    link: webAddress('The link').optional(),
    linkText: z.string().trim().max(120).optional(),
    hasRespondButton: z.boolean().optional(),
    // Older app versions send these; the server sets the author and date itself.
    authorName: z.unknown().optional(),
    date: z.unknown().optional(),
  }).strip().refine(
    (post) => post.body || post.images?.length || post.bannerImage || post.videoUrl,
    { message: 'Write something or add a picture or video', path: ['body'] },
  ),
  query: z.any(),
  params: z.object({ channelId: objectId }),
});

export const postViewsSchema = z.object({
  body: z.object({ postIds: z.array(objectId).min(1).max(50) }).strict(),
  query: z.any(),
  params: z.object({ channelId: objectId }),
});

export const postReactionSchema = z.object({
  body: z.object({ emoji: z.enum(POST_REACTIONS) }).strict(),
  query: z.any(),
  params: postParams,
});

export const postParamsSchema = z.object({ body: z.any(), query: z.any(), params: postParams });

export const createPostResponseSchema = z.object({
  body: z.object({ body: z.string().trim().min(1, 'Write a response first').max(1000) }).strict(),
  query: z.any(),
  params: postParams,
});

export const postResponseParamsSchema = z.object({
  body: z.any(),
  query: z.any(),
  params: postParams.extend({ responseId: objectId }),
});
