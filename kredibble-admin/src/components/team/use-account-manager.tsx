"use client";

/**
 * useAccountManager: everything the Team page needs for "Create account" and the account actions on member rows, in one place.
 * Returns:
 *  - allowed: true only for a Super Admin (permission accounts.create). The Create button, the History button and the row
 *    menu are NOT rendered when it is false.
 *  - openCreate(), openHistory(): open the dialogs.
 *  - actionsFor(person): the row menu items (Resend invite, Change role, Deactivate / Reactivate), each disabled with a reason
 *    where the rules forbid it (yourself, the last Super Admin, the wrong state).
 *  - dialogs: render this once; it holds the create form, the one-time invite link, the history and the confirm dialog.
 *
 * Two layers of access, both required:
 *  1. the controls only exist when `allowed`, and
 *  2. every handler asks can("accounts.create", "edit") again and refuses with a message if it is false, so the action cannot be
 *     reached any other way (for example a form that was open when the role changed).
 * The same refusals exist in the service (lib/services/accounts.ts). The real enforcement belongs to the server (see
 * docs/account-creation.md); this is for the experience.
 */
import { useState, type ReactNode } from "react";
import { Power, RotateCcw, Send, UserCog } from "lucide-react";
import { ROLES } from "@/config/roles";
import { getAdminUser } from "@/lib/api";
import { ACCOUNT_TYPE_LABEL, accountTypeOf, canChangeRole, canDeactivate, canResend, DEFAULT_ADMIN_ROLE, USER_ROLE, type AccountForm } from "@/lib/accounts";
import type { StaffMember } from "@/lib/mock-entities";
import { changeAccountType, createAccount, deactivateAccount, reactivateAccount, resendInvite } from "@/lib/services/accounts";
import { currentStaffMember } from "@/lib/services/listings";
import { loadStaffSnapshot } from "@/lib/services/staff";
import { useRoles } from "@/components/access/RoleProvider";
import { AmbassadorHistoryDialog } from "@/components/network/AmbassadorHistoryDialog";
import type { MenuItem } from "@/components/ui/Menu";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { CreateAccountDialog } from "./CreateAccountDialog";
import { InviteLinkDialog } from "./InviteLinkDialog";

interface IssuedInvite {
  name: string;
  link: string;
  expiresAt: string;
}

export function useAccountManager() {
  const { can, roles } = useRoles();
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [creating, setCreating] = useState(false);
  const [issued, setIssued] = useState<IssuedInvite | null>(null);
  const [history, setHistory] = useState(false);

  const allowed = can("accounts.create", "edit");

  // Who: the signed-in person's name and the role(s) they are using (the audit entry's "who").
  const actor = `${getAdminUser()?.name ?? currentStaffMember()?.name ?? "Unknown user"} (${roles.map((role) => ROLES[role].label).join(" + ")})`;
  const currentId = () => currentStaffMember()?.id;

  /** The second layer: false (with a message) when the role no longer has the permission. */
  const permitted = (): boolean => {
    if (can("accounts.create", "edit")) return true;
    toast.error("Your role cannot create or manage accounts.");
    return false;
  };

  const openCreate = () => {
    if (permitted()) setCreating(true);
  };

  const create = (form: AccountForm) => {
    if (!permitted()) return { ok: false as const, reason: "Your role cannot create or manage accounts." };
    const result = createAccount(form, actor, window.location.origin);
    if (!result.ok) return result;
    setCreating(false);
    setIssued({ name: result.person.name, link: result.link, expiresAt: result.expiresAt });
    toast.success(`${result.person.name} was invited as ${ACCOUNT_TYPE_LABEL[form.type]}.`);
    return { ok: true as const };
  };

  const resend = (person: StaffMember) => {
    if (!permitted()) return;
    const result = resendInvite(person.id, actor, window.location.origin);
    if (!result.ok) return void toast.error(result.reason);
    setIssued({ name: person.name, link: result.link, expiresAt: result.expiresAt });
    toast.success(`A new invite was made for ${person.name}.`);
  };

  const deactivate = (person: StaffMember) =>
    confirm({
      title: "Deactivate this account?",
      description: (
        <>
          <strong className="text-ink">{person.name}</strong> ({person.email}) will not be able to sign in until you reactivate the account.
        </>
      ),
      confirmLabel: "Deactivate account",
      onConfirm: () => {
        if (!permitted()) return;
        const result = deactivateAccount(person.id, actor, currentId());
        if (result.ok) toast.success(`${person.name} was deactivated.`);
        else toast.error(result.reason);
      },
    });

  const reactivate = (person: StaffMember) =>
    confirm({
      title: "Reactivate this account?",
      description: (
        <>
          <strong className="text-ink">{person.name}</strong> ({person.email}) will be able to sign in again.
        </>
      ),
      confirmLabel: "Reactivate account",
      tone: "neutral",
      onConfirm: () => {
        if (!permitted()) return;
        const result = reactivateAccount(person.id, actor);
        if (result.ok) toast.success(`${person.name} was reactivated.`);
        else toast.error(result.reason);
      },
    });

  const changeRole = (person: StaffMember) => {
    const from = accountTypeOf(person);
    if (from === null) return;
    const to = from === "user" ? "admin" : "user";
    const after = ROLES[to === "user" ? USER_ROLE : DEFAULT_ADMIN_ROLE].label;
    confirm({
      title: `Change role to ${ACCOUNT_TYPE_LABEL[to]}?`,
      description: (
        <>
          <strong className="text-ink">{person.name}</strong> ({person.email}) will change from {ACCOUNT_TYPE_LABEL[from]} to {ACCOUNT_TYPE_LABEL[to]} and hold the{" "}
          {after} role. {to === "admin" ? "They can then manage the team list." : "They lose their team access."}
        </>
      ),
      confirmLabel: `Make ${ACCOUNT_TYPE_LABEL[to]}`,
      tone: "neutral",
      onConfirm: () => {
        if (!permitted()) return;
        const result = changeAccountType(person.id, to, "", actor, currentId());
        if (result.ok) toast.success(`${person.name} is now ${ACCOUNT_TYPE_LABEL[to]}.`);
        else toast.error(result.reason);
      },
    });
  };

  /** The row menu. Items the rules forbid are disabled and say why. Empty when the viewer is not a Super Admin. */
  const actionsFor = (person: StaffMember): MenuItem[] => {
    if (!allowed) return [];
    const people = loadStaffSnapshot();
    const me = currentId();
    const items: MenuItem[] = [];
    const type = accountTypeOf(person);
    if (person.status === "invited") {
      items.push({ label: "Resend invite", icon: Send, onSelect: () => resend(person), disabled: !canResend(person).allowed });
    }
    if (type !== null) {
      const verdict = canChangeRole(person, people, me);
      items.push({
        label: type === "user" ? "Make Admin" : "Make User",
        icon: UserCog,
        onSelect: () => changeRole(person),
        disabled: !verdict.allowed,
        hint: verdict.allowed ? undefined : verdict.reason,
      });
    }
    if (person.status === "deactivated") {
      items.push({ label: "Reactivate", icon: RotateCcw, onSelect: () => reactivate(person) });
    } else {
      const verdict = canDeactivate(person, people, me);
      items.push({ label: "Deactivate", icon: Power, danger: true, onSelect: () => deactivate(person), disabled: !verdict.allowed, hint: verdict.allowed ? undefined : verdict.reason });
    }
    return items;
  };

  const dialogs: ReactNode = (
    <>
      {creating && <CreateAccountDialog onClose={() => setCreating(false)} onCreate={create} />}
      {issued && <InviteLinkDialog name={issued.name} link={issued.link} expiresAt={issued.expiresAt} onClose={() => setIssued(null)} />}
      {history && (
        <AmbassadorHistoryDialog
          onClose={() => setHistory(false)}
          prefix="accounts."
          title="Account history"
          description="Every account created, invited again, changed, deactivated or reactivated is recorded here."
          emptyText="Account changes appear here with who made them, which account, and when."
        />
      )}
      {confirmDialog}
    </>
  );

  return { allowed, openCreate, openHistory: () => setHistory(true), actionsFor, dialogs };
}
