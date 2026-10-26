# docs/infrastructure/ACCOUNTS.md

# Company Infrastructure Accounts (SEC-114)

**Purpose:** Record that every production resource is owned by a company account (not a personal developer account), with MFA enabled and a second admin. Track M / Plan 4g.

**Status:** Draft — to be completed by company IT admin.

## 1. Account inventory

| Resource | Provider | Company account (not personal) | Owner email | MFA | Second admin | Notes |
|----------|----------|-------------------------------|-------------|-----|--------------|-------|
| GitHub repository | GitHub | `KredibbleIT` org | | | | `Aeomar999/Global-Opportunities` → transfer to org |
| Container images | GHCR | `KredibbleIT` org | | | | `ghcr.io/kredibbleit/...` |
| Mobile builds/OTA | Expo | Company Expo org | | | | `app.json` owner: `kredibble-it` (company org) |
| Admin dashboard | Vercel | Company Vercel team | | | | Scope `jerry-amoahs-projects` → company team |
| API hosting | Render | Company Render org | | | | `kredibble-api` service → company org |
| Database | MongoDB Atlas | Company Atlas org | | | | Projects `god-production`, `god-staging` |
| DNS / edge | Cloudflare | Company Cloudflare account | | | | `globalopportunitydesk.com` zone |
| VPS / edge proxy | Hostinger | Company Hostinger account | | | | `187.7.72.87` |
| Transactional email | Resend | Company Resend account | | | | Domain `kredibble.app` verification (SEC-091) |
| Apple Developer Program | Apple | Company Apple Developer account | | | | DUNS `780481031`; used for App Store Connect org enrollment |
| Google Play Console | Google | Company Google Play developer account | | | | One-time $25 USD fee; used for Play Console |
| Secrets / password manager | (TBD) | Company vault | | | | `JWT_SECRET`, `ADMIN_JWT_SECRET`, DB credentials |

## 2. Acceptance criteria (SEC-114)

- [ ] Every production resource is owned by a company account with MFA
- [ ] A second admin (not the developer) has access to each account
- [ ] Ownership recorded here (`docs/infrastructure/ACCOUNTS.md`)
- [ ] Access matrix in `docs/infrastructure/ACCESS.md`

## 3. Migration notes

- GitHub: transfer repo `Aeomar999/Global-Opportunities` → `KredibbleIT/Global-Opportunities`, or create org `KredibbleIT` and move the repo.
- GHCR: images already under `kredibbleit` (cutover used `ghcr.io/kredibbleit/...`); ensure the org owns the namespace.
- Expo: create company org, transfer `kredibble-app`, update `app.json` `"owner"`.
- Vercel: create company team, transfer project, update `render.yaml` `CORS_ORIGIN` if needed.
- Render: create company org, transfer `kredibble-api` service, rotate `JWT_SECRET`/`ADMIN_JWT_SECRET`.
- Atlas: create company org, projects `god-production` and `god-staging`, least-privilege users per environment, MFA, IP allowlist (VPS + Render during transition).
