import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { requireAdminAuth } from '../middleware/auth.js';
import { resolveStaffRoles } from '../middleware/portal-auth.js';
import { validate } from '../middleware/validate.js';
import {
  ApiError,
  asyncHandler,
  itemResponse,
  listResponse,
  notFound,
  parsePagination,
} from '../utils/http.js';
import { User, StaffMember } from '../models/User.js';
import { AccountInvite } from '../models/AdminPortal.js';
import { auditReq, AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES, AuditLog } from '../lib/audit.js';
import { accountInviteLimiter } from '../lib/rate-limiters.js';
import { hashInviteToken, mintInviteToken, INVITE_HOURS } from '../lib/invite-tokens.js';
import { sendInviteEmail } from '../lib/email.js';
import { revokeAllSessions } from './auth.js';
import {
  rolesForAccount,
  createAccountSchema,
  changeAccountRoleSchema,
  accountAuditQuerySchema,
} from '../schemas/accounts.js';

export const accountsRouter = Router();
const ACCOUNT_AUDIT_ACTIONS = [
  AUDIT_ACTIONS.ACCOUNT_INVITE,
  AUDIT_ACTIONS.ACCOUNT_INVITE_RESEND,
  AUDIT_ACTIONS.ACCOUNT_ROLE_CHANGE,
  AUDIT_ACTIONS.ACCOUNT_DEACTIVATE,
  AUDIT_ACTIONS.ACCOUNT_REACTIVATE,
  AUDIT_ACTIONS.ACCOUNT_ACTIVATE,
];

// Path-style link (token in a path segment, never a query string). Relative
// when ADMIN_APP_URL is unset; the admin panel prefixes its own origin.
const inviteUrlFor = (token) => `${env.adminAppUrl}/accept-invite/${token}`;

// Mongoose document -> `{ id, ...rest }` without internal fields (same shape
// as the admin data routes).
const toClientObject = (document) => {
  if (!document) return null;
  const value = document.toJSON ? document.toJSON() : document;
  return { id: value.id || value._id?.toString(), ...value, _id: undefined, __v: undefined };
};

/**
 * BE-028: Super-Admin-only guard. The caller's roles come from
 * resolveStaffRoles (SEC-131): an active StaffMember record, or super_admin
 * for the CLI-provisioned root admin, which has no staff record. Staff
 * members whose record is not active get no fallback: suspension/invitation
 * revokes this access even if a stale token somehow passes the session check.
 */
export const requireSuperAdmin = async (req, res, next) => {
  try {
    const { roles, staff } = await resolveStaffRoles(req);
    if (!roles.includes('super_admin')) {
      return next(new ApiError(403, 'Super Admin access required'));
    }
    req.superAdminStaff = staff;
    return next();
  } catch (error) {
    return next(error);
  }
};

const activeSuperAdminCountExcluding = (excludeStaffId) =>
  StaffMember.countDocuments({ roles: 'super_admin', status: 'active', _id: { $ne: excludeStaffId } });

const loadStaff = async (id) => {
  if (!id) throw notFound('Account');
  const staff = await StaffMember.findById(id);
  if (!staff) throw notFound('Account');
  return staff;
};

// POST /admin/accounts — invite a User or Admin (invited state, never a password).
accountsRouter.post(
  '/accounts',
  requireAdminAuth,
  requireSuperAdmin,
  accountInviteLimiter,
  validate(createAccountSchema),
  asyncHandler(async (req, res) => {
    const emailNorm = req.body.email.trim().toLowerCase();
    const roles = rolesForAccount(req.body.type, req.body.group || '');

    const existingUser = await User.findOne({ emailNormalized: emailNorm, role: { $ne: 'deleted' } })
      .select('_id')
      .lean();
    if (existingUser) throw new ApiError(409, 'An account with this email already exists');
    const existingStaff = await StaffMember.findOne({ email: emailNorm }).select('_id').lean();
    if (existingStaff) throw new ApiError(409, 'An account with this email already exists');

    const randomPassword = mintInviteToken();
    const user = await User.create({
      name: req.body.name.trim(),
      email: req.body.email.trim(),
      emailNormalized: emailNorm,
      role: 'admin',
      emailVerified: true,
      passwordHash: await bcrypt.hash(randomPassword, 12),
    });

    // SEC-134: an admin user with no staff record counts as the root admin,
    // so a failed staff insert must not leave this user behind.
    let staff;
    try {
      staff = await StaffMember.create({
        userId: user._id,
        name: user.name,
        email: user.email,
        roles,
        role: roles.join(','),
        status: 'invited',
        joinedDate: new Date().toISOString().slice(0, 10),
      });
    } catch (error) {
      await User.deleteOne({ _id: user._id });
      throw error;
    }

    const token = mintInviteToken();
    await AccountInvite.create({
      staffId: staff._id,
      emailNormalized: emailNorm,
      tokenHash: hashInviteToken(token),
      expiresAt: new Date(Date.now() + INVITE_HOURS * 3600_000),
      lastFour: token.slice(-4),
      invitedBy: req.auth.sub,
    });

    const inviteUrl = inviteUrlFor(token);
    const emailResult = await sendInviteEmail(user.email, user.name, inviteUrl, new Date(Date.now() + INVITE_HOURS * 3600_000).toISOString());

    await auditReq(req, {
      action: AUDIT_ACTIONS.ACCOUNT_INVITE,
      resourceType: AUDIT_RESOURCE_TYPES.USER,
      resourceId: user._id,
      outcome: 'success',
      metadata: { type: req.body.type, roles, emailed: !emailResult?.skipped },
    });

    res.status(201).json({
      data: {
        account: toClientObject(staff),
        ...(emailResult?.skipped ? { invite: { url: inviteUrl, hint: token.slice(-4), expiresAt: new Date(Date.now() + INVITE_HOURS * 3600_000).toISOString() } } : { emailed: true }),
      },
    });
  }),
);

// POST /admin/accounts/:id/invite — resend (invited only; invalidates the old token).
accountsRouter.post(
  '/accounts/:id/invite',
  requireAdminAuth,
  requireSuperAdmin,
  accountInviteLimiter,
  asyncHandler(async (req, res) => {
    const staff = await loadStaff(req.params.id);
    if (staff.status !== 'invited') {
      throw new ApiError(409, 'Only an invited account has an invite');
    }

    const token = mintInviteToken();
    const expiresAt = new Date(Date.now() + INVITE_HOURS * 3600_000);
    await AccountInvite.findOneAndUpdate(
      { staffId: staff._id },
      {
        tokenHash: hashInviteToken(token),
        expiresAt,
        lastFour: token.slice(-4),
        usedAt: null,
        invitedBy: req.auth.sub,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const user = await User.findById(staff.userId).select('email name').lean();
    const inviteUrl = inviteUrlFor(token);
    const emailResult = user
      ? await sendInviteEmail(user.email, user.name, inviteUrl, expiresAt.toISOString())
      : { skipped: true };

    await auditReq(req, {
      action: AUDIT_ACTIONS.ACCOUNT_INVITE_RESEND,
      resourceType: AUDIT_RESOURCE_TYPES.USER,
      resourceId: staff.userId,
      outcome: 'success',
      metadata: { staffId: String(staff._id), emailed: !emailResult?.skipped },
    });

    res.json({
      data: {
        ...(emailResult?.skipped
          ? { invite: { url: inviteUrl, hint: token.slice(-4), expiresAt: expiresAt.toISOString() } }
          : { emailed: true }),
      },
    });
  }),
);

// PATCH /admin/accounts/:id/role — switch User <-> Admin (and group).
accountsRouter.patch(
  '/accounts/:id/role',
  requireAdminAuth,
  requireSuperAdmin,
  validate(changeAccountRoleSchema),
  asyncHandler(async (req, res) => {
    const staff = await loadStaff(req.params.id);
    if ((staff.roles || []).includes('super_admin')) {
      throw new ApiError(403, "A Super Admin's role is not changed here");
    }
    if (String(staff.userId) === String(req.auth.sub)) {
      throw new ApiError(403, 'You cannot change your own role');
    }
    if (staff.status !== 'active') {
      throw new ApiError(409, 'Reactivate the account first');
    }

    const previous = { roles: staff.roles, role: staff.role };
    const roles = rolesForAccount(req.body.type, req.body.group || '');
    staff.roles = roles;
    staff.role = roles.join(',');
    await staff.save();

    await auditReq(req, {
      action: AUDIT_ACTIONS.ACCOUNT_ROLE_CHANGE,
      resourceType: AUDIT_RESOURCE_TYPES.USER,
      resourceId: staff.userId,
      outcome: 'success',
      metadata: { staffId: String(staff._id), previous, roles },
    });

    itemResponse(res, toClientObject(staff));
  }),
);

// POST /admin/accounts/:id/deactivate — switch off + revoke sessions.
accountsRouter.post(
  '/accounts/:id/deactivate',
  requireAdminAuth,
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const staff = await loadStaff(req.params.id);
    if (staff.status !== 'active') {
      throw new ApiError(409, 'Only an active account can be deactivated');
    }
    if (String(staff.userId) === String(req.auth.sub)) {
      throw new ApiError(403, 'You cannot deactivate your own account');
    }
    if ((staff.roles || []).includes('super_admin') && (await activeSuperAdminCountExcluding(staff._id)) === 0) {
      throw new ApiError(403, 'This is the last Super Admin. At least one must stay active.');
    }

    staff.status = 'deactivated';
    await staff.save();

    const user = await User.findById(staff.userId);
    if (user && user.role !== 'deleted') {
      await revokeAllSessions(user);
      await user.save();
    }

    await auditReq(req, {
      action: AUDIT_ACTIONS.ACCOUNT_DEACTIVATE,
      resourceType: AUDIT_RESOURCE_TYPES.USER,
      resourceId: staff.userId,
      outcome: 'success',
      metadata: { staffId: String(staff._id) },
    });

    itemResponse(res, toClientObject(staff));
  }),
);

// POST /admin/accounts/:id/reactivate — switch back on (sign in again).
accountsRouter.post(
  '/accounts/:id/reactivate',
  requireAdminAuth,
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const staff = await loadStaff(req.params.id);
    if (staff.status !== 'deactivated') {
      throw new ApiError(409, 'Only a deactivated account can be reactivated');
    }

    staff.status = 'active';
    await staff.save();

    await auditReq(req, {
      action: AUDIT_ACTIONS.ACCOUNT_REACTIVATE,
      resourceType: AUDIT_RESOURCE_TYPES.USER,
      resourceId: staff.userId,
      outcome: 'success',
      metadata: { staffId: String(staff._id) },
    });

    itemResponse(res, toClientObject(staff));
  }),
);

// GET /admin/audit-log?scope=accounts — account trail only.
accountsRouter.get(
  '/audit-log',
  requireAdminAuth,
  requireSuperAdmin,
  validate(accountAuditQuerySchema),
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = { action: { $in: ACCOUNT_AUDIT_ACTIONS } };
    const [total, rows] = await Promise.all([
      AuditLog.countDocuments(filter),
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);
    listResponse(res, rows, total, page, limit);
  }),
);
