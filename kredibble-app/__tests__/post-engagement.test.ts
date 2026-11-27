import {
  applyReaction, compactCount, initials, linkHost, nextReaction, normalizeWebAddress, postAge, postImages, reactionTotal,
  responsesLabel, unseenPostIds, videoInfo, viewsLabel, type FeedPost,
} from '../src/lib/post-engagement';
import { setPostReaction, recordPostViews, getPostResponses, createPostResponse, deletePostResponse } from '../src/lib/api';

// GOD-T89: the community feed's post card — reactions, view count, responses, pictures, video and links. ALL DATA IS FAKE.

const post = (fields: Partial<FeedPost> = {}): FeedPost => ({ id: 'p1', body: 'Hello', reactions: [], myReaction: null, ...fields });

describe('reactions on a post (GOD-T89)', () => {
  test('a first reaction adds one to its total', () => {
    expect(applyReaction(post(), '👍')).toMatchObject({ reactions: [{ emoji: '👍', count: 1 }], myReaction: '👍' });
  });

  test('changing your reaction moves your one count, and totals at zero disappear', () => {
    const before = post({ reactions: [{ emoji: '👍', count: 1 }, { emoji: '🎉', count: 2 }], myReaction: '👍' });
    expect(applyReaction(before, '🎉')).toMatchObject({ reactions: [{ emoji: '🎉', count: 3 }], myReaction: '🎉' });
  });

  test('tapping the reaction you gave takes it back', () => {
    const before = post({ reactions: [{ emoji: '❤️', count: 4 }], myReaction: '❤️' });
    expect(nextReaction(before, '❤️')).toBeNull();
    expect(nextReaction(before, '👏')).toBe('👏');
    expect(applyReaction(before, null)).toMatchObject({ reactions: [{ emoji: '❤️', count: 3 }], myReaction: null });
  });

  test('totals are sorted biggest first and added up for the summary', () => {
    const after = applyReaction(post({ reactions: [{ emoji: '🙏', count: 1 }, { emoji: '💡', count: 5 }] }), '👍');
    expect(after.reactions!.map((r) => r.emoji)).toEqual(['💡', '👍', '🙏']);
    expect(reactionTotal(after)).toBe(7);
  });
});

describe('counts and labels', () => {
  test('large counts are shortened', () => {
    expect([0, 950, 1000, 1250, 25_400, 1_300_000].map(compactCount)).toEqual(['0', '950', '1k', '1.2k', '25k', '1.3m']);
  });

  test('views and responses read naturally', () => {
    expect([viewsLabel(0), viewsLabel(1), viewsLabel(1200)]).toEqual(['0 views', '1 view', '1.2k views']);
    expect([responsesLabel(0), responsesLabel(1), responsesLabel(8)]).toEqual(['Respond', '1 response', '8 responses']);
  });

  test('post age: minutes, hours, days, then the date', () => {
    const now = new Date('2026-11-27T12:00:00Z');
    expect(postAge('2026-11-27T11:59:30Z', now)).toBe('just now');
    expect(postAge('2026-11-27T11:15:00Z', now)).toBe('45m');
    expect(postAge('2026-11-27T07:00:00Z', now)).toBe('5h');
    expect(postAge('2026-11-24T12:00:00Z', now)).toBe('3d');
    expect(postAge('2026-11-01T12:00:00Z', now)).toBe('1 Nov');
    expect(postAge(undefined, now)).toBe('');
  });

  test('initials for the author badge', () => {
    expect([initials('Ama Mensah'), initials('kofi'), initials('  '), initials('Global Opportunity Desk')]).toEqual(['AM', 'K', '?', 'GO']);
  });
});

describe('pictures, videos and links', () => {
  test('a post shows its pictures (at most four), or the single picture older posts have', () => {
    expect(postImages(post({ images: ['a', 'b', 'c', 'd', 'e'] }))).toEqual(['a', 'b', 'c', 'd']);
    expect(postImages(post({ bannerImage: 'old' }))).toEqual(['old']);
    expect(postImages(post())).toEqual([]);
  });

  test('typed links become web addresses; anything else is refused', () => {
    expect(normalizeWebAddress('example.com/apply')).toBe('https://example.com/apply');
    expect(normalizeWebAddress(' https://youtu.be/abc123XYZ00 ')).toBe('https://youtu.be/abc123XYZ00');
    expect(normalizeWebAddress('javascript:alert(1)')).toBeNull();
    expect(normalizeWebAddress('not a link')).toBeNull();
    expect(normalizeWebAddress('localhost')).toBeNull();
    expect(linkHost('https://www.example.com/apply?x=1')).toBe('example.com');
  });

  test('YouTube links get a still; other videos show where they are hosted', () => {
    expect(videoInfo('https://www.youtube.com/watch?v=abc123XYZ00')).toEqual({ source: 'YouTube', thumbnail: 'https://i.ytimg.com/vi/abc123XYZ00/hqdefault.jpg' });
    expect(videoInfo('https://youtu.be/abc123XYZ00').thumbnail).toBe('https://i.ytimg.com/vi/abc123XYZ00/hqdefault.jpg');
    expect(videoInfo('https://youtube.com/shorts/abc123XYZ00').source).toBe('YouTube');
    expect(videoInfo('https://vimeo.com/123456')).toEqual({ source: 'Vimeo', thumbnail: null });
    expect(videoInfo('https://cdn.example.org/clip.mp4')).toEqual({ source: 'cdn.example.org', thumbnail: null });
  });
});

describe('views are reported once per post per visit, never for your own posts', () => {
  test('only new posts by other people are sent, at most 50', () => {
    const posts = [post({ id: 'a', authorId: 'me' }), post({ id: 'b', authorId: 'them' }), post({ id: 'c' })];
    expect(unseenPostIds(posts, new Set(['c']), 'me')).toEqual(['b']);
    const many = Array.from({ length: 60 }, (_, i) => post({ id: `x${i}` }));
    expect(unseenPostIds(many, new Set(), null)).toHaveLength(50);
  });
});

describe('API calls (GOD-T89)', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: { ok: true } }) });
    (global as any).fetch = fetchMock;
  });

  const lastCall = () => {
    const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    return { url: String(url), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body) : undefined };
  };

  test('reacting sends PUT with the emoji; taking it back sends DELETE', async () => {
    await setPostReaction('c1', 'p1', '👍');
    expect(lastCall()).toMatchObject({ method: 'PUT', body: { emoji: '👍' } });
    expect(lastCall().url).toMatch(/\/community\/channels\/c1\/posts\/p1\/reaction$/);
    await setPostReaction('c1', 'p1', null);
    expect(lastCall().method).toBe('DELETE');
  });

  test('views, responses list, respond and delete use the post routes', async () => {
    await recordPostViews('c1', ['p1', 'p2']);
    expect(lastCall()).toMatchObject({ method: 'POST', body: { postIds: ['p1', 'p2'] } });
    expect(lastCall().url).toMatch(/\/community\/channels\/c1\/posts\/views$/);

    await getPostResponses('c1', 'p1');
    expect(lastCall().url).toMatch(/\/posts\/p1\/responses\?limit=100$/);

    await createPostResponse('c1', 'p1', 'When is the deadline?');
    expect(lastCall()).toMatchObject({ method: 'POST', body: { body: 'When is the deadline?' } });

    await deletePostResponse('c1', 'p1', 'r1');
    expect(lastCall()).toMatchObject({ method: 'DELETE' });
    expect(lastCall().url).toMatch(/\/posts\/p1\/responses\/r1$/);
  });
});
