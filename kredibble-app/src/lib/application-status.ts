/**
 * Profile → Applications status (GOD-T91): turns the API's applications (GET /users/me/applications) into what the screen shows.
 *
 * Before 26 Nov 2026 the screen: printed "Ghana (Remote)" on every card; split everything into Jobs and Internships, so a fellowship or
 * scholarship was filed under Jobs; showed an offer as "Interview" and a shortlisting as "In review"; and said "No applications match
 * this filter" to someone who had never applied. This module keeps the real location, type and status, and the screen uses it.
 */

/** The stages a hirer moves an application through (the hirer screen sets Shortlisted, Interviewing and Offered). */
export type ApplicationStage = 'In review' | 'Shortlisted' | 'Interview' | 'Offered' | 'Rejected';

/** The filter pills, in order. */
export const STAGE_FILTERS = ['All', 'In review', 'Shortlisted', 'Interview', 'Offered', 'Rejected'] as const;
export type StageFilter = (typeof STAGE_FILTERS)[number];

export interface ApplicationCard {
  id: string;
  /** The listing, when it still exists; null when it was removed. */
  opportunityId: string | null;
  title: string;
  company: string;
  /** "Fellowship", "Job", … or "" when unknown. */
  typeLabel: string;
  location: string;
  stage: ApplicationStage;
  /** ISO date-time the application was sent, or "". */
  appliedAt: string;
}

/** The stage for an application's stored status. Anything not yet decided reads "In review". */
export function stageOf(rawStatus: unknown): ApplicationStage {
  const status = String(rawStatus ?? '').trim().toLowerCase();
  if (status === 'shortlisted') return 'Shortlisted';
  if (status === 'interviewing' || status === 'interview') return 'Interview';
  if (status === 'offered' || status === 'offer' || status === 'hired') return 'Offered';
  if (status === 'rejected' || status === 'declined') return 'Rejected';
  return 'In review';
}

const TYPE_LABELS: Record<string, string> = {
  job: 'Job',
  internship: 'Internship',
  scholarship: 'Scholarship',
  fellowship: 'Fellowship',
  competition: 'Competition',
  'training-workshop': 'Training',
  training: 'Training',
  grant: 'Grant',
  event: 'Event',
  volunteer: 'Volunteering',
  mentorship: 'Mentorship',
};

/** "Fellowship" for "fellowship" or "fellowships"; "" when the type is missing or unknown. */
export function typeLabelOf(rawType: unknown): string {
  const type = String(rawType ?? '').trim().toLowerCase();
  return TYPE_LABELS[type] ?? TYPE_LABELS[type.replace(/s$/, '')] ?? '';
}

/** One API application as a card. */
export function toApplicationCard(item: any): ApplicationCard {
  const opportunity = item?.opportunity && typeof item.opportunity === 'object' ? item.opportunity : null;
  return {
    id: String(item?.id ?? item?._id ?? ''),
    opportunityId: opportunity ? String(opportunity.id ?? opportunity._id ?? '') || null : null,
    title: opportunity?.title || 'A listing that was removed',
    company: opportunity?.company || '',
    typeLabel: typeLabelOf(opportunity?.type),
    location: opportunity?.location || '',
    stage: stageOf(item?.status),
    appliedAt: item?.createdAt ? String(item.createdAt) : '',
  };
}

/** The API answer (an array, or `{ data: [...] }`) as cards, newest first as the API sends them. */
export function toApplicationCards(response: unknown): ApplicationCard[] {
  const list = Array.isArray(response) ? response : Array.isArray((response as any)?.data) ? (response as any).data : [];
  return list.map(toApplicationCard);
}

/** The cards for one filter pill. */
export function filterByStage(cards: ApplicationCard[], filter: StageFilter): ApplicationCard[] {
  return filter === 'All' ? cards : cards.filter((card) => card.stage === filter);
}

/** "Applied 3 Nov 2026", or "" without a date. */
export function appliedLabel(appliedAt: string): string {
  const date = new Date(appliedAt);
  if (!appliedAt || Number.isNaN(date.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `Applied ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

/** What an empty list says: someone who never applied is told so, rather than that a filter hides everything. */
export function emptyMessage(totalCount: number, filter: StageFilter): string {
  if (totalCount === 0) return "You haven't applied to anything yet. Opportunities you apply to in the app appear here.";
  return filter === 'All' ? 'No applications yet.' : `No applications are ${filter === 'In review' ? 'in review' : filter.toLowerCase()} right now.`;
}
