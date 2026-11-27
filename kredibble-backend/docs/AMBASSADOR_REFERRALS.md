# Ambassador referral codes

How the desk gives ambassadors referral codes, how a referral is credited to an ambassador, and how it adds up on the
Leaderboard. Written for staff, with the technical detail at the end. Checked end to end on 27 Nov 2026 (task sheet GOD-T105;
the test is `tests/god-t105-referral-codes.test.js`).

## 1. Every ambassador gets one code

- The code is made **automatically** the first time an ambassador is saved: added in **Network → Add ambassador**, imported from a
  spreadsheet, approved from an app request, or created by the website. Nobody needs to type one.
- It looks like `GOD-AB12CD`: "GOD-" and six letters or digits. No two ambassadors share a code.
- Find it on the ambassador's page in **Network**, in the **Referral code** card, with a **Copy** button. Send it to the ambassador.
- Ambassadors in the app also see their own code on their Profile, under "Your results" (from GOD-T106, PR #222).
- A code can't be edited in the admin: the server only accepts a code when the ambassador is first created. If one must change
  (for example, it was misused), ask the IT team.

## 2. What counts as a referral

Each ambassador's monthly score on the **Leaderboard** has three parts. The ranking uses them in this order.

| Score | What it counts | How it gets there |
|---|---|---|
| **Verified sign-ups** | People staff record in **Database** with Source type **Ambassador** and **Linked ambassador** set, once verified | Staff, by hand (see 3c) |
| **Referred clicks** | Visits to a listing that arrive with the ambassador's code | Automatic, from the website and the API |
| **Shares** | Posts the desk records for the ambassador | Staff, with **Log amplification** on the ambassador's page |

An application sent with the code is also recorded against the ambassador. It shows on the listing's numbers, but it is not one
of the three Leaderboard scores.

## 3. How a referral is credited

**a. Visits (referred clicks).** The ambassador shares a listing link carrying their code. The website reports each visit to the
API with the code, and the visit is credited to that ambassador. The code is matched whatever its case; a code that doesn't
exist is refused, so it never counts.

**b. Applications in the app.** On a listing, staff can switch on **Referral code on apply** (Opportunities → the listing →
Edit → "Referral code on apply"). Then:

- **In the app**, when the person applies in the app, an optional **Ambassador referral code** box appears above Apply. If they
  type a code, the application is credited to that ambassador. A wrong code stops the application with "That referral code was
  not found", so they can correct it or clear it. (Before 27 Nov the app had no such box, so no app application was ever credited.)
- **On the website**, the code is added to the application link.
- Listings that send people to an outside application link (the **Application link** field) apply on that site, so the app can't
  attach a code there. Only the website visit is credited.
- When the switch is off, a code sent with an application is ignored.

**c. Sign-ups.** The app does not ask for a code when someone creates an account. A sign-up counts for an ambassador when staff
add the person in **Database** with Source type **Ambassador**, choose the **Linked ambassador**, and verify the record. The
month it was verified is the month it counts.

## 4. Where to see the results

- **Leaderboard** (admin): every ambassador for a month, ranked by verified sign-ups, then referred clicks, then shares.
- **Network → an ambassador → Impact this month**: what their code brought in so far this month.
- **In the app**: each ambassador sees their own rank and numbers on Profile, and the Leaderboard screen (since 27 Nov, GOD-T106).

## 5. Known gaps

- **Sign-ups are counted by hand.** The app's sign-up has no referral code field, so a referred sign-up is credited only once
  staff record and verify it (3c).
- **App visits carry no code.** Opening a listing in the app doesn't record a referred view, because app links don't carry the
  code. Referred clicks come from the website.
- **Hirer postings.** "Referral code on apply" is a setting on the desk's own listings. Jobs and internships posted by hirers don't
  ask for codes in the app.

## Technical reference

- Code generation: `Ambassador` pre-save hook (`src/models/AdminPortal.js`, `generateReferralCode`), unique sparse index on
  `referralCode`. Bulk import fills codes in batches (`routes/ambassadors.js`). The website can create an ambassador with its own
  code (`lib/website-sync.js`).
- Lookup: `findReferringAmbassador` (`routes/index.js`) upper-cases and trims the code; an unknown code is a 400 "Invalid
  referral code".
- Views: `POST /api/v1/opportunities/:id/views` `{ referralCode, source, visitorId }` (public) writes an `OpportunityEngagement`
  `view` with `ambassadorId`.
- Applications: `POST /api/v1/opportunities/:id/applicants` reads `referralCode` only when the listing has `referralCodeOnApply`.
  It sets `Applicant.ambassadorId` and `referralCode` and writes an `application` engagement. The app sends it from
  `src/app/opportunities/listing/[id].tsx` (`lib/referral.ts`).
- Score: `calculateLeaderboard` (`routes/admin-api.js`): shares and their clicks from `AmbassadorAmplification`, plus referred
  views from `OpportunityEngagement`, plus verified `Beneficiary` rows with `ambassadorId` in the month.
