/**
 * Testimonials on "Meet our people" (GOD-T110): the stories the desk approved in the admin's Testimonials page.
 *
 * GET /api/v1/testimonials is public and returns only approved testimonials, newest first, never with the submitter's email
 * (routes/index.js publicTestimonial). This module loads them and turns them into what the screen shows; the screen adds a
 * "Testimonials" pill when there is at least one.
 */
import { request } from './api';

export interface TestimonialCard {
  id: string;
  name: string;
  /** "Fellow, Thrive Capital" or "" */
  role: string;
  quote: string;
  /** An https photo address, or null for initials. */
  photoUrl: string | null;
}

/** The pill and section id for testimonials; showcase categories use database ids, so it never clashes. */
export const TESTIMONIALS_ID = 'testimonials';

/** One API testimonial as a card, or null when it has no words to show. */
export function toTestimonialCard(item: any): TestimonialCard | null {
  const quote = String(item?.quote ?? item?.comment ?? '').trim();
  const name = String(item?.name ?? item?.author ?? '').trim();
  if (!quote || !name) return null;
  const photo = typeof item?.photo === 'string' && /^https:\/\//i.test(item.photo) ? item.photo : null;
  return {
    id: String(item?.id ?? item?._id ?? `${name}-${quote.slice(0, 20)}`),
    name,
    role: String(item?.role ?? '').trim(),
    quote,
    photoUrl: photo,
  };
}

/** The API answer (an array or `{ data: [...] }`) as cards, keeping only approved ones in case an older server sends more. */
export function toTestimonialCards(response: unknown): TestimonialCard[] {
  const list = Array.isArray(response) ? response : Array.isArray((response as any)?.data) ? (response as any).data : [];
  return list
    .filter((item: any) => !item?.status || item.status === 'approved')
    .map(toTestimonialCard)
    .filter((card: TestimonialCard | null): card is TestimonialCard => card !== null);
}

/** Approved testimonials, or [] when they cannot be loaded (the rest of the page still shows). */
export async function getApprovedTestimonials(): Promise<TestimonialCard[]> {
  try {
    return toTestimonialCards(await request<unknown>('/testimonials'));
  } catch {
    return [];
  }
}
