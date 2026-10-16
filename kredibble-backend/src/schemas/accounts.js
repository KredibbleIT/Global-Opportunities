import { z } from 'zod';
import { ROLE_IDS } from '../lib/permissions.js';
import { passwordSchema } from './auth.js';

// BE-028: team account creation (Team > Members). Mirrors the client rules in
// kredibble-admin/src/lib/accounts.ts so the server enforces the same shape:
// only `user`/`admin` types, never `super_admin`; an admin holds one desk
// group (Admin Support by default), a user holds Support.

export const ACCOUNT_TYPES = ['user', 'admin'];
export const USER_ROLE = 'support';
export const DEFAULT_ADMIN_ROLE = 'admin_support';
// Every role except Super Admin (never creatable here) and Support (what a
// User account is). Matches the client's ADMIN_GROUPS.
export const ADMIN_GROUPS = ROLE_IDS.filter((role) => role !== 'super_admin' && role !== USER_ROLE);

export const rolesForAccount = (type, group) =>
  type === 'user' ? [USER_ROLE] : [group || DEFAULT_ADMIN_ROLE];

const nameSchema = z.string().trim().min(1, 'Name is required').max(100, 'Name is too long');
const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);

export const createAccountSchema = z.object({
  body: z.object({
    name: nameSchema,
    email: emailSchema,
    type: z.enum(ACCOUNT_TYPES),
    group: z.string().trim().optional(),
  }).refine(
    (d) => d.type !== 'admin' || !d.group || ADMIN_GROUPS.includes(d.group),
    { message: 'Choose a valid team group', path: ['group'] },
  ),
});

export const changeAccountRoleSchema = z.object({
  body: z.object({
    type: z.enum(ACCOUNT_TYPES),
    group: z.string().trim().optional(),
  }).refine(
    (d) => d.type !== 'admin' || !d.group || ADMIN_GROUPS.includes(d.group),
    { message: 'Choose a valid team group', path: ['group'] },
  ),
});

// Public invite acceptance: 32-byte hex token + full password policy. The
// only place a team password is ever received.
export const acceptInviteSchema = z.object({
  body: z.object({
    token: z.string().regex(/^[0-9a-f]{64}$/i, 'Invalid invite token'),
    password: passwordSchema,
  }),
});

export const accountAuditQuerySchema = z.object({
  query: z.object({
    scope: z.literal('accounts', { message: 'Only scope=accounts is served here' }),
    page: z.string().regex(/^\d+$/).optional(),
    limit: z.string().regex(/^\d+$/).optional(),
  }),
});
