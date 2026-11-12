/**
 * Data for Career resources (/content/articles) and the article editor (/content/articles/new and /[id]) (SEC-157).
 *
 * - Mock mode: the sample articles (mock-articles.ts); saving only waits like a request would (nothing is kept), as before.
 * - Real mode: GET /admin/articles, GET /admin/articles/:id, POST /admin/articles and PATCH /admin/articles/:id. A cover image picked in
 *   the editor arrives as a data: URL and is uploaded first (POST /admin/upload?purpose=article-banner); the article stores its URL.
 *
 * What is published here is what the app's Career resources section lists. Errors reject with the server's message; a missing
 * article resolves with undefined ("not found").
 */
import { createArticle, getArticleById, getArticles, updateArticle, uploadArticleBanner, type ArticleInput, type ArticleRecord } from "@/lib/api";
import { articles as sampleArticles, type Article, type ArticleStatus } from "@/lib/mock-articles";
import { dataUrlToFile, fetchAll, orMissing } from "./api-helpers";
import { isMockMode } from "./mock-mode";

/** What the editor saves. */
export type ArticleDraft = Pick<Article, "title" | "summary" | "content" | "status" | "category" | "duration" | "bannerImage">;

/** Maps one API article to the page's shape (anything but "published" is a draft, so nothing goes public by accident). */
export function toArticle(record: ArticleRecord): Article {
  const status: ArticleStatus = record.status === "published" ? "published" : "draft";
  return {
    id: record.id,
    category: record.category,
    title: record.title,
    duration: record.duration ?? "",
    summary: record.summary,
    content: record.content,
    status,
    bannerImage: record.bannerImage || undefined,
  };
}

/** Every article: the samples in mock mode, the database's in real mode. */
export async function loadArticleRows(): Promise<Article[]> {
  if (isMockMode()) return sampleArticles;
  return (await fetchAll((page, limit) => getArticles({ page, limit }))).map(toArticle);
}

/** One article, or undefined when there is no such article. */
export async function loadArticle(id: string): Promise<Article | undefined> {
  if (isMockMode()) return sampleArticles.find((article) => article.id === id);
  return getArticleById(id).then(toArticle, orMissing<Article>);
}

/** A picked image (data: URL) is uploaded and replaced by its URL; a URL already stored is kept; no image clears it. */
async function bannerUrl(image: string | undefined): Promise<string | undefined> {
  if (!image || !image.startsWith("data:")) return image;
  const uploaded = await uploadArticleBanner(dataUrlToFile(image, "article-cover"));
  return uploaded.url;
}

/** Creates the article (id null) or saves changes to it, and resolves with what was saved. */
export async function saveArticle(id: string | null, draft: ArticleDraft): Promise<Article> {
  if (isMockMode()) {
    await new Promise((resolve) => setTimeout(resolve, 700)); // like a request; mock mode keeps nothing
    return { id: id ?? `article-${Date.now()}`, ...draft, duration: draft.duration ?? "" };
  }
  const input: ArticleInput = {
    title: draft.title.trim(),
    summary: draft.summary.trim(),
    content: draft.content,
    status: draft.status,
    category: draft.category.trim(),
    duration: draft.duration?.trim() || undefined,
    bannerImage: (await bannerUrl(draft.bannerImage)) ?? "",
  };
  return toArticle(id ? await updateArticle(id, input) : await createArticle(input));
}
