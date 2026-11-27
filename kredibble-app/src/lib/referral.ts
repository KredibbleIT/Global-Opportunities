/**
 * Ambassador referral codes in the app (GOD-T105).
 *
 * A code ("GOD-AB12CD", made by the server when an ambassador is added) credits the ambassador who sent someone to a listing. When a
 * listing asks for one (`referralCodeOnApply`, set by staff on the listing), the apply screen offers an optional field and sends the
 * code with the application; the server checks it and links the application to that ambassador (an unknown code is refused with
 * "Invalid referral code", so the person can correct or clear it).
 */

/** True when the listing asks applicants for an ambassador's referral code. */
export function asksForReferralCode(listing: { referralCodeOnApply?: unknown; referralOnApply?: unknown } | null | undefined): boolean {
  return Boolean(listing?.referralCodeOnApply || listing?.referralOnApply);
}

/** A typed code as the server stores it ("god-ab12cd " → "GOD-AB12CD"), or undefined when nothing was typed. */
export function normalizeReferralCode(text: string | null | undefined): string | undefined {
  const code = String(text ?? '').replace(/\s+/g, '').toUpperCase();
  return code ? code : undefined;
}

/** The application body: the usual note, plus the code when one was typed. */
export function applicationBody(note: string, typedCode?: string | null): { coverLetter: string; referralCode?: string } {
  const referralCode = normalizeReferralCode(typedCode);
  return referralCode ? { coverLetter: note, referralCode } : { coverLetter: note };
}
