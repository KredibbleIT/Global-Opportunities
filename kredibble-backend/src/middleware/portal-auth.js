import { StaffMember } from '../models/User.js';
import { ApiError } from '../utils/http.js';
import { roleCan, normalizeLegacyRole, getEffectiveToggles } from '../lib/permissions.js';

const toCanonicalRole = (role) => {
  const norm = normalizeLegacyRole(role);
  return norm.length > 0 ? norm[0] : String(role || '').trim().toLowerCase().replace(/\s+/g, '_');
};

const rawNormalized = (str) => String(str || '').trim().toLowerCase();

export const requirePortalRoles = (...allowedRoles) => async (req, res, next) => {
  try {
    // SEC-077: the admin bypass trusts only the admin session (admin-audience
    // token), never a user-realm Bearer token that merely carries role admin.
    if (req.auth?.role === 'admin' && req.auth?.aud === 'kredibble-admin') return next();

    const staff = await StaffMember.findOne({ userId: req.auth?.sub, status: 'active' });
    if (!staff) {
      return next(new ApiError(403, 'You do not have access to this admin function'));
    }

    const staffRoles = staff.roles?.length
      ? staff.roles
      : String(staff.role || '').split(',').map((r) => r.trim()).filter(Boolean);

    const hasMatch = staffRoles.some((sRole) =>
      allowedRoles.some((aRole) =>
        toCanonicalRole(sRole) === toCanonicalRole(aRole) ||
        rawNormalized(sRole) === rawNormalized(aRole)
      )
    );

    if (!hasMatch) {
      return next(new ApiError(403, 'You do not have access to this admin function'));
    }
    req.portalStaff = staff;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Allows only callers who hold one of `allowedRoles` (canonical BE-001 ids),
 * read from the verified session, never the request. Roles come from the
 * caller's ACTIVE StaffMember record. The CLI-provisioned root admin, who has
 * no staff record at all, counts as super_admin (same rule as BE-028's
 * requireSuperAdmin); an admin whose staff record is suspended or invited
 * gets no fallback.
 *
 * Unlike requireScreen there is no blanket admin-session bypass: this guards
 * actions the matrix gives to named roles only (BE-029 bulk import/export).
 *
 * @param {string[]} allowedRoles
 * @param {string} message - the 403 message
 */
export const requireStaffRoles = (allowedRoles, message) => async (req, res, next) => {
  try {
    const activeStaff = await StaffMember.findOne({ userId: req.auth?.sub, status: 'active' }).select('roles role').lean();
    let roles = activeStaff
      ? (activeStaff.roles?.length ? activeStaff.roles : normalizeLegacyRole(activeStaff.role))
      : [];
    if (!activeStaff && req.auth?.role === 'admin' && req.auth?.aud === 'kredibble-admin') {
      const anyStaff = await StaffMember.exists({ userId: req.auth.sub });
      if (!anyStaff) roles = ['super_admin'];
    }
    if (!roles.some((role) => allowedRoles.includes(role))) {
      return next(new ApiError(403, message));
    }
    req.portalStaff = activeStaff || null;
    return next();
  } catch (error) {
    return next(error);
  }
};

export const requireScreen = (screen, level = 'view') => async (req, res, next) => {
  try {
    // SEC-077: the admin bypass trusts only the admin session (admin-audience
    // token), never a user-realm Bearer token that merely carries role admin.
    if (req.auth?.role === 'admin' && req.auth?.aud === 'kredibble-admin') {
      req.screenAccess = { screen, level, grantedVia: 'admin' };
      return next();
    }

    const userId = req.auth?.sub;
    if (!userId) {
      return next(new ApiError(401, 'Authentication required'));
    }

    const staff = await StaffMember.findOne({ userId, status: 'active' });
    if (!staff) {
      return next(new ApiError(403, 'You do not have staff access to this admin function'));
    }

    const roles = staff.roles?.length ? staff.roles : normalizeLegacyRole(staff.role);
    const toggles = await getEffectiveToggles();
    const screens = Array.isArray(screen) ? screen : [screen];
    const allowed = screens.some((s) => roleCan(roles, s, level, toggles));

    if (!allowed) {
      const screenLabel = Array.isArray(screen) ? screen.join(', ') : screen;
      return next(new ApiError(403, `Forbidden: insufficient permissions for screen "${screenLabel}"`));
    }

    req.portalStaff = staff;
    req.screenAccess = { screen, level, roles };
    next();
  } catch (error) {
    next(error);
  }
};
