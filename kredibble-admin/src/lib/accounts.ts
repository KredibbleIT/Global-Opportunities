/**
 * Account rules (pure, no store, no React): everything the "Create account" feature decides, so it can be tested without a browser
 * and the real server can copy the same rules.
 *
 * - Two kinds of account can be created here: "user" and "admin". A SUPER ADMIN CAN NEVER BE CREATED, or made, through this
 *   feature (the type has no such value and `assertCreatable` refuses it).
 * - Role mapping: an admin account holds one of the existing desk roles (the "team / permission group", Admin Support unless a
 *   group is chosen). A user account holds the lowest-access role, Support. Nothing new is invented: the permission matrix on
 *   Team > Roles & permissions still decides what each role may open.
 * - States: invited -> active <-> deactivated. An invited account has an invite that expires after 48 hours.
 * - The invite link is a MOCK. The token is random, shown once, and never stored: only the expiry and the last four characters
 *   (to tell two invites apart in the history) are kept. The new person sets their own password through the link; nobody
 *   else, including the super admin, ever sees or types it. This file has no password field and never will.
 *
 * TODO(backend): all of this must be enforced again on the server (see docs/account-creation.md).
 */
import { ROLE_IDS, type Role } from "@/config/roles";
import type { StaffMember } from "@/lib/mock-entities";

export type AccountType = "user" | "admin";
export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = { user: "User", admin: "Admin" };

/** The invite lasts this long. */
export const INVITE_HOURS = 48;

/** The role a User account holds: the lowest-access role. */
export const USER_ROLE: Role = "support";
/** The role an Admin account holds when no team / permission group is chosen. */
export const DEFAULT_ADMIN_ROLE: Role = "admin_support";

/** The groups an Admin may be put in: every role except Super Admin (and Support, which is what a User is). */
export const ADMIN_GROUPS: readonly Role[] = ROLE_IDS.filter((role) => role !== "super_admin" && role !== USER_ROLE);

export interface AccountForm {
  name: string;
  email: string;
  type: AccountType;
  /** Admin only: the optional team / permission group. "" = the default. */
  group: Role | "";
}

export type AccountErrors = Partial<Record<"name" | "email" | "type" | "group", string>>;

export const normaliseEmail = (email: string): string => email.trim().toLowerCase();
export const normaliseName = (name: string): string => name.replace(/\s+/g, " ").trim();

// Deliberately plain: one @, no spaces, a dot in the domain. The server decides what is really deliverable.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True when another account already uses this email (trimmed, case-insensitive). */
export const isEmailTaken = (email: string, people: readonly Pick<StaffMember, "email">[]): boolean => {
  const key = normaliseEmail(email);
  return key !== "" && people.some((person) => normaliseEmail(person.email) === key);
};

/** The error for each wrong field (none = valid). Messages say what to do, in one sentence. */
export function validateAccount(form: AccountForm, people: readonly Pick<StaffMember, "email">[]): AccountErrors {
  const errors: AccountErrors = {};
  if (normaliseName(form.name) === "") errors.name = "Enter the person's full name.";
  const email = normaliseEmail(form.email);
  if (email === "") errors.email = "Enter an email address.";
  else if (!EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email address, like name@company.com.";
  else if (isEmailTaken(email, people)) errors.email = "An account with this email already exists.";
  if (form.type !== "user" && form.type !== "admin") errors.type = "Choose User or Admin.";
  if (form.type === "admin" && form.group !== "" && !ADMIN_GROUPS.includes(form.group)) errors.group = "Choose a team from the list.";
  return errors;
}

/** The roles an account of this type holds. */
export const rolesFor = (type: AccountType, group: Role | ""): Role[] => (type === "user" ? [USER_ROLE] : [group || DEFAULT_ADMIN_ROLE]);

/** Defence in depth: the service calls this, so even a wrong caller cannot create a Super Admin. Throws with a plain message. */
export function assertCreatable(type: string, roles: readonly Role[]) {
  if (type !== "user" && type !== "admin") throw new Error("Only User and Admin accounts can be created here.");
  if (roles.includes("super_admin")) throw new Error("A Super Admin cannot be created here.");
}

/** The account type of an existing person. Super Admins are neither (they cannot be changed here). */
export const accountTypeOf = (person: Pick<StaffMember, "roles" | "accountType">): AccountType | null => {
  if (person.roles.includes("super_admin")) return null;
  if (person.accountType) return person.accountType;
  return person.roles.length === 1 && person.roles[0] === USER_ROLE ? "user" : "admin";
};

const activeSuperAdmins = (people: readonly StaffMember[]) => people.filter((person) => person.roles.includes("super_admin") && person.status === "active");

export interface Verdict {
  allowed: boolean;
  /** Why not, in one sentence (shown as the reason on a disabled action). */
  reason?: string;
}

/** May the signed-in person deactivate `target`? Never yourself, never the last active Super Admin, only an Active account. */
export function canDeactivate(target: StaffMember, people: readonly StaffMember[], currentId: string | undefined): Verdict {
  if (target.status !== "active") return { allowed: false, reason: "Only an active account can be deactivated." };
  if (currentId !== undefined && target.id === currentId) return { allowed: false, reason: "You cannot deactivate your own account." };
  if (target.roles.includes("super_admin") && activeSuperAdmins(people).length <= 1) {
    return { allowed: false, reason: "This is the last Super Admin. At least one must stay active." };
  }
  return { allowed: true };
}

/** May the signed-in person change the type of `target` (User <-> Admin)? Never yourself, never a Super Admin, never the last one. */
export function canChangeRole(target: StaffMember, people: readonly StaffMember[], currentId: string | undefined): Verdict {
  if (target.roles.includes("super_admin")) {
    return activeSuperAdmins(people).length <= 1 && target.status === "active"
      ? { allowed: false, reason: "This is the last Super Admin. It cannot be demoted." }
      : { allowed: false, reason: "A Super Admin's role is not changed here." };
  }
  if (currentId !== undefined && target.id === currentId) return { allowed: false, reason: "You cannot change your own role." };
  if (target.status === "deactivated") return { allowed: false, reason: "Reactivate the account first." };
  return { allowed: true };
}

/** May the invite be sent again? Only while the account is Invited. */
export const canResend = (target: StaffMember): Verdict =>
  target.status === "invited" ? { allowed: true } : { allowed: false, reason: "Only an invited account has an invite." };

/** A fresh mock invite: a random token (shown once, never stored), its link, and when it expires. */
export function makeInvite(now: Date = new Date(), origin = "https://admin.example.invalid"): { token: string; link: string; expiresAt: string; hint: string } {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return {
    token,
    link: `${origin}/accept-invite?token=${token}`,
    expiresAt: new Date(now.getTime() + INVITE_HOURS * 3600_000).toISOString(),
    hint: token.slice(-4),
  };
}

export const isInviteExpired = (expiresAt: string | undefined, now: Date = new Date()): boolean => !!expiresAt && new Date(expiresAt).getTime() <= now.getTime();
