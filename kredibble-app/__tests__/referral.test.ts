import { applicationBody, asksForReferralCode, normalizeReferralCode } from '../src/lib/referral';

// GOD-T105: the app never sent an ambassador's referral code, so applications in the app were never credited to anyone.
describe('GOD-T105: referral codes on applications', () => {
  it('offers the field only on listings that ask for a code', () => {
    expect(asksForReferralCode({ referralCodeOnApply: true })).toBe(true);
    expect(asksForReferralCode({ referralOnApply: true })).toBe(true); // the older field name
    expect(asksForReferralCode({ referralCodeOnApply: false })).toBe(false);
    expect(asksForReferralCode(null)).toBe(false);
  });

  it('tidies a typed code the way the server stores it', () => {
    expect(normalizeReferralCode(' god-ab12cd ')).toBe('GOD-AB12CD');
    expect(normalizeReferralCode('GOD - AB12 CD')).toBe('GOD-AB12CD');
    expect(normalizeReferralCode('   ')).toBeUndefined();
    expect(normalizeReferralCode(undefined)).toBeUndefined();
  });

  it('sends the code with the application only when one was typed', () => {
    expect(applicationBody('Applied via the app', 'god-ab12cd')).toEqual({ coverLetter: 'Applied via the app', referralCode: 'GOD-AB12CD' });
    expect(applicationBody('Applied via the app', '')).toEqual({ coverLetter: 'Applied via the app' });
  });
});
