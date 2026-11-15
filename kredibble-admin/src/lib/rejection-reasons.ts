/**
 * SEC-151: why a hirer's posting is turned down. The reject dialog offers these; the code is saved on the posting and
 * the label is what the hirer reads in the app and in the notice they get.
 *
 * Mirrors kredibble-backend/src/lib/opportunity-rejection.js, and a backend test
 * (tests/sec-151-rejection-reason.test.js) fails if the two lists differ, so change both together.
 */
export const REJECTION_REASONS = [
  { code: "incomplete", label: "Some details are missing or unclear" },
  { code: "application_link", label: "The application link doesn't work" },
  { code: "deadline_passed", label: "The deadline has already passed" },
  { code: "out_of_scope", label: "It isn't the kind of opportunity the Desk lists" },
  { code: "duplicate", label: "It is already listed" },
  { code: "misleading", label: "It looks misleading or unsafe" },
  { code: "other", label: "Another reason, explained in the note" },
] as const;

export type RejectionReasonCode = (typeof REJECTION_REASONS)[number]["code"];

/** The longest note a reviewer can add for the hirer (the API refuses longer). */
export const REJECTION_NOTE_MAX = 500;

/** The hirer-facing label for a stored code, or undefined for none or an unknown code. */
export const rejectionReasonLabel = (code: string | undefined): string | undefined =>
  REJECTION_REASONS.find((reason) => reason.code === code)?.label;
