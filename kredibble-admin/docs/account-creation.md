# Create account (Team > Members): security notes and what the backend must do

Status: **frontend only, mock data.** The admin UI creates accounts in an in-memory list. Nothing here is enforced by a server yet.
Everything marked "TODO(backend)" in the code points back to this page.

## What the screen does

- Team > Members has a **Create account** button, an **Account history** button and a row menu. They exist only for a **Super Admin**
  (permission `accounts.create`, in `src/config/permissions.ts`; Desk Lead does not have it).
- The form takes a full name, an email, a role (**User** or **Admin**, never Super Admin) and, for an Admin, an optional team /
  permission group (one of the existing desk roles; Admin Support if none is chosen). A User holds the lowest-access role (Support).
- The account is created **Invited**. A mock invite link (valid 48 hours, one use) is shown **once** in a copy dialog. The new person
  sets their own password from that link. **Nobody, including the Super Admin, sees or types a password**, and there is no "set the
  password for them" option.
- States: Invited -> Active <-> Deactivated. Row actions: Resend invite (Invited only), Make Admin / Make User, Deactivate /
  Reactivate. A person cannot deactivate or demote themselves, and the last active Super Admin cannot be deactivated or demoted.
- Every create, resend, role change, deactivate and reactivate writes an audit entry (who, which account, what, when).

## Why the frontend check is not security

The button is hidden and each handler re-checks the permission, but that only guides honest users. Anyone can call the API directly,
so **every rule below must be enforced on the server**. The frontend code in `src/lib/accounts.ts` is written so the same rules can be
copied to the server.

## What the backend must provide (hand this to the backend developer)

Endpoints (names are suggestions; all under `/api/v1/admin`, all require an admin session, never a public route):

| Endpoint | Purpose |
|---|---|
| `POST /accounts` | Create an account in the **invited** state. Body: `name`, `email`, `type` (`user` or `admin`), optional `group` (a role id). Returns the account and, only if no email service exists yet, the one-time invite link. **Never** accepts a password. |
| `POST /accounts/:id/invite` | Resend: invalidate the old invite token, issue a new one (48 hours). Only for an invited account. |
| `PATCH /accounts/:id/role` | Change between `user` and `admin` (and the group). |
| `POST /accounts/:id/deactivate` and `POST /accounts/:id/reactivate` | Switch an account off / on. Deactivating also revokes its sessions (bump `tokenVersion`) and refresh tokens. |
| `POST /auth/accept-invite` | Public, rate limited. Body: `token`, `password`. Checks the token (unexpired, unused), applies the password policy, hashes the password (bcrypt, cost 12 or higher), sets the account **active**, burns the token. This is the only place a password is ever received. |
| `GET /audit-log?scope=accounts` | Read the audit trail (admin only). |

Rules the server must enforce (not only the UI):

1. **Role check on create**: only a Super Admin may call `POST /accounts`, resend, role change, deactivate and reactivate. Return 403
   otherwise. Do not trust a role sent by the client; read it from the verified token.
2. **No Super Admin through this endpoint**: reject `type` other than `user` / `admin`, and reject any group or role equal to
   `super_admin`. Creating or promoting a Super Admin needs a separate, more protected path (for example a console command or a
   two-person approval).
3. **Unique email**, compared trimmed and lowercase, enforced by a unique index (race-safe), not only by a check.
4. **Rate limiting** on create, resend and accept-invite (per admin and per IP), so the endpoints cannot be used to spam invites or
   guess tokens.
5. **Invite token**: at least 32 random bytes from a cryptographic source; store only a **hash** of it (like a password reset token);
   single use; expires after 48 hours; a resend invalidates the earlier token; compare in constant time; never log it or put it in an
   audit entry (the UI keeps only its last four characters to tell two invites apart).
6. **Self and last-Super-Admin guards**: refuse deactivating or demoting yourself, and refuse any change that would leave zero
   active Super Admins. Do the count inside a transaction.
7. **State rules**: resend only while invited; reactivate only while deactivated; role change not on a deactivated account; an
   invited account cannot sign in.
8. **Audit log written by the server**, in the same transaction as the change, so it cannot be skipped: actor id, target id, action,
   old and new values, time, IP. Never a password, a token or a full link.
9. **Email**: the invite email is sent by the server (`lib/email.js` exists in the backend). Until then the link is returned once to
   the Super Admin. Send to the address on the account only; never put the token in a URL that is logged by a proxy (use a path or a
   POST body, and `Referrer-Policy: no-referrer`).
10. **Password policy** lives only on the accept-invite endpoint and the existing login: minimum length, a breach / common-password
    check, and the existing lockout rules.
11. **Validation** with the shared Zod `validate` middleware on every route (name length, email format, enum for type and group).

## Open questions for the product owner

- A "User" account here is a portal account with the Support role. Seekers and hirers (the people using the mobile app) are created
  by registering in the app and are not created from this screen. Is that what is wanted?
- Should an Admin be allowed to hold the Desk Lead group? It has every screen except Roles & permissions edit and this feature.
- Who sends the invite until the email job exists, and who should be notified when an invite expires unused?
