import request from 'supertest';
import { app } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Channel, ChannelPost, ChannelPostReaction, ChannelPostResponse, ChannelPostView, CommunityMembership } from '../src/models/Community.js';
import { signToken } from '../src/middleware/auth.js';
import { deleteAccount } from '../src/lib/account-deletion.js';

// GOD-T89 (task sheet, 16 Nov 2026): "Redesign the post UI ... reactions, view count, view responses, add links/videos/pictures."
// The feed's posts now carry real reactions (one per person), a view count (each person once), responses people can read and write,
// up to four pictures the author uploaded, a video link and a link. ALL DATA IS FAKE.

const api = (route) => `/api/v1${route}`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const bearer = (person) => ['Authorization', `Bearer ${signToken(person)}`];

describe('GOD-T89: feed posts with reactions, views, responses and media', () => {
  let owner;
  let reader;
  let another;
  let channel;

  const makeUser = (name) => User.create({ name, email: `t89-${name.replace(/\s+/g, '').toLowerCase()}-${Date.now()}-${Math.random()}@example.com`, role: 'seeker', passwordHash: 'x' });
  const posts = (path = '') => api(`/community/channels/${channel._id}/posts${path}`);
  const upload = async (person, purpose = 'post-images') =>
    (await request(app).post(api(`/upload?purpose=${purpose}`)).set(...bearer(person)).attach('file', PNG, { filename: 'p.png', contentType: 'image/png' }).expect(200)).body.data.url;
  const createPost = (person, body) => request(app).post(posts()).set(...bearer(person)).send(body);

  beforeEach(async () => {
    owner = await makeUser('Owner Person');
    reader = await makeUser('Reader Person');
    another = await makeUser('Another Person');
    channel = await Channel.create({ name: 'T89 Test Circle', category: 'Tech', createdBy: owner._id, visibility: 'public' });
  });

  it('saves a post with pictures the author uploaded, a video link and a link', async () => {
    const [first, second] = [await upload(owner), await upload(owner)];
    const res = await createPost(owner, {
      body: 'Applications open on Monday', images: [first, second], videoUrl: 'https://www.youtube.com/watch?v=abc123XYZ00',
      link: 'https://example.com/apply', linkText: 'How to apply', authorName: 'Ignored Name',
    }).expect(201);

    expect(res.body.data).toMatchObject({
      body: 'Applications open on Monday', images: [first, second], videoUrl: 'https://www.youtube.com/watch?v=abc123XYZ00',
      link: 'https://example.com/apply', authorName: 'Owner Person', viewCount: 0, responseCount: 0, reactions: [], myReaction: null,
    });
  });

  it('lets a post be pictures only, and refuses an empty post', async () => {
    const picture = await upload(owner);
    const res = await createPost(owner, { images: [picture] }).expect(201);
    expect(res.body.data.body).toBe('');
    await createPost(owner, { body: '   ' }).expect(400);
  });

  it('refuses pictures from another site or another person, more than four, and links that are not web addresses', async () => {
    await createPost(owner, { body: 'x', images: ['https://example.com/not-ours.png'] }).expect(400);
    await createPost(owner, { body: 'x', images: [await upload(reader)] }).expect(400);
    const mine = await upload(owner);
    await createPost(owner, { body: 'x', images: [mine, mine, mine, mine, mine] }).expect(400);
    await createPost(owner, { body: 'x', link: 'javascript:alert(1)' }).expect(400);
    await createPost(owner, { body: 'x', videoUrl: 'not a link' }).expect(400);
    expect(await ChannelPost.countDocuments({ channelId: channel._id })).toBe(0);
  });

  it('still accepts the single picture older app versions upload as a company logo', async () => {
    const legacy = await upload(owner, 'company-logos');
    const res = await createPost(owner, { body: 'Shared a photo', bannerImage: legacy }).expect(201);
    const list = await request(app).get(posts()).set(...bearer(reader)).expect(200);
    expect(list.body.data.find((post) => post.id === res.body.data.id).images).toEqual([legacy]);
  });

  it('keeps one reaction per person, lets them change or remove it, and the feed shows the totals', async () => {
    const post = (await createPost(owner, { body: 'React to me' }).expect(201)).body.data;

    await request(app).put(posts(`/${post.id}/reaction`)).set(...bearer(reader)).send({ emoji: '👍' }).expect(200);
    await request(app).put(posts(`/${post.id}/reaction`)).set(...bearer(another)).send({ emoji: '👍' }).expect(200);
    const changed = await request(app).put(posts(`/${post.id}/reaction`)).set(...bearer(reader)).send({ emoji: '🎉' }).expect(200);
    expect(changed.body.data).toEqual({ reactions: [{ emoji: '👍', count: 1 }, { emoji: '🎉', count: 1 }], myReaction: '🎉' });

    const list = await request(app).get(posts()).set(...bearer(reader)).expect(200);
    expect(list.body.data[0]).toMatchObject({ myReaction: '🎉' });
    expect(list.body.data[0].reactions).toHaveLength(2);

    const removed = await request(app).delete(posts(`/${post.id}/reaction`)).set(...bearer(reader)).expect(200);
    expect(removed.body.data).toEqual({ reactions: [{ emoji: '👍', count: 1 }], myReaction: null });
    await request(app).put(posts(`/${post.id}/reaction`)).set(...bearer(reader)).send({ emoji: '💩' }).expect(400);
  });

  it('counts each person once as a viewer, and not the author', async () => {
    const post = (await createPost(owner, { body: 'Seen?' }).expect(201)).body.data;
    const view = (person) => request(app).post(posts('/views')).set(...bearer(person)).send({ postIds: [post.id] }).expect(200);

    expect((await view(reader)).body.data.counted).toBe(1);
    expect((await view(reader)).body.data.counted).toBe(0);
    await view(another);
    expect((await view(owner)).body.data.counted).toBe(0);

    const list = await request(app).get(posts()).set(...bearer(reader)).expect(200);
    expect(list.body.data[0].viewCount).toBe(2);
  });

  it('lets members respond and read the responses in order; only the writer or a group admin deletes one', async () => {
    const post = (await createPost(owner, { body: 'Questions welcome', hasRespondButton: true }).expect(201)).body.data;
    const respond = (person, body) => request(app).post(posts(`/${post.id}/responses`)).set(...bearer(person)).send({ body });

    const first = (await respond(reader, 'When is the deadline?').expect(201)).body.data;
    await respond(another, 'Is it open to graduates?').expect(201);
    await respond(reader, '   ').expect(400);

    const thread = await request(app).get(posts(`/${post.id}/responses`)).set(...bearer(reader)).expect(200);
    expect(thread.body.data.responses.map((row) => row.body)).toEqual(['When is the deadline?', 'Is it open to graduates?']);
    expect(thread.body.data.responses[0].authorName).toBe('Reader Person');
    expect(thread.body.data).toMatchObject({ total: 2, canManage: false });

    await request(app).delete(posts(`/${post.id}/responses/${first.id}`)).set(...bearer(another)).expect(403);
    await request(app).delete(posts(`/${post.id}/responses/${first.id}`)).set(...bearer(owner)).expect(200);
    expect((await ChannelPost.findById(post.id)).responseCount).toBe(1);
  });

  it('keeps people banned from the group out of reactions and responses', async () => {
    const post = (await createPost(owner, { body: 'Members only talk' }).expect(201)).body.data;
    await CommunityMembership.create({ channelId: channel._id, userId: reader._id, status: 'banned' });
    await request(app).put(posts(`/${post.id}/reaction`)).set(...bearer(reader)).send({ emoji: '👍' }).expect(403);
    await request(app).post(posts(`/${post.id}/responses`)).set(...bearer(reader)).send({ body: 'hello' }).expect(403);
  });

  it('a deleted post takes its reactions, views and responses with it', async () => {
    const post = (await createPost(owner, { body: 'Short-lived' }).expect(201)).body.data;
    await request(app).put(posts(`/${post.id}/reaction`)).set(...bearer(reader)).send({ emoji: '👍' }).expect(200);
    await request(app).post(posts('/views')).set(...bearer(reader)).send({ postIds: [post.id] }).expect(200);
    await request(app).post(posts(`/${post.id}/responses`)).set(...bearer(reader)).send({ body: 'Nice' }).expect(201);

    await ChannelPost.findByIdAndDelete(post.id);

    const counts = await Promise.all([ChannelPostReaction, ChannelPostView, ChannelPostResponse].map((Model) => Model.countDocuments({ postId: post.id })));
    expect(counts).toEqual([0, 0, 0]);
  });

  it('deleting an account removes its reactions and views and takes the name off its responses', async () => {
    const post = (await createPost(owner, { body: 'Goodbye test' }).expect(201)).body.data;
    await request(app).put(posts(`/${post.id}/reaction`)).set(...bearer(reader)).send({ emoji: '❤️' }).expect(200);
    await request(app).post(posts('/views')).set(...bearer(reader)).send({ postIds: [post.id] }).expect(200);
    await request(app).post(posts(`/${post.id}/responses`)).set(...bearer(reader)).send({ body: 'Thanks' }).expect(201);

    await deleteAccount(reader);

    expect(await ChannelPostReaction.countDocuments({ userId: reader._id })).toBe(0);
    expect(await ChannelPostView.countDocuments({ userId: reader._id })).toBe(0);
    const response = await ChannelPostResponse.findOne({ postId: post.id }).lean();
    expect(response.authorId).toBeNull();
    expect(response.authorName).not.toBe('Reader Person');
    expect((await ChannelPost.findById(post.id)).viewCount).toBe(1);
  });
});
