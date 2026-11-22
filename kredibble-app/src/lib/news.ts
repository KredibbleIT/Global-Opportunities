import { useCallback, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { request } from './api';

/** An article of the News feed (what the desk's news sources publish), ready for the screens. */
export interface NewsArticle {
  id: string;
  source: string;
  /** "Insight Ghana", "The African Journal". */
  sourceName: string;
  title: string;
  summary: string;
  /** The article, one string per paragraph. */
  body: string[];
  /** "Oct 8, 2026" ('' when the source gave no date). */
  date: string;
  publishedAt: string | null;
  readMinutes: number;
  imageUrl: string | null;
  /** The article on its own website. */
  url: string;
}

const WORDS_PER_MINUTE = 200;

const formatDate = (iso: string | null | undefined) => {
  const time = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(time)) return '';
  return new Date(time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** One item of GET /news as the screens use it. */
const toArticle = (item: any): NewsArticle => {
  const text = String(item.content || item.summary || '');
  const body = text.split(/\n+/).map(part => part.trim()).filter(Boolean);
  const words = text.split(/\s+/).filter(Boolean).length;
  return {
    id: String(item.id),
    source: String(item.source || ''),
    sourceName: String(item.sourceName || item.source || 'News'),
    title: String(item.title || ''),
    summary: String(item.summary || ''),
    body: body.length > 0 ? body : [String(item.summary || '')].filter(Boolean),
    date: formatDate(item.publishedAt),
    publishedAt: item.publishedAt ?? null,
    readMinutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)),
    imageUrl: item.imageUrl || null,
    url: String(item.url || ''),
  };
};

// Articles that have been read from the server, so an article opened from the list opens at once.
const known = new Map<string, NewsArticle>();
const remember = (articles: NewsArticle[]) => articles.forEach(article => known.set(article.id, article));

/** The latest articles, newest first. */
export async function getNews(source?: string): Promise<NewsArticle[]> {
  const query = source && source !== 'all' ? `?source=${encodeURIComponent(source)}&perPage=20` : '?perPage=20';
  const items = await request<any[]>(`/news${query}`);
  const articles = (Array.isArray(items) ? items : []).map(toArticle);
  remember(articles);
  return articles;
}

/** One article by id (from what was already read, or from the server). */
export async function getNewsArticle(id: string): Promise<NewsArticle | undefined> {
  const cached = known.get(id);
  if (cached) return cached;
  try {
    const article = toArticle(await request<any>(`/news/${encodeURIComponent(id)}`));
    remember([article]);
    return article;
  } catch {
    return undefined;
  }
}

/** The feed of one source ('all' for every source): the articles, whether it is still loading, and whether it could not be reached. */
export function useNews(source: string = 'all') {
  const [state, setState] = useState<{ source: string; articles: NewsArticle[]; failed: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    getNews(source)
      .then(articles => { if (active) setState({ source, articles, failed: false }); })
      .catch(() => { if (active) setState({ source, articles: [], failed: true }); });
    return () => { active = false; };
  }, [source]);
  const ready = state?.source === source;
  return { articles: ready ? state.articles : [], loading: !ready, failed: ready ? state.failed : false };
}

// ── Saved articles: the ids are kept on this phone ────────────────────────────────────────────────────────────────

const STORE_KEY = 'savedNewsIds';
const saved = new Set<string>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

SecureStore.getItemAsync(STORE_KEY)
  .then(raw => {
    if (!raw) return;
    const ids = JSON.parse(raw);
    if (Array.isArray(ids)) {
      ids.forEach(id => saved.add(String(id)));
      notify();
    }
  })
  .catch(() => {});

const persist = () => {
  SecureStore.setItemAsync(STORE_KEY, JSON.stringify([...saved])).catch(() => {});
};

/** Whether an article is saved, and how to save or unsave it (returns whether it is saved afterwards). */
export function useNewsSaved(id: string | undefined) {
  const [isSaved, setIsSaved] = useState(id ? saved.has(id) : false);

  useEffect(() => {
    if (!id) return;
    const sync = () => setIsSaved(saved.has(id));
    listeners.add(sync);
    return () => { listeners.delete(sync); };
  }, [id]);

  const toggle = useCallback(() => {
    if (!id) return false;
    if (saved.has(id)) saved.delete(id);
    else saved.add(id);
    persist();
    notify();
    return saved.has(id);
  }, [id]);

  return [isSaved, toggle] as const;
}

/** The saved articles, read from the server by their ids (one that no longer exists is left out). */
export function useSavedArticles() {
  const [version, bump] = useState(0);
  const [articles, setArticles] = useState<NewsArticle[] | null>(null);

  useEffect(() => {
    const sync = () => bump(n => n + 1);
    listeners.add(sync);
    return () => { listeners.delete(sync); };
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([...saved].map(id => getNewsArticle(id))).then(found => {
      if (active) setArticles(found.filter((article): article is NewsArticle => Boolean(article)));
    });
    return () => { active = false; };
  }, [version]);

  return { articles: articles ?? [], loading: articles === null };
}

export const initialsOf = (name: string) =>
  name.split(' ').map(part => part.charAt(0)).join('').slice(0, 2).toUpperCase();
