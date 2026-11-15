/**
 * SEC-151: "My postings" tells a hirer where each posting stands, and why one was turned down.
 */
import { postingReview } from '../src/lib/posting-review';

describe('postingReview', () => {
  test.each([
    ['published', 'live', 'Live'],
    ['approved', 'live', 'Live'],
    ['pending', 'review', 'In review'],
    [undefined, 'review', 'In review'],
    ['Rejected', 'rejected', 'Not approved'],
  ])('%s reads %s ("%s")', (moderationStatus, tone, label) => {
    expect(postingReview({ moderationStatus })).toMatchObject({ tone, label });
  });

  test('a rejection carries the reason and the note', () => {
    expect(
      postingReview({
        moderationStatus: 'rejected',
        rejectionReasonLabel: "The application link doesn't work",
        rejectionNote: '  The link opens a 404 page.  ',
      }),
    ).toEqual({
      tone: 'rejected',
      label: 'Not approved',
      reason: "The application link doesn't work",
      note: 'The link opens a 404 page.',
    });
  });

  test('a rejection without a reason (made before SEC-151) still says so', () => {
    expect(postingReview({ moderationStatus: 'rejected' })).toEqual({
      tone: 'rejected',
      label: 'Not approved',
      reason: 'No reason was given',
      note: undefined,
    });
  });

  test('a live or pending posting has no reason, even if old fields linger', () => {
    expect(postingReview({ moderationStatus: 'published', rejectionReasonLabel: 'Old', rejectionNote: 'Old' })).toEqual({ tone: 'live', label: 'Live' });
  });
});
