"use client";

/**
 * AccountTab: Settings > My account. Every role has it.
 *
 * - Profile: name (editable), photo (FileDrop: a preview only, nothing is uploaded), email and role(s) (read-only, with the lock look).
 * - Change password: current, new and confirm, each with the show/hide eye (PasswordInput, the one Login has), a strength hint, and the
 *   messages "Use at least 8 characters" and "The passwords do not match". The three values live in this form's state while they are being
 *   typed and are emptied when the change is made: nothing stores them, nothing logs them, no toast repeats them.
 * - Notification preferences: switches.
 * - Sign out.
 * GOD-T47: real mode shows the signed-in account as the server knows it (never the sample Super Admin) and every save waits for the server:
 * a refusal (for example a wrong current password) is said in words and nothing changes. A changed password ends every session, so the
 * person is signed out and signs in again with the new one. Mock mode saves to the store and this screen's memory only.
 * Leaving with unsaved changes asks first (the shared guard), and the shell asks before a tab switch.
 */
import { useMemo, useRef, useState, type FormEvent } from "react";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRoles } from "@/components/access/RoleProvider";
import { useSettingsDirty } from "@/components/settings/SettingsShell";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/form/Field";
import { FileDrop } from "@/components/ui/form/FileDrop";
import { Input } from "@/components/ui/form/Input";
import { PasswordInput } from "@/components/ui/form/PasswordInput";
import { Switch } from "@/components/ui/form/Switch";
import { focusFirstInvalid, useTouched } from "@/components/ui/form/use-touched";
import { useUnsavedGuard } from "@/components/ui/form/use-unsaved-guard";
import { TagPill } from "@/components/ui/TagPill";
import { useToast } from "@/components/ui/Toast";
import { clearAdminSession, logoutAdmin } from "@/lib/api";
import { ROLES } from "@/config/roles";
import { cn } from "@/lib/cn";
import { isMockMode } from "@/lib/services/mock-mode";
import {
  NOTIFICATION_PREFERENCES,
  STRENGTH_HINTS,
  currentProfile,
  getNotificationPreferences,
  passwordStrength,
  saveNotificationPreferences,
  saveProfileName,
  validatePasswordChange,
  changePassword as changePasswordOnServer,
  type NotificationKey,
} from "@/lib/services/settings";

const STRENGTH_BAR = { empty: 0, weak: 1, fair: 2, strong: 3 } as const;
const STRENGTH_COLOUR = { empty: "bg-line", weak: "bg-danger-dot", fair: "bg-warning-dot", strong: "bg-success-dot" } as const;

export function AccountTab() {
  const { roles } = useRoles();
  const toast = useToast();
  const router = useRouter();
  const profile = useMemo(() => currentProfile(), []);
  const [savedPrefs, setSavedPrefs] = useState(getNotificationPreferences);

  const [name, setName] = useState(profile?.name ?? "");
  const [savedName, setSavedName] = useState(profile?.name ?? "");
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  const [prefs, setPrefs] = useState<Record<NotificationKey, boolean>>(savedPrefs);
  const [password, setPassword] = useState({ current: "", next: "", confirm: "" });
  const [savingPassword, setSavingPassword] = useState(false);
  const passwordForm = useRef<HTMLFormElement>(null);
  const passwordTouched = useTouched();

  const nameChanged = name.trim() !== savedName;
  const prefsChanged = NOTIFICATION_PREFERENCES.some((pref) => prefs[pref.key] !== savedPrefs[pref.key]);
  const dirty = nameChanged || prefsChanged || !!photo || !!password.current || !!password.next || !!password.confirm;
  useSettingsDirty(dirty);
  const guard = useUnsavedGuard(dirty);

  const nameError = !name.trim() ? "Enter your name." : undefined;
  const strength = passwordStrength(password.next);
  const errors = validatePasswordChange(password);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (nameError || !profile) return;
    try {
      await saveProfileName(profile.id, name);
    } catch (error) {
      toast.error(`Your profile was not saved: ${error instanceof Error ? error.message : "Please try again."}`);
      return;
    }
    setSavedName(name.trim());
    setName(name.trim());
    toast.success("Your profile was saved.");
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    passwordTouched.touchAll();
    if (Object.keys(errors).length > 0) {
      focusFirstInvalid(passwordForm.current);
      return;
    }
    setSavingPassword(true);
    const { current, next } = password;
    // The values are emptied the moment they are sent: they are not kept, shown or logged.
    setPassword({ current: "", next: "", confirm: "" });
    passwordTouched.reset();
    try {
      await changePasswordOnServer(current, next);
    } catch (error) {
      setSavingPassword(false);
      toast.error(`Your password was not changed: ${error instanceof Error ? error.message : "Please try again."}`);
      return;
    }
    setSavingPassword(false);
    if (!isMockMode()) {
      // The server ended every session with the old password: sign in again with the new one.
      toast.success("Your password was changed. Sign in again with your new password.");
      await signOut();
      return;
    }
    toast.success("Your password was changed.");
  };

  const savePreferences = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await saveNotificationPreferences(prefs);
    } catch (error) {
      toast.error(`Your notification preferences were not saved: ${error instanceof Error ? error.message : "Please try again."}`);
      return;
    }
    setSavedPrefs({ ...prefs });
    toast.success("Your notification preferences were saved.");
  };

  const signOut = async () => {
    try {
      await logoutAdmin();
    } catch {
      // The server may be unreachable; the local session still ends.
    } finally {
      clearAdminSession();
      router.push("/login");
    }
  };

  return (
    <div className="max-w-240 space-y-4">
      <Card as="section" ariaLabel="Profile">
        <CardHeader title="Profile" subtitle="How you appear to the rest of the desk." />
        <form onSubmit={saveProfile} noValidate className="space-y-4">
          <Field label="Name" error={nameError && nameChanged ? nameError : undefined}>
            <Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
          </Field>
          <Field label="Photo" optional helper="A picture of you. It is only previewed here: nothing is uploaded yet.">
            {/* GOD-T47: a small preview (it was a card-wide picture); FileDrop keeps its own controls */}
            <div className="max-w-[12rem]">
              <FileDrop value={photo} onChange={setPhoto} alt="Your photo" emptyLabel="Click to upload or drag a photo here" />
            </div>
          </Field>
          <Field label="Email" helper="Your email is your sign-in. Ask a Desk Lead to change it.">
            <Input value={profile?.email ?? "—"} readOnly disabled data-testid="account-email" />
          </Field>
          <div>
            <p className="field-label mb-1.5 text-ink">{roles.length === 1 ? "Role" : "Roles"}</p>
            <div data-testid="account-roles" className="flex flex-wrap gap-2">
              {roles.map((role) => (
                <TagPill key={role}>{ROLES[role].label}</TagPill>
              ))}
            </div>
            <p className="caption mt-1.5">Your roles decide what you can see and change. They are set by a Desk Lead.</p>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={!nameChanged || !!nameError}>
              Save profile
            </Button>
          </div>
        </form>
      </Card>

      <Card as="section" ariaLabel="Change password">
        <CardHeader title="Change password" subtitle="Use a password you do not use anywhere else." />
        <form ref={passwordForm} onSubmit={changePassword} noValidate className="space-y-4">
          <Field label="Current password" error={passwordTouched.show("current") ? errors.current : undefined}>
            <PasswordInput value={password.current} onChange={(value) => setPassword((p) => ({ ...p, current: value }))} onBlur={() => passwordTouched.touch("current")} autoComplete="current-password" label="current password" />
          </Field>
          <Field label="New password" error={passwordTouched.show("next") ? errors.next : undefined}>
            <PasswordInput value={password.next} onChange={(value) => setPassword((p) => ({ ...p, next: value }))} onBlur={() => passwordTouched.touch("next")} autoComplete="new-password" label="new password" />
          </Field>
          <div data-testid="password-strength" data-strength={strength} aria-live="polite" className="-mt-2">
            <div aria-hidden="true" className="flex gap-1">
              {[1, 2, 3].map((step) => (
                <span key={step} className={cn("h-1.5 flex-1 rounded-pill", STRENGTH_BAR[strength] >= step ? STRENGTH_COLOUR[strength] : "bg-line")} />
              ))}
            </div>
            <p className="caption mt-1.5">{STRENGTH_HINTS[strength]}</p>
          </div>
          <Field label="Confirm new password" error={passwordTouched.show("confirm") ? errors.confirm : undefined}>
            <PasswordInput value={password.confirm} onChange={(value) => setPassword((p) => ({ ...p, confirm: value }))} onBlur={() => passwordTouched.touch("confirm")} autoComplete="new-password" label="confirmation" />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={savingPassword}>
              Change password
            </Button>
          </div>
        </form>
      </Card>

      <Card as="section" ariaLabel="Notification preferences">
        <CardHeader title="Notification preferences" subtitle="What the desk may email you about." />
        <form onSubmit={savePreferences} className="space-y-4">
          {NOTIFICATION_PREFERENCES.map((pref) => (
            <Switch
              key={pref.key}
              checked={prefs[pref.key]}
              onChange={(checked) => setPrefs((current) => ({ ...current, [pref.key]: checked }))}
              label={pref.label}
              statusText={prefs[pref.key] ? "On" : "Off"}
              description={pref.description}
            />
          ))}
          <div className="flex justify-end">
            <Button type="submit" disabled={!prefsChanged}>
              Save preferences
            </Button>
          </div>
        </form>
      </Card>

      <Card as="section" ariaLabel="Sign out">
        <CardHeader title="Sign out" subtitle="End this session on this device." />
        <Button variant="secondary" icon={LogOut} onClick={signOut}>
          Sign out
        </Button>
      </Card>
      {guard.dialog}
    </div>
  );
}
