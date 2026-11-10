# Admin portal: test coverage of the review's open areas (GOD-T49)

The 4–5 November 2026 admin review ended with a list of things it could not check: "mobile/tablet widths; every populated empty-state page; all secondary detail records and form variants; complete keyboard/focus testing; backend persistence and app synchronization; real notification delivery; role-based access; application report PDF output."

This page maps each one to the automated tests that now cover it, and says plainly what is still not covered. Suites:

- `tests/admin.e2e.spec.ts`: Playwright, run twice in CI: against the real API (an in-memory MongoDB with a seeded admin), then in mock mode.
- `tests/session-roles.spec.ts`, `tests/role-lookups.spec.ts`, `tests/ambassadors-import-export.spec.ts`: Playwright.
- `kredibble-backend/tests/*.test.js`: Jest with an in-memory MongoDB.

| Area | Covered by | Still not covered |
|---|---|---|
| Phone widths | "Phone (434px)", "Database: phone (434px)", "Settings: phone (434px)", the 390px and 360px passes in the Monthly report and Social describes | — |
| Tablet widths | "Tablet widths (768 and 1024px): every main screen fits": 26 main screens, a title and no sideways scroll | Pixel-level layout review at tablet widths |
| Populated states | Mock mode runs every list on the sample data (120 Database records, 40 ambassadors and so on), so populated tables, counts and filters are exercised. The real-API run creates records and checks them: Database (manual and app registration), Programs, Partners, Social, Testimonials, Reports Queue, Notifications, curated listings | Populated scorecards and leaderboards against the real API (the e2e seed has no staff with metrics) |
| Detail records and form variants | "Detail pages: template" (one record of each kind), the listing, article, record, program and partner form describes, edit pages with prefilled values, the event and grant variants of the listing form | — |
| Keyboard and focus | "Touch targets and the skip link", menu and sheet keyboard tests (Escape, focus return, arrows), "Mobile drawer: focus trap, Esc, links", "One focus treatment on text fields", the form tests where the first invalid field takes focus, the tooltip-on-focus tests | A full manual screen-reader pass |
| Backend persistence | Real-API tests that save and then reload: Database records and verification, Reports Queue resolve, Notifications send, curated listings (GOD-T31), Settings targets and refused saves (GOD-T47), Reference data refused saves (GOD-T42), Programs, Partners, Social, Testimonials, ambassador import | — |
| App synchronisation | `kredibble-backend/tests/god-t3-app-beneficiaries.test.js` (an app registration reaches the admin Database, the backfill migration, deletion and export) and the API contract tests (`admin-api-contract.test.js`) that keep the admin and the API in step | An end-to-end run of the mobile app against the same API |
| Real notification delivery | Real-API "a broadcast is saved on the server" (GOD-T45); `sec-138-push-delivery.test.js` (the push to the audience's registered phones) and `push-token.test.js` (registering and rotating tokens) | Delivery to a physical device (Expo's push service is not called from CI) |
| Role-based access | `session-roles.spec.ts` and `role-lookups.spec.ts` sign in AS staff roles against the real API; the mock-mode role tests (`asRoles`) cover every screen and action per role; `sec-131-staff-screen-enforcement.test.js` and `sec-132-135-staff-authz.test.js` on the server | — |
| Report PDF output | "print to PDF (Chromium)": 1 page for the partner report and 2 for the team report; "GOD-T22: what a partner reads in the PDF": the sample label, the comparison period, the legend and the definitions, for a complete month and for the month to date | A live month: the report has no live data source yet (GOD-T1); the label switches off by itself when it does |

Run them locally: `npm run test:e2e` (real API), `npm run test:e2e:mock` (mock mode), `npm test` in `kredibble-backend`. On this machine, prefix the e2e runs with `APP_ENV=test` if the local backend `.env` sets `APP_ENV=production`.
