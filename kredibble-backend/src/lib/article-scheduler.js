import { Article } from '../models/Content.js';

/**
 * GOD-T73: marks scheduled Career resources articles published once their publishAt has passed. Every API instance runs this each
 * minute (server.js, with the scheduled notifications). One updateMany is safe when two instances run it at once: both set the
 * same status. The app already shows a due article before this runs (articleReadScope in routes/index.js), so this keeps the admin's
 * status truthful rather than deciding what seekers see.
 *
 * @param {{ now?: Date }} [options]
 * @returns {Promise<{ published: number }>} how many articles were published
 */
export async function publishDueArticles({ now = new Date() } = {}) {
  const result = await Article.updateMany(
    { status: 'scheduled', publishAt: { $lte: now } },
    { $set: { status: 'published' } },
  );
  return { published: result.modifiedCount ?? 0 };
}
