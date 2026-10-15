/**
 * getShowcase: where the "Meet our people" screen gets its data.
 *
 * There is no showcase endpoint yet, so this returns FAKE sample data in development builds only (__DEV__) and an empty list in a
 * release build: the screen then shows its calm "nothing to show yet" state instead of invented people.
 * TODO(backend): replace the body with `GET /api/v1/showcase` (public to signed-in users; returns only visible categories and entries,
 * with https photo URLs), mapped to ShowcaseData. See task.md, the Showcase backend tasks. Keep the signature: the screen already handles
 * loading, error (with retry) and empty.
 */
import { SAMPLE_SHOWCASE, type ShowcaseData } from '../constants/mockShowcase';

export async function getShowcase(): Promise<ShowcaseData> {
  if (__DEV__) return SAMPLE_SHOWCASE;
  return { categories: [], entries: [] };
}
