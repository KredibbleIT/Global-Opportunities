/**
 * SEC-151: where a hirer's own posting stands in the Desk's review, as "My postings" shows it.
 *
 * - live: approved and published, people can see it
 * - review: waiting for a staff decision (also after the hirer edits a rejected posting)
 * - rejected: turned down; the API sends the reason (its label) and the reviewer's note
 */
export type PostingReviewTone = 'live' | 'review' | 'rejected';

export interface PostingReview {
  tone: PostingReviewTone;
  label: string;
  /** Rejected only: the sentence the Desk chose, e.g. "The application link doesn't work". */
  reason?: string;
  /** Rejected only: the reviewer's note, when they wrote one. */
  note?: string;
}

/**
 * The review state of a posting from the fields the API returns.
 * @param posting moderationStatus, and for a rejection rejectionReasonLabel and rejectionNote
 */
export function postingReview(posting: {
  moderationStatus?: string | null;
  rejectionReasonLabel?: string | null;
  rejectionNote?: string | null;
}): PostingReview {
  const status = (posting.moderationStatus ?? '').toLowerCase();
  if (status === 'published' || status === 'approved') return { tone: 'live', label: 'Live' };
  if (status === 'rejected') {
    return {
      tone: 'rejected',
      label: 'Not approved',
      reason: posting.rejectionReasonLabel?.trim() || 'No reason was given',
      note: posting.rejectionNote?.trim() || undefined,
    };
  }
  return { tone: 'review', label: 'In review' };
}
