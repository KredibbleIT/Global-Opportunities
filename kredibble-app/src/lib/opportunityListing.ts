/**
 * Helpers shared by the category list and the listing detail screen (volunteering, scholarships, fellowships, training, mentorship): who offers a
 * listing, when it closes, which short facts its card shows and where "Apply" goes. They read the fields every listing already has
 * (organisation, location, country, format, deadline, cost, duration, apply link).
 */

export type Listing = Record<string, any>;

/** The organisation that offers the listing. */
export const orgOf = (item: Listing): string => item.offeringOrganization || item.organizer || item.company || '';

/** The listing's closing date, or null when it has none (or it cannot be read). */
export const deadlineOf = (item: Listing): Date | null => {
  const value = item.deadline ?? item.closesAt;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Whole days from today to the deadline (0 is today, negative is closed). Null without a deadline. */
export const daysLeft = (item: Listing, now: Date = new Date()): number | null => {
  const deadline = deadlineOf(item);
  if (!deadline) return null;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate()).getTime();
  return Math.round((end - start) / 86_400_000);
};

export type DeadlineTone = 'closed' | 'soon' | 'open' | 'none';

/** The deadline as a short badge: "Closes in 11 days", "Closes tomorrow", "Closes today", "Closed". */
export const deadlineBadge = (item: Listing, now: Date = new Date()): { text: string; tone: DeadlineTone } => {
  const left = daysLeft(item, now);
  if (left === null) return { text: 'Open', tone: 'none' };
  if (left < 0) return { text: 'Closed', tone: 'closed' };
  if (left === 0) return { text: 'Closes today', tone: 'soon' };
  if (left === 1) return { text: 'Closes tomorrow', tone: 'soon' };
  return { text: `Closes in ${left} days`, tone: left <= 14 ? 'soon' : 'open' };
};

export const isClosed = (item: Listing, now: Date = new Date()): boolean => {
  const left = daysLeft(item, now);
  return left !== null && left < 0;
};

export const isClosingSoon = (item: Listing, now: Date = new Date()): boolean => {
  const left = daysLeft(item, now);
  return left !== null && left >= 0 && left <= 14;
};

export const formatDeadline = (item: Listing): string | null => {
  const deadline = deadlineOf(item);
  return deadline ? deadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
};

const FORMAT_LABELS: Record<string, string> = { online: 'Online', 'in-person': 'In person', hybrid: 'Hybrid' };

export const formatLabel = (item: Listing): string | null => FORMAT_LABELS[String(item.format)] ?? null;

/** "Accra, Ghana": the location, and the country when it is not already part of it. */
export const placeOf = (item: Listing): string | null => {
  const location = String(item.location ?? '').trim();
  const country = String(item.country ?? '').trim();
  if (location && country && !location.toLowerCase().includes(country.toLowerCase())) return `${location}, ${country}`;
  return location || country || null;
};

/** How a listing is paid for, as the admin dashboard saves it (fundingType). */
export const FUNDING_LABELS: Record<string, string> = {
  free: 'Free',
  paid: 'Paid',
  'fully-funded': 'Fully funded',
  'partially-funded': 'Partially funded',
  stipend: 'Stipend',
  unfunded: 'Unfunded',
};

/** The funding as words: the structured type when the listing has one, else the free-text cost or fee. */
export const fundingOf = (item: Listing): string | null => FUNDING_LABELS[String(item.fundingType)] ?? (item.costLabel ? String(item.costLabel) : null);

export type ChipField = 'format' | 'duration' | 'cost' | 'place' | 'funding' | 'level' | 'focus' | 'certificate';

/** The short facts a card shows, in the order that matters for the category, without empty or repeated ones (at most four). */
export const cardChips = (item: Listing, fields: ChipField[]): string[] => {
  const values: Record<ChipField, string | null> = {
    format: formatLabel(item),
    duration: item.durationLabel ? String(item.durationLabel) : null,
    cost: item.costLabel ? String(item.costLabel) : null,
    place: placeOf(item),
    funding: fundingOf(item),
    level: item.level ? String(item.level) : null,
    focus: item.focusArea ? String(item.focusArea) : null,
    certificate: item.certificateOffered ? 'Certificate' : null,
  };
  const seen = new Set<string>();
  const chips: string[] = [];
  for (const field of fields) {
    const value = values[field]?.trim();
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    chips.push(value);
  }
  return chips.slice(0, 4);
};

/** Where Apply goes: the listing's own application link when it has one. */
export const applyUrlOf = (item: Listing): string | null => {
  const url = item.applyUrl || item.applicationUrl || item.applicationLink || item.externalReferenceUrl;
  return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null;
};

/** A text block as bullet lines ("- a", "• a" or one per line); one line stays a paragraph. */
export const toLines = (value: unknown): string[] =>
  typeof value === 'string'
    ? value.split('\n').map((line) => line.trim().replace(/^[•\-*]\s*/, '')).filter(Boolean)
    : [];

/** What a person can narrow a category list by: the structured details the admin saved. */
export type FacetField = 'funding' | 'level' | 'focus';

export const FACET_LABELS: Record<FacetField, string> = { funding: 'Funding', level: 'Level', focus: 'Focus' };

/** The value of one facet for a listing, or null when it has none. */
export const facetValue = (item: Listing, field: FacetField): string | null => {
  if (field === 'funding') return FUNDING_LABELS[String(item.fundingType)] ?? null;
  const value = field === 'level' ? item.level : item.focusArea;
  return value ? String(value) : null;
};

/** The values a facet has among these listings (each once, in alphabetical order): the choices the filter offers. */
export const facetValues = (items: Listing[], field: FacetField): string[] =>
  [...new Set(items.map((item) => facetValue(item, field)).filter((value): value is string => !!value))].sort((a, b) => a.localeCompare(b));

/** The chosen facet values, by facet. A listing passes a facet when no value is chosen for it or it has one of the chosen values. */
export type FacetSelection = Partial<Record<FacetField, string[]>>;

export const matchesFacets = (item: Listing, selection: FacetSelection, certificateOnly = false): boolean => {
  if (certificateOnly && !item.certificateOffered) return false;
  return (Object.keys(selection) as FacetField[]).every((field) => {
    const chosen = selection[field] ?? [];
    if (chosen.length === 0) return true;
    const value = facetValue(item, field);
    return value !== null && chosen.includes(value);
  });
};

/** How many filters are on (every chosen value, and the certificate switch). */
export const facetCount = (selection: FacetSelection, certificateOnly = false): number =>
  Object.values(selection).reduce((total, values) => total + (values?.length ?? 0), 0) + (certificateOnly ? 1 : 0);
