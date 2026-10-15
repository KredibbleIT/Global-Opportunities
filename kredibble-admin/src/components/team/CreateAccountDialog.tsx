"use client";

/**
 * CreateAccountDialog: the "Create account" form on Team > Members. A Super Admin enters a name, an email and the kind of account
 * (User or Admin); an Admin may also be put in a team / permission group (one of the existing desk roles; Admin Support if none).
 *
 * - There is NO password field, on purpose. The account is created as INVITED and the new person sets their own password from the
 *   invite link (valid 48 hours). The Status line explains this: Invited now, Active once they accept.
 * - Super Admin is not offered, and the service refuses it as well.
 * - Validation (lib/accounts.ts): name and email required, name trimmed, email format, email unique (trimmed, any capitals). Errors
 *   show after a field is left and on submit, as text with an icon, never by colour alone.
 *
 * Props: onClose, onCreate(form) -> { ok: true } to close, or { ok: false, errors?, reason } to stay open with the messages.
 *        The page does the permission check, the save and the audit entry (see TeamAccountActions).
 */
import { useRef, useState, type FormEvent } from "react";
import { Info, Send } from "lucide-react";
import { ROLES, type Role } from "@/config/roles";
import { ACCOUNT_TYPE_LABEL, ADMIN_GROUPS, DEFAULT_ADMIN_ROLE, validateAccount, type AccountErrors, type AccountForm, type AccountType } from "@/lib/accounts";
import { loadStaffSnapshot } from "@/lib/services/staff";
import { describeRole } from "@/lib/role-permissions";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/form/Field";
import { Input } from "@/components/ui/form/Input";
import { Select, type SelectOption } from "@/components/ui/form/Select";
import { focusFirstInvalid, useTouched } from "@/components/ui/form/use-touched";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { StatusBadge } from "@/components/ui/StatusBadge";

type CreateResult = { ok: true } | { ok: false; reason: string; errors?: AccountErrors };

interface CreateAccountDialogProps {
  onClose: () => void;
  onCreate: (form: AccountForm) => CreateResult;
}

const DEFAULT_GROUP = "default";
const groupOptions: SelectOption<Role | typeof DEFAULT_GROUP>[] = [
  { value: DEFAULT_GROUP, label: `Default (${ROLES[DEFAULT_ADMIN_ROLE].label})`, description: "No special team. They can manage the team list." },
  ...ADMIN_GROUPS.filter((role) => role !== DEFAULT_ADMIN_ROLE).map((role) => ({ value: role, label: ROLES[role].label, description: describeRole(role) })),
];

export function CreateAccountDialog({ onClose, onCreate }: CreateAccountDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState<AccountType>("user");
  const [group, setGroup] = useState<Role | typeof DEFAULT_GROUP>(DEFAULT_GROUP);
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState<AccountErrors>({});
  const [problem, setProblem] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const { show, touch, touchAll } = useTouched();

  const form: AccountForm = { name, email, type, group: type === "admin" && group !== DEFAULT_GROUP ? group : "" };
  const errors = { ...validateAccount(form, loadStaffSnapshot()), ...serverErrors };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    touchAll();
    setProblem(null);
    if (Object.keys(validateAccount(form, loadStaffSnapshot())).length > 0) {
      focusFirstInvalid(formRef.current);
      return;
    }
    setSaving(true);
    const result = onCreate(form);
    setSaving(false);
    if (!result.ok) {
      setServerErrors(result.errors ?? {});
      setProblem(result.reason);
      focusFirstInvalid(formRef.current);
    }
  };

  return (
    <Dialog
      title="Create account"
      description="They get an invite link and set their own password."
      onClose={onClose}
      dismissable={!saving}
      size="md"
      testId="create-account-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button icon={Send} loading={saving} onClick={() => submit()} data-testid="create-account-submit">
            Send invite
          </Button>
        </>
      }
    >
      <form ref={formRef} onSubmit={submit} noValidate className="space-y-4" aria-label="Create account">
        {problem && (
          <p role="alert" className="caption text-danger" data-testid="create-account-problem">
            <span className="font-semibold">Could not create the account.</span> {problem}
          </p>
        )}
        <Field label="Full name" error={show("name") ? errors.name : undefined}>
          <Input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setServerErrors({});
            }}
            onBlur={() => touch("name")}
            placeholder="e.g. Ama Boateng"
            autoComplete="off"
          />
        </Field>
        <Field label="Email" error={show("email") ? errors.email : undefined}>
          <Input
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setServerErrors({});
            }}
            onBlur={() => touch("email")}
            placeholder="name@company.com"
            autoComplete="off"
          />
        </Field>
        <Field label="Role" helper={type === "user" ? "A User has the lowest access (Support)." : "An Admin holds a team role and can sign in to the admin portal."}>
          <SegmentedControl
            options={[
              { value: "user" as AccountType, label: ACCOUNT_TYPE_LABEL.user },
              { value: "admin" as AccountType, label: ACCOUNT_TYPE_LABEL.admin },
            ]}
            value={type}
            onChange={setType}
            ariaLabel="Account role"
          />
        </Field>
        {type === "admin" && (
          <Field label="Team / permission group" optional helper="Decides which pages the admin can open. You can change it later on Roles & permissions.">
            <Select options={groupOptions} value={group} onChange={setGroup} ariaLabel="Team / permission group" />
          </Field>
        )}
        <div className="flex items-start gap-3 rounded-control bg-purple-50 p-3" data-testid="create-account-status">
          <Info size={18} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 shrink-0 text-purple-700" />
          <div>
            <p className="body-sm flex flex-wrap items-center gap-2 font-semibold text-ink">
              Status <StatusBadge status="invited" />
            </p>
            <p className="caption mt-1">
              The account starts as Invited and becomes Active when the person accepts the invite and sets a password. The invite link works for
              48 hours. Nobody else sees or types the password.
            </p>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
