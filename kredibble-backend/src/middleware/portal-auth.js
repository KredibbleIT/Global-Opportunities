import { StaffMember } from '../models/User.js';
import { ApiError } from '../utils/http.js';
import { roleCan, normalizeLegacyRole, getEffectiveToggles } from '../lib/permissions.js';

const toCanonicalRole = (role) => {
  const norm = normalizeLegacyRole(role);
  return norm.length > 0 ? norm[0] : String(role || '').trim().toLowerCase().replace(/\s+/g, '_');
};

const rawNormalized = (str) => String(str || '').trim().toLowerCase();

const NO_ROLES = Object.freeze({ roles: [], staff: null });

const lookUpStaffRoles = async (auth) => {
  const userId = auth?.sub;
  if (!userId) return NO_ROLES;

  const activeStaff = await StaffMember.findOne({ userId, status: 'active' }).lean();
  if (activeStaff) {
    const roles = activeStaff.roles?.length ? activeStaff.roles : normalizeLegacyRole(activeStaff.role);
    return { roles, staff: activeStaff };
  }

  if (auth.role === 'admin' && auth.aud === 'kredibble-admin') {
    const anyStaff = await StaffMember.exists({ userId });
    if (!anyStaff) return { roles: ['super_admin'], staff: null };
  }
  return NO_ROLES;
};

// Routes often chain two guards (requireScreen then requirePortalRoles); both
// read the same resolution instead of querying the staff record twice.
const resolutions = new WeakMap();

/**
 * SEC-131: the one place that decides a caller's BE-001 roles, read from the
 * verified session (`req.auth`), never the request body. Every staff member
 * signs in with an admin session (staff Users have role `admin`), so the
 * session alone proves nothing about which screens they may use.
 *
 * - An ACTIVE StaffMember record's roles decide (a legacy single `role`
 *   string is normalized to the 12 ids).
 * - Only an admin session whose user has NO staff record at all (the
 *   CLI-provisioned root admin) counts as super_admin.
 * - A suspended or invited staff record gets no roles, whatever the session.
 *
 * Resolved once per request; later calls with the same `req` reuse it.
 *
 * @param {{ auth?: { sub?: string, role?: string, aud?: string } }} req
 * @returns {Promise<{ roles: string[], staff: object | null }>} the role ids, and the active staff record (null for root admin)
 */
export async function resolveStaffRoles(req) {
  if (!resolutions.has(req)) resolutions.set(req, lookUpStaffRoles(req.auth));
  return resolutions.get(req);
}

/**
 * Allows callers who hold one of `allowedRoles` (labels like "Desk Lead" or
 * canonical ids), resolved by resolveStaffRoles. Super Admin passes every
 * list: the BE-001 matrix gives it every screen.
 *
 * @param {...string} allowedRoles
 */
export const requirePortalRoles = (...allowedRoles) => async (req, res, next) => {
  try {
    const { roles, staff } = await resolveStaffRoles(req);

    const hasMatch = roles.includes('super_admin') || roles.some((sRole) =>
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
 * resolved by resolveStaffRoles: the active staff record's roles, or
 * super_admin for the root admin who has no staff record.
 *
 * Unlike requirePortalRoles, Super Admin gets no automatic pass: name it in
 * `allowedRoles`. This guards actions the matrix gives to named roles only
 * (BE-029 bulk import/export).
 *
 * @param {string[]} allowedRoles
 * @param {string} message - the 403 message
 */
export const requireStaffRoles = (allowedRoles, message) => async (req, res, next) => {
  try {
    const { roles, staff } = await resolveStaffRoles(req);
    if (!roles.some((role) => allowedRoles.includes(role))) {
      return next(new ApiError(403, message));
    }
    req.portalStaff = staff;
    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * Allows callers whose roles (resolveStaffRoles) reach `level` on at least
 * one of `screen` in the BE-001 matrix, with the saved Moderator and Support
 * toggles applied. An admin session is not enough on its own (SEC-131).
 *
 * @param {string | string[]} screen - one screen id, or several (any one is enough)
 * @param {'view' | 'edit'} [level='view']
 */
export const requireScreen = (screen, level = 'view') => async (req, res, next) => {
  try {
    if (!req.auth?.sub) {
      return next(new ApiError(401, 'Authentication required'));
    }

    const { roles, staff } = await resolveStaffRoles(req);
    if (roles.length === 0) {
      return next(new ApiError(403, 'You do not have staff access to this admin function'));
    }

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
