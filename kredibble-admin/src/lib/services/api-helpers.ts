/**
 * Small helpers the real-mode loaders share (directory.ts, verification.ts, ...).
 *
 * - MISSING: what a page shows for text the API does not send.
 * - fetchAll: reads every page of a paginated admin list.
 * - orMissing: turns a 404 into "no such record" (undefined); every other error is re-thrown.
 */
import { ApiError, type Paginated } from "@/lib/api";

export const MISSING = "—";

const PAGE_SIZE = 100;
const MAX_PAGES = 20;

/** Reads every page of an API list (up to MAX_PAGES x PAGE_SIZE records). */
export async function fetchAll<T>(getPage: (page: number, limit: number) => Promise<Paginated<T>>): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await getPage(page, PAGE_SIZE);
    rows.push(...result.data);
    if (page >= (result.meta?.pages ?? 1)) break;
  }
  return rows;
}

/**
 * Whether an id can name a database record (a 24-hex MongoDB id). The generic admin collections answer a malformed id with 400, not 404,
 * so a loader checks this first and treats anything else (a sample id such as "event-1") as "not found" without asking (SEC-157).
 */
export const isRecordId = (id: string): boolean => /^[0-9a-f]{24}$/i.test(id);

/** A 404 from the API means "no such record"; anything else is a real error. */
export const orMissing = <T>(error: unknown): T | undefined => {
  if (error instanceof ApiError && error.status === 404) return undefined;
  throw error;
};

/** A picked photo arrives from FileDrop as a base64 data: URL; the upload route takes a file. */
export function dataUrlToFile(dataUrl: string, baseName: string): File {
  const [header, base64 = ""] = dataUrl.split(",", 2);
  const type = /^data:([^;,]+)/.exec(header)?.[1] ?? "image/png";
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return new File([bytes], `${baseName}.${type.split("/")[1] ?? "png"}`, { type });
}
