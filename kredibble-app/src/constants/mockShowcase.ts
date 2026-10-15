/**
 * Showcase (the "Meet our people" page): the types the screen reads, SAMPLE data for development, and the one rule that decides what
 * is shown. The admin dashboard's Showcase page (kredibble-admin /showcase) is where people are added and hidden; the app only reads.
 *
 * - A category is a heading (Ambassadors, Team, Partners, Stakeholders, or any the admin added, such as Developers). A hidden category
 *   hides everything in it. An entry is Visible or Hidden; only visible ones are shown, in their order.
 * - SAMPLE_SHOWCASE is FAKE data (no real person). lib/showcase.ts returns it only in development builds (__DEV__), so a release build
 *   never shows invented people. TODO(backend): replace it with GET /api/v1/showcase (see task.md, the Showcase backend tasks).
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

const person = (id: string, categoryId: string, order: number, name: string, title: string, bio: string, country: string, visible = true): ShowcaseEntry => ({
  id, categoryId, order, name, title, bio, country, visible,
});

/** FAKE sample data for development only. */
export const SAMPLE_SHOWCASE: ShowcaseData = {
  categories: [
    { id: 'sc-ambassadors', key: 'ambassadors', name: 'Ambassadors', kind: 'person', order: 1, visible: true },
    { id: 'sc-team', key: 'team', name: 'Team', kind: 'person', order: 2, visible: true },
    { id: 'sc-partners', key: 'partners', name: 'Partners', kind: 'organisation', order: 3, visible: true },
    { id: 'sc-stakeholders', key: 'stakeholders', name: 'Stakeholders', kind: 'person', order: 4, visible: true },
  ],
  entries: [
    person('se-1', 'sc-ambassadors', 1, 'Test Ambassador One', 'Campus Lead, Example University', 'Shares scholarships and internships with students on campus.', 'Ghana'),
    person('se-2', 'sc-ambassadors', 2, 'Test Ambassador Two', 'Senior Ambassador', 'Runs weekly opportunity sessions for first-year students.', 'Nigeria'),
    person('se-3', 'sc-ambassadors', 3, 'Test Ambassador Three', 'Ambassador', 'Hidden example: this one is not shown.', 'Kenya', false),
    person('se-4', 'sc-team', 1, 'Test Desk Lead', 'Desk Lead', 'Leads the desk and the partner programme.', 'Ghana'),
    person('se-5', 'sc-team', 2, 'Test Developer One', 'Developer', 'Builds the mobile app and the admin dashboard.', 'Ghana'),
    person('se-6', 'sc-partners', 1, 'Example Partner Foundation', 'Funds graduate internships', 'A foundation that supports early-career programmes across West Africa.', 'Ghana'),
    person('se-7', 'sc-partners', 2, 'Sample Tech Company', 'Hires interns and graduates', 'A technology company with open internships every quarter.', 'Nigeria'),
    person('se-8', 'sc-stakeholders', 1, 'Test Stakeholder One', 'Programme adviser', 'Advises the desk on youth employment programmes.', 'Kenya'),
  ],
};
