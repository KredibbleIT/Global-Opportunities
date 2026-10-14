import { Router } from 'express';
import { ApiError, asyncHandler, itemResponse, listResponse, notFound } from '../utils/http.js';
import { NewsItem, NEWS_SOURCES } from '../models/Content.js';
import { toPublicNewsItem } from '../lib/news-ingest.js';

export const newsRouter = Router();

// BE-022: the feed reads the ingested store (populated on a schedule via
// `npm run sync:news-ingest`). Staff-hidden items never appear here.
newsRouter.get('/', asyncHandler(async (req, res) => {
  const filter = { hidden: { $ne: true } };
  if (req.query.source) {
    if (!NEWS_SOURCES.includes(req.query.source)) throw new ApiError(400, 'Unknown news source');
    filter.source = req.query.source;
  }
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(20, Math.max(1, Number(req.query.perPage) || 10));
  const [items, total] = await Promise.all([
    NewsItem.find(filter).sort({ publishedAt: -1, _id: -1 }).skip((page - 1) * perPage).limit(perPage),
    NewsItem.countDocuments(filter),
  ]);
  listResponse(res, items.map(toPublicNewsItem), total, page, perPage);
}));

newsRouter.get('/:id', asyncHandler(async (req, res) => {
  const item = await NewsItem.findOne({ _id: req.params.id, hidden: { $ne: true } });
  if (!item) throw notFound('News item');
  itemResponse(res, toPublicNewsItem(item));
}));
