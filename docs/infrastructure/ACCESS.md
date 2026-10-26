# docs/infrastructure/ACCESS.md

# Infrastructure Access Matrix (SEC-114)

**Purpose:** Document who has access to each production resource, MFA status, and the second admin. Review quarterly.

**Status:** Draft — to be completed by company IT admin.

## 1. Personnel

| Name | Role | Company email | MFA | Admin on |
|------|------|---------------|-----|----------|
| | Developer / primary | | | GitHub, Vercel, Expo, Atlas, Render |
| | Second admin (backup) | | | GitHub, Vercel, Expo, Atlas, Render |

## 2. Access matrix

| Resource | Primary admin | Second admin | MFA (primary) | MFA (second) | Last reviewed |
|----------|---------------|--------------|---------------|--------------|---------------|
| GitHub org `KredibbleIT` | | | | | |
| Vercel company team | | | | | |
| Expo company org | | | | | |
| MongoDB Atlas org | | | | | |
| Cloudflare account | | | | | |
| Hostinger VPS | | | | | |
| Resend account | | | | | |
| Secrets vault | | | | | |

## 3. Break-glass procedure

- If the primary admin is unavailable, the second admin can recover access via the company password manager and provider account recovery.
- All production credentials (`JWT_SECRET`, `ADMIN_JWT_SECRET`, `DATABASE_URL`, `RESEND_API_KEY`, `CLOUDINARY_*`) are stored in the company vault, not in personal accounts or git.

## 4. Offboarding

- When a developer leaves, remove their access from all company accounts within 24 hours and rotate any secrets they knew.
