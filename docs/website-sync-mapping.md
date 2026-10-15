# Website ↔ App Sync Field Mapping (BE-026)

How website (WordPress) content flows into the app, and who wins when both
sides changed a record (open question 5, resolved as proposed):

- **Content** (titles, descriptions, profile fields): the **website wins**.
- **Activity and moderation state** (counters, vetting, referral activity,
  status lifecycles): the **app wins** and website values are ignored.

Transport: signed webhook (`POST /api/v1/sync/website-webhook`, HMAC-SHA256
`X-Kredibble-Signature: v1=<hex>` over `<unix-timestamp>.<raw-body>`, timestamp
in `X-Kredibble-Timestamp`, 5-minute replay window, per-`eventId` dedupe) plus
a scheduled pull safety net (`npm run sync:website-pull`). Every delivery is
journaled as a `SyncEvent`; failures are retried from `GET|POST
/api/v1/admin/sync/events`. Shared secret: `WEBSITE_WEBHOOK_SECRET`.

## Opportunities (external id = `wordpressSync.wordpressId`)

| Website field | App field | Winner |
|---|---|---|
| `title` | `title` (required) | website |
| `type` / category | `type` (enum; singular/plural swap accepted, else the event fails for retry) | website |
| `company` / `organization` | `company`, `offeringOrganization` (required) | website |
| `location` | `location` (required) | website |
| `description` | `description` (required) | website |
| `deadline`, `closesAt` | `deadline`, `closesAt` (parsed dates) | website |
| `applyUrl`, `applicationUrl`, `applicationLink` | same | website |
| `coverImage`, `logoUrl`, `imageUrl`, `images` | same | website |
| `externalReferenceUrl` | `externalReferenceUrl` | website |
| `costLabel`, `durationLabel`, `format`, `country`, `salary`, `workType`, `eligibility`, `benefits`, `organizer`, category extras | same | website |
| — | `status` | **app: always reset to `draft`** |
| — | `moderationStatus` | **app: always reset to `pending`** |
| — | `vetted`, `vettedBy`, `vettedAt`, `publishedAt` | **app: cleared (staff must re-vet)** |
| — | `createdBy`, `hirerId` | **app: never overwritten** |
| — | `views`, `applications`, `applicantsCount` | **app: never overwritten** |

Inbound listings always land as unvetted drafts (BE-011 invariant: publishing
requires vetting). Re-deliveries update content but never re-publish.

## Ambassadors (external id = `referralCode`, email fallback links pre-existing)

| Website field | App field | Winner |
|---|---|---|
| `fullName` (required), `email` (required, valid) | same (email lowercased) | website |
| `phone`, `country`, `city`, `campus`, `profilePhoto`, `memberType`, `roleTitle`, `description`, `tier` | same | website |
| `status` | `status` on create only (default `active`) | website on create, **app afterwards** |
| `wordpressId` | `wordpressSync.wordpressId` (stored when present) | website |
| — | `linkedUserId` | **app: never overwritten** |
| — | amplification logs, clicks, tiers earned in-app | **app: untouched** |
| — | `status` transitions, `dormantSince` | **app lifecycle** |

New website ambassadors are created `active` unless the payload carries a
valid lifecycle status. Matching is by `referralCode` first, then email (which
links the code instead of duplicating).

## News

No store yet: the feed is still the live WordPress proxy (`GET /api/v1/news`).
News receivers plug into `SYNC_HANDLERS` in `src/lib/website-sync.js` when
BE-022 lands its `NewsItem` store — the signature, journal and retry transport
is resource-agnostic and needs no changes.
