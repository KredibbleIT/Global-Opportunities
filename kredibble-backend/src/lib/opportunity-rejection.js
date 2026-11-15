/**
 * SEC-151: why the Desk turned down a hirer's posting.
 *
 * The code is stored on the posting (`rejectionReason`); the label is what the hirer
 * reads, in the app and in the notice they are sent. The admin's reject dialog offers
 * the same codes (kredibble-admin/src/lib/rejection-reasons.ts, checked by
 * tests/sec-151-rejection-reason.test.js), so change both together.
 */
export const OPPORTUNITY_REJECTION_REASONS = Object.freeze({
  incomplete: 'Some details are missing or unclear',
  application_link: "The application link doesn't work",
  deadline_passed: 'The deadline has already passed',
  out_of_scope: "It isn't the kind of opportunity the Desk lists",
  duplicate: 'It is already listed',
  misleading: 'It looks misleading or unsafe',
  other: 'Another reason, explained in the note',
});

export const OPPORTUNITY_REJECTION_REASON_CODES = Object.freeze(Object.keys(OPPORTUNITY_REJECTION_REASONS));

/** The longest note a reviewer can add for the hirer. */
export const REJECTION_NOTE_MAX = 500;

/** An update that forgets a rejection (for writes that skip the model's save hooks). */
export const CLEARED_REJECTION = Object.freeze({ rejectionReason: null, rejectionNote: null, rejectedAt: null, rejectedBy: null });

/**
 * What the hirer reads for a stored reason code.
 * @param {string | undefined | null} code
 * @returns {string | null} null for a missing or unknown code
 */
export const rejectionReasonLabel = (code) =>
  (code && Object.hasOwn(OPPORTUNITY_REJECTION_REASONS, code) ? OPPORTUNITY_REJECTION_REASONS[code] : null);

/**
 * The notice a hirer gets when their posting is turned down.
 * @param {{ title: string, rejectionReason?: string, rejectionNote?: string }} posting
 * @returns {{ title: string, message: string }}
 */
export const rejectionNotice = ({ title, rejectionReason, rejectionNote }) => {
  const reason = rejectionReasonLabel(rejectionReason) ?? 'No reason was given';
  const note = rejectionNote ? ` Note from the reviewer: ${rejectionNote}` : '';
  return {
    title: 'Your posting was not approved',
    message: `"${title}" was not approved. Reason: ${reason}.${note} If you edit the posting, it goes back for review.`,
  };
};
