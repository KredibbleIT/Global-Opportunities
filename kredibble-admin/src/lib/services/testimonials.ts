/**
 * Testimonials service: the moderation queue of stories sent in by seekers, hirers and partners. One function per need; pages
 * never touch the store, the seed or the API directly. Two modes (services/mock-mode.ts):
 * - Real mode (the default): loadTestimonials reads every page of /admin/testimonials, and a failure is an error (never a
 *   silent switch to the sample data). moderateTestimonial waits for the API, so a refused move reaches the page; after it,
 *   notifyTestimonialsChanged() makes open pages load again. The sidebar's pending count comes from the dashboard summary.
 * - Mock mode: everything lives in the shared in-memory mock store, so the tab counts, the sidebar pill and the Overview
 *   attention card read the same list. Mock writes never call the API.
 *
 * Rules kept here, not in the page:
 * - ACTIONS by status: a pending item can be approved or rejected; an approved item can be unpublished; an unpublished or a
 *   rejected item can be re-approved. Nothing else moves an item (the server enforces the same moves).
 * - The EMAIL is staff-only. publicPreview() is what the public sees (name, comment and a photo placeholder): it has no email
 *   field at all, so the preview cannot show one.
 */
import { getMockCollection, setMockCollection, subscribeMockStore } from "@/lib/mock-store";
import { TESTIMONIAL_STATUSES, type Testimonial, type TestimonialStatus } from "@/lib/mock-entities";
import { isMockMode } from "./mock-mode";
import { fetchAll } from "./api-helpers";
import { getTestimonialsApi, moderateTestimonialApi, type TestimonialApiRecord } from "@/lib/api";

const MOCK_DELAY_MS = 300;
let loadedOnce = false;
const afterDelay = <T>(value: T) => {
  if (loadedOnce) return Promise.resolve(value);
  return new Promise<T>((resolve) =>
    setTimeout(() => {
      loadedOnce = true;
      resolve(value);
    }, MOCK_DELAY_MS),
  );
};

// Real mode: moves do not go through the store, so they tell the open pages through these listeners instead.
const liveListeners = new Set<() => void>();

/** Tells every open Testimonials page that the data changed (real mode: after a move). */
export const notifyTestimonialsChanged = (): void => liveListeners.forEach((listener) => listener());

/** Re-run a loader whenever the testimonials change: a store change (mock mode) or a saved move (real mode). */
export function subscribeTestimonials(listener: () => void): () => void {
  const unsubscribeStore = subscribeMockStore(listener);
  liveListeners.add(listener);
  return () => {
    unsubscribeStore();
    liveListeners.delete(listener);
  };
}

export type TestimonialAction = "approve" | "reject" | "unpublish" | "reapprove";

/** The actions each status offers, and where each one leads. */
export const ACTIONS_BY_STATUS: Record<TestimonialStatus, TestimonialAction[]> = {
  pending: ["approve", "reject"],
  approved: ["unpublish"],
  unpublished: ["reapprove"],
  rejected: ["reapprove"],
};
export const ACTION_RESULT: Record<TestimonialAction, TestimonialStatus> = { approve: "approved", reject: "rejected", unpublish: "unpublished", reapprove: "approved" };

/** How many items are in each status. */
export function testimonialCounts(list: readonly Pick<Testimonial, "status">[]): Record<TestimonialStatus, number> {
  const counts = Object.fromEntries(TESTIMONIAL_STATUSES.map((status) => [status, 0])) as Record<TestimonialStatus, number>;
  for (const item of list) counts[item.status] += 1;
  return counts;
}

/** What the public sees of an approved item: the name, the comment and a photo placeholder (initials). NEVER the email. */
export const publicPreview = (item: Pick<Testimonial, "author" | "quote">): { name: string; comment: string } => ({ name: item.author, comment: item.quote });

/** Newest first. */
export const sortTestimonials = (list: readonly Testimonial[]): Testimonial[] => [...list].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt) || b.id.localeCompare(a.id));

/** An API testimonial as the page's Testimonial. */
const toTestimonial = (record: TestimonialApiRecord): Testimonial => ({
  id: record.id,
  author: record.author || record.name,
  email: record.email,
  role: record.role || "",
  quote: record.quote || record.comment,
  status: record.status,
  submittedAt: record.submittedAt,
});

/** Every testimonial, newest first. Real mode: every page from the API; an API failure is an error the page shows. */
export async function loadTestimonials(): Promise<Testimonial[]> {
  if (!isMockMode()) {
    const records = await fetchAll((page, limit) => getTestimonialsApi({ page, limit }));
    return sortTestimonials(records.map(toTestimonial));
  }
  return afterDelay(sortTestimonials(getMockCollection("testimonials")));
}

/** Mock store: moves an item with one of its actions. Undefined when the item is missing or the action is not offered. */
export function applyTestimonialAction(id: string, action: TestimonialAction): Testimonial | undefined {
  const list = getMockCollection("testimonials");
  const current = list.find((item) => item.id === id);
  if (!current || !ACTIONS_BY_STATUS[current.status].includes(action)) return undefined;
  const next: Testimonial = { ...current, status: ACTION_RESULT[action] };
  setMockCollection("testimonials", list.map((item) => (item.id === id ? next : item)), { always: true });
  return next;
}

/**
 * Moves an item with one of its actions. Resolves with the moved item, or undefined when the action is not offered for its
 * status. Real mode: waits for the API and rejects with its message (for example a move another moderator already made).
 */
export async function moderateTestimonial(item: Testimonial, action: TestimonialAction): Promise<Testimonial | undefined> {
  if (isMockMode()) return applyTestimonialAction(item.id, action);
  if (!ACTIONS_BY_STATUS[item.status].includes(action)) return undefined;
  const moved = await moderateTestimonialApi(item.id, { action });
  notifyTestimonialsChanged();
  return toTestimonial(moved);
}
