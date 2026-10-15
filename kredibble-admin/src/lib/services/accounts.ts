"use client";

/**
 * Accounts service (Team > Members > Create account): creates accounts and manages their state. Mock mode only: it writes the shared
 * in-memory staff collection ({ always: true }) and the audit log, and never calls the backend, which has no endpoint for it yet.
 * TODO(backend): every function below must become a server call, with the rules in docs/account-creation.md enforced there.
 *
 * - The caller (the page) has already checked `can("accounts.create", "edit")`. The checks that protect the data itself (no Super
 *   Admin, unique email, not yourself, not the last Super Admin, only the right state) are repeated here, so a wrong caller is still
 *   refused. Every function returns { ok: true, ... } or { ok: false, reason }.
 * - Credentials: there is no password anywhere. A created account is INVITED; the person sets their own password from the invite
 *   link. The link is returned once to the caller (to show in the copy dialog) and is never stored or logged.
 * - Every create, resend, role change, deactivate and reactivate writes one audit entry: who, which account, what, when. The entry
 *   holds the last four characters of the invite token at most, never the token or the link.
 */
import { getMockCollection, setMockCollection } from "@/lib/mock-store";
import type { StaffMember } from "@/lib/mock-entities";
import { ROLES } from "@/config/roles";
import {
  ACCOUNT_TYPE_LABEL,
  assertCreatable,
  canChangeRole,
  canDeactivate,
  canResend,
  normaliseEmail,
  normaliseName,
  rolesFor,
  makeInvite,
  validateAccount,
  accountTypeOf,
  type AccountErrors,
  type AccountForm,
  type AccountType,
} from "@/lib/accounts";
import { recordAudit } from "@/lib/services/audit-log";
import { todayIsoDate } from "@/lib/services/listings";
import type { Role } from "@/config/roles";

const read = (): StaffMember[] => getMockCollection("staff");
const write = (rows: StaffMember[]) => setMockCollection("staff", rows, { always: true });
const replace = (id: string, change: Partial<StaffMember>) => write(read().map((person) => (person.id === id ? { ...person, ...change } : person)));

export type Failure = { ok: false; reason: string; errors?: AccountErrors };
export interface InviteIssued {
  /** The mock link. Shown once in the copy dialog; never stored or logged. */
  link: string;
  expiresAt: string;
}

const roleLabels = (roles: readonly Role[]) => roles.map((role) => ROLES[role].label).join(" and ");

/** Creates an account in the Invited state. */
export function createAccount(form: AccountForm, actor: string, origin: string): ({ ok: true; person: StaffMember } & InviteIssued) | Failure {
  const errors = validateAccount(form, read());
  if (Object.keys(errors).length > 0) return { ok: false, reason: "Fix the highlighted fields.", errors };
  const roles = rolesFor(form.type, form.group);
  try {
    assertCreatable(form.type, roles);
  } catch (problem) {
    return { ok: false, reason: problem instanceof Error ? problem.message : "This account cannot be created." };
  }
  const invite = makeInvite(new Date(), origin);
  const person: StaffMember = {
    id: `staff-${Date.now()}`,
    name: normaliseName(form.name),
    email: normaliseEmail(form.email),
    roles,
    status: "invited",
    joinedDate: todayIsoDate(),
    accountType: form.type,
    inviteExpiresAt: invite.expiresAt,
  };
  write([person, ...read()]);
  recordAudit({
    actor,
    action: "accounts.create",
    summary: `Created ${ACCOUNT_TYPE_LABEL[form.type]} account for ${person.name} (invited)`,
    details: { account: person.name, email: person.email, type: ACCOUNT_TYPE_LABEL[form.type], roles: roleLabels(roles), state: "Invited", inviteExpires: invite.expiresAt, inviteEnding: invite.hint },
  });
  return { ok: true, person, link: invite.link, expiresAt: invite.expiresAt };
}

/** Sends a new invite (the old one stops working). Only for an Invited account. */
export function resendInvite(id: string, actor: string, origin: string): ({ ok: true } & InviteIssued) | Failure {
  const person = read().find((candidate) => candidate.id === id);
  if (!person) return { ok: false, reason: "That account no longer exists." };
  const verdict = canResend(person);
  if (!verdict.allowed) return { ok: false, reason: verdict.reason ?? "The invite cannot be sent again." };
  const invite = makeInvite(new Date(), origin);
  replace(id, { inviteExpiresAt: invite.expiresAt });
  recordAudit({
    actor,
    action: "accounts.resend_invite",
    summary: `Resent the invite to ${person.name}`,
    details: { account: person.name, email: person.email, inviteExpires: invite.expiresAt, inviteEnding: invite.hint },
  });
  return { ok: true, link: invite.link, expiresAt: invite.expiresAt };
}

/** Switches an account off. Never yourself, never the last active Super Admin. */
export function deactivateAccount(id: string, actor: string, currentId: string | undefined): { ok: true } | Failure {
  const people = read();
  const person = people.find((candidate) => candidate.id === id);
  if (!person) return { ok: false, reason: "That account no longer exists." };
  const verdict = canDeactivate(person, people, currentId);
  if (!verdict.allowed) return { ok: false, reason: verdict.reason ?? "This account cannot be deactivated." };
  replace(id, { status: "deactivated" });
  recordAudit({
    actor,
    action: "accounts.deactivate",
    summary: `Deactivated ${person.name}`,
    details: { account: person.name, email: person.email, from: "Active", to: "Deactivated" },
  });
  return { ok: true };
}

/** Switches a deactivated account back on. */
export function reactivateAccount(id: string, actor: string): { ok: true } | Failure {
  const person = read().find((candidate) => candidate.id === id);
  if (!person) return { ok: false, reason: "That account no longer exists." };
  if (person.status !== "deactivated") return { ok: false, reason: "Only a deactivated account can be reactivated." };
  replace(id, { status: "active" });
  recordAudit({
    actor,
    action: "accounts.reactivate",
    summary: `Reactivated ${person.name}`,
    details: { account: person.name, email: person.email, from: "Deactivated", to: "Active" },
  });
  return { ok: true };
}

/** Changes an account between User and Admin. Never yourself, never a Super Admin. A group may be chosen when it becomes Admin. */
export function changeAccountType(id: string, to: AccountType, group: Role | "", actor: string, currentId: string | undefined): { ok: true } | Failure {
  const people = read();
  const person = people.find((candidate) => candidate.id === id);
  if (!person) return { ok: false, reason: "That account no longer exists." };
  const verdict = canChangeRole(person, people, currentId);
  if (!verdict.allowed) return { ok: false, reason: verdict.reason ?? "This role cannot be changed." };
  const from = accountTypeOf(person);
  if (from === null) return { ok: false, reason: "A Super Admin's role is not changed here." };
  if (from === to) return { ok: false, reason: `This account is already ${ACCOUNT_TYPE_LABEL[to]}.` };
  const roles = rolesFor(to, group);
  try {
    assertCreatable(to, roles); // the same guard: nobody becomes a Super Admin through this feature
  } catch (problem) {
    return { ok: false, reason: problem instanceof Error ? problem.message : "This role cannot be set." };
  }
  replace(id, { roles, accountType: to });
  recordAudit({
    actor,
    action: "accounts.change_role",
    summary: `Changed ${person.name} from ${ACCOUNT_TYPE_LABEL[from]} to ${ACCOUNT_TYPE_LABEL[to]}`,
    details: { account: person.name, email: person.email, from: ACCOUNT_TYPE_LABEL[from], to: ACCOUNT_TYPE_LABEL[to], roles: roleLabels(roles) },
  });
  return { ok: true };
}
