/**
 * Showcase (the "Meet our people" page): the types the screen reads and the one rule that decides what
 * is shown. The admin dashboard's Showcase page (kredibble-admin /showcase) is where people are added and hidden; the app only reads.
 *
 * - A category is a heading (Ambassadors, Team, Partners, Stakeholders, or any the admin added, such as Developers). A hidden category
 *   hides everything in it. An entry is Visible or Hidden; only visible ones are shown, in their order.
 * - The data comes from GET /api/v1/showcase (lib/showcase.ts, BE-030). There is no sample data: tests bring their own FAKE rows.
 */

export type ShowcaseKind = 'person' | 'organisation';

export interface ShowcaseCategory {
  id: string;
  key: 'ambassadors' | 'team' | 'partners' | 'stakeholders' | 'custom';
  name: string;
  kind: ShowcaseKind;
  order: number;
  visible: boolean;
}

export interface ShowcaseEntry {
  id: string;
  categoryId: string;
  name: string;
  /** Role or title for a person; what they do for an organisation. */
  title: string;
  bio: string;
  /** An https picture URL from the server. Without one the screen shows initials. */
  photoUrl?: string;
  country?: string;
  visible: boolean;
  order: number;
}

export interface ShowcaseData {
  categories: ShowcaseCategory[];
  entries: ShowcaseEntry[];
}

export interface ShowcaseGroup {
  category: ShowcaseCategory;
  entries: ShowcaseEntry[];
}

/** What the screen shows: visible categories in order, each with its visible entries in order. Empty categories are left out. */
export function showcaseView(data: ShowcaseData): ShowcaseGroup[] {
  return [...data.categories]
    .filter((category) => category.visible)
    .sort((a, b) => a.order - b.order)
    .map((category) => ({
      category,
      entries: data.entries.filter((entry) => entry.categoryId === category.id && entry.visible).sort((a, b) => a.order - b.order),
    }))
    .filter((group) => group.entries.length > 0);
}

/** One or two capital letters for the avatar: "Ama Boateng" -> "AB". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
