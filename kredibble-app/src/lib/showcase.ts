/**
 * getShowcase: where the "Meet our people" screen gets its data, GET /api/v1/showcase (BE-030), open to any signed-in user.
 *
 * The server sends only visible categories with at least one visible entry, in order, with https photo URLs, and never the desk's
 * staff-only notes; the screen still applies the same rule (showcaseView). An error rejects with the API's message, which the
 * screen shows with a retry; an empty list shows its calm "nothing to show yet" state.
 */
import { request } from './api';
import type { ShowcaseData } from '../constants/mockShowcase';

export async function getShowcase(): Promise<ShowcaseData> {
  return request<ShowcaseData>('/showcase');
}
