/**
 * GOD-T89: the community feed's post card — reactions, view count, responses, pictures, video and links.
 *
 * Pure helpers the feed screen and its tests share. The server keeps one reaction per person per post and counts each viewer once
 * (kredibble-backend/src/lib/channel-posts.js); these helpers update a post on screen straight away, before the server answers.
 */

/** The reactions people can pick, in the order the picker shows them (the same list the server accepts). */
export const POST_REACTIONS = ['👍', '❤️', '🎉', '👏', '💡', '🙏'] as const;
export type PostReaction = (typeof POST_REACTIONS)[number];

export interface ReactionTotal {
  emoji: string;
  count: number;
}

/** A feed post as the server sends it, with only the fields the card reads. */
export interface FeedPost {
  id: string;
  channelId?: string;
  authorId?: string | null;
  authorName?: string;
  title?: string;
  body?: string;
  images?: string[];
  bannerImage?: string;
  videoUrl?: string;
  link?: string;
  linkText?: string;
  hasRespondButton?: boolean;
  reactions?: ReactionTotal[];
  myReaction?: string | null;
  viewCount?: number;
  responseCount?: number;
  createdAt?: string;
  pinnedAt?: string | null;
}

/** The most pictures a post can carry. */
export const MAX_POST_IMAGES = 4;

/**
 * The post after the caller picks `emoji` (or removes their reaction with `null`): their old reaction comes off its total, the new one
 * goes on, and totals at zero disappear. Biggest totals first.
 */
export function applyReaction(post: FeedPost, emoji: string | null): FeedPost {
  const totals = new Map((post.reactions ?? []).map((reaction) => [reaction.emoji, reaction.count]));
  if (post.myReaction) totals.set(post.myReaction, (totals.get(post.myReaction) ?? 1) - 1);
  if (emoji) totals.set(emoji, (totals.get(emoji) ?? 0) + 1);
  const reactions = [...totals.entries()]
    .filter(([, count]) => count > 0)
    .map(([key, count]) => ({ emoji: key, count }))
    .sort((a, b) => b.count - a.count || reactionOrder(a.emoji) - reactionOrder(b.emoji));
  return { ...post, reactions, myReaction: emoji };
}

const reactionOrder = (emoji: string) => {
  const index = (POST_REACTIONS as readonly string[]).indexOf(emoji);
  return index === -1 ? POST_REACTIONS.length : index;
};

/** Tapping the reaction you already gave takes it back; any other reaction replaces it. */
export const nextReaction = (post: FeedPost, emoji: string): string | null => (post.myReaction === emoji ? null : emoji);

/** How many reactions a post has in all. */
export const reactionTotal = (post: FeedPost): number => (post.reactions ?? []).reduce((sum, reaction) => sum + reaction.count, 0);

/** 950 → "950", 1200 → "1.2k", 25000 → "25k", 1300000 → "1.3m". */
export function compactCount(count: number): string {
  if (count < 1000) return String(count);
  const [value, unit] = count < 1_000_000 ? [count / 1000, 'k'] : [count / 1_000_000, 'm'];
  return `${value >= 10 ? Math.floor(value) : Math.floor(value * 10) / 10}${unit}`;
}

/** "1 view", "12 views", "1.2k views". */
export const viewsLabel = (count = 0): string => `${compactCount(count)} ${count === 1 ? 'view' : 'views'}`;

/** "Respond", "1 response", "8 responses". */
export const responsesLabel = (count = 0): string =>
  count === 0 ? 'Respond' : `${compactCount(count)} ${count === 1 ? 'response' : 'responses'}`;

/** The pictures to show: the post's own list, or the single picture older posts carry. */
export const postImages = (post: FeedPost): string[] =>
  post.images?.length ? post.images.slice(0, MAX_POST_IMAGES) : post.bannerImage ? [post.bannerImage] : [];

/**
 * What someone typed as a link, as a web address: "example.com/apply" becomes "https://example.com/apply". Returns null for anything
 * that is not an http(s) address with a dotted host (the server refuses those too).
 */
export function normalizeWebAddress(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** "https://www.example.com/apply?x=1" → "example.com". */
export function linkHost(address: string): string {
  try {
    return new URL(address).hostname.replace(/^www\./, '');
  } catch {
    return address;
  }
}

export interface VideoInfo {
  /** Who hosts the video, for the card's label. */
  source: string;
  /** A still from the video when the host offers one (YouTube does). */
  thumbnail: string | null;
}

/** What the card can say about a video link: its host, and a still for YouTube videos. */
export function videoInfo(address: string): VideoInfo {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return { source: 'Video', thumbnail: null };
  }
  const host = url.hostname.replace(/^(www|m)\./, '');
  let youtubeId: string | null = null;
  if (host === 'youtu.be') youtubeId = url.pathname.slice(1).split('/')[0] || null;
  else if (host === 'youtube.com') youtubeId = url.searchParams.get('v') ?? url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)/)?.[1] ?? null;
  if (youtubeId && /^[\w-]{6,20}$/.test(youtubeId)) {
    return { source: 'YouTube', thumbnail: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg` };
  }
  if (host === 'vimeo.com') return { source: 'Vimeo', thumbnail: null };
  return { source: linkHost(address), thumbnail: null };
}

/** "just now", "5m", "3h", "2d", then the date ("14 Nov"). */
export function postAge(createdAt: string | undefined, now: Date = new Date()): string {
  if (!createdAt) return '';
  const then = new Date(createdAt);
  const seconds = Math.max(0, (now.getTime() - then.getTime()) / 1000);
  if (Number.isNaN(seconds)) return '';
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 7 * 86_400) return `${Math.floor(seconds / 86_400)}d`;
  return then.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(then.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}

/** The first letter or two of a name, for the round author badge. */
export const initials = (name = ''): string =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join('') || '?';

/** The ids of posts the caller has not been counted on yet, so the feed reports each view once per visit. */
export const unseenPostIds = (posts: FeedPost[], alreadySent: Set<string>, myUserId?: string | null): string[] =>
  posts.filter((post) => !alreadySent.has(post.id) && (!myUserId || post.authorId !== myUserId)).map((post) => post.id).slice(0, 50);
