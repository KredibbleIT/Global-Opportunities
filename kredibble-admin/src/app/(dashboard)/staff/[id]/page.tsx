"use client";

/**
 * Staff detail: one team member.
 * Built on the shared detail template.
 *
 * Fields: name, email, joined date, title and country (when known), roles (one or two), status.
 * Actions: change Roles (a person holds one or two; at least one stays checked), Suspend access (danger zone,
 * confirm dialog) and Reinstate access (header, when suspended). These change what the person may do, so they are
 * Super Admin only (accounts.create, the same rule as the Team list's account actions) and never on your own record;
 * everyone else sees the roles read-only. Each change waits for the API and shows its error (SEC-134).
 * Data: the ONE staff collection (services/staff.ts), shared with the Team list, the invite form and the
 * scorecards, so changes show everywhere.
 */
import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import { Ban, RotateCcw } from "lucide-react";
import { MAX_STAFF_ROLES } from "@/config/staff-roles";
import { ROLE_IDS, ROLES, type Role } from "@/config/roles";
import { getAdminUser } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useBreadcrumbLabel } from "@/lib/breadcrumb-label";
import { loadStaffMember, setStaffRoles, setStaffStatus, subscribeStaff } from "@/lib/services/staff";
import { useDetailData } from "@/lib/use-detail-data";
import { useRoles } from "@/components/access/RoleProvider";
import { DangerZone } from "@/components/detail/DangerZone";
import { DetailHeader } from "@/components/detail/DetailHeader";
import { DetailPage } from "@/components/detail/DetailPage";
import { DetailError, DetailNotFound, DetailSkeleton } from "@/components/detail/DetailStates";
import { InfoCard } from "@/components/detail/InfoCard";
import { Button } from "@/components/ui/Button";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Checkbox } from "@/components/ui/form/Checkbox";
import { KeyValueList } from "@/components/ui/KeyValueList";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { NotConnectedNotice } from "@/components/ui/NotConnectedNotice";

export default function StaffDetailPage() {
  const { id } = useParams<{ id: string }>();
  const load = useCallback(() => loadStaffMember(id), [id]);
  const { status, record: staff, error, retry } = useDetailData(load, { subscribe: subscribeStaff });
  const toast = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const { can } = useRoles();
  const [saving, setSaving] = useState(false);

  useBreadcrumbLabel(status === "loading" ? undefined : staff ? staff.name : "Not found");

  if (status === "loading") return <DetailSkeleton />;
  if (status === "error") return <DetailError message={error ?? "Could not load this staff member."} onRetry={retry} />;
  if (!staff) return <DetailNotFound noun="Staff member" listLabel="Team" listHref="/team" />;

  const isActive = staff.status === "active";
  const isSuspended = staff.status === "suspended"; // Invited and Deactivated accounts are managed from the Team list
  const roleLabels = staff.roles.map((role) => ROLES[role].label);
  const isSelf = getAdminUser()?.email?.toLowerCase() === staff.email.toLowerCase();
  const canManage = can("accounts.create", "edit") && !isSelf;

  /** Runs one change, waits for the API, then confirms it or shows why it was refused. */
  const run = async (change: () => Promise<void>, done: string, failed: string) => {
    setSaving(true);
    try {
      await change();
      toast.success(done);
    } catch (problem) {
      toast.error(problem instanceof Error ? problem.message : failed);
    } finally {
      setSaving(false);
    }
  };

  const toggleRole = (role: Role, checked: boolean) => {
    const next = checked ? [...staff.roles, role] : staff.roles.filter((held) => held !== role);
    if (next.length < 1 || next.length > MAX_STAFF_ROLES) return;
    void run(() => setStaffRoles(staff.id, next), `${staff.name}'s roles were updated.`, "The roles could not be changed. Try again.");
  };

  const suspend = () =>
    confirm({
      title: "Suspend access?",
      description: (
        <>
          <strong className="text-ink">{staff.name}</strong> ({staff.email}, {roleLabels.join(" and ")}) will lose access to the admin until you
          reinstate it.
        </>
      ),
      confirmLabel: "Suspend access",
      onConfirm: () => void run(() => setStaffStatus(staff.id, "suspended"), `${staff.name} was suspended.`, "Access could not be suspended. Try again."),
    });

  const reinstate = () =>
    void run(() => setStaffStatus(staff.id, "active"), `${staff.name} was reinstated.`, "Access could not be reinstated. Try again.");

  return (
    <>
      <NotConnectedNotice className="mb-4" />
      <DetailPage
        header={
          <DetailHeader
            leading={{ name: staff.name }}
            title={staff.name}
            badges={<StatusBadge status={staff.status} />}
            meta={`${staff.email} · Joined ${formatDate(staff.joinedDate)}`}
            actions={
              canManage && isSuspended && (
                <Button variant="secondary" icon={RotateCcw} onClick={reinstate} disabled={saving}>
                  Reinstate access
                </Button>
              )
            }
          />
        }
        main={
          <InfoCard title="Roles">
            <p className="caption mb-4">
              A person holds one or two roles. What each role may open is set on the Team page, under Roles &amp; permissions.
              {!canManage && (isSelf ? " You can't change your own roles." : " Only a Super Admin can change them.")}
            </p>
            <div role="group" aria-label="Roles" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {ROLE_IDS.map((role) => {
                const held = staff.roles.includes(role);
                return (
                  <Checkbox
                    key={role}
                    checked={held}
                    onChange={(checked) => toggleRole(role, checked)}
                    label={ROLES[role].label}
                    description={ROLES[role].description}
                    // Super Admin only; two roles at most, and the last one cannot be removed.
                    disabled={!canManage || saving || (held ? staff.roles.length === 1 : staff.roles.length >= MAX_STAFF_ROLES)}
                  />
                );
              })}
            </div>
          </InfoCard>
        }
        side={
          <InfoCard title="Details">
            <KeyValueList
              items={[
                { label: "Email", value: staff.email },
                { label: roleLabels.length > 1 ? "Roles" : "Role", value: roleLabels.join(", ") },
                { label: "Title", value: staff.title },
                { label: "Country", value: staff.country },
                { label: "Joined", value: formatDate(staff.joinedDate) },
              ]}
            />
          </InfoCard>
        }
        danger={
          canManage && isActive && (
            <DangerZone explanation="Removes this person's access to the admin. You can reinstate it at any time.">
              <Button variant="danger" icon={Ban} onClick={suspend} disabled={saving}>
                Suspend access
              </Button>
            </DangerZone>
          )
        }
      />
      {dialog}
    </>
  );
}
