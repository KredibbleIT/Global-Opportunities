"use client";

/**
 * Team > Members: everyone on the team, on the shared list template (DataTable).
 * Data: the ONE staff collection (services/staff.ts), the same people the invite form, the member page and the
 * scorecards use. It is live: inviting a member or changing a role elsewhere updates this list through the store's
 * subscription. The Role column shows a pill for EVERY role a person holds. Row links open /staff/[id].
 * All members fit on one page (25 rows), so the number of rows is the number of people.
 * Account states: Invited (waiting for the person to set a password), Active, Deactivated, plus the older Suspended. For a Super Admin
 * (prop `actionsFor` is given) each row also has a three-dot menu: Resend invite, Make Admin / Make User, Deactivate / Reactivate.
 */
import { UserCog } from "lucide-react";
import { ROLES } from "@/config/roles";
import type { StaffMember } from "@/lib/mock-entities";
import { loadStaffRows, subscribeStaff } from "@/lib/services/staff";
import { useListData } from "@/lib/use-list-data";
import { DataTable } from "@/components/list/DataTable";
import type { Column } from "@/components/list/types";
import { Kebab } from "@/components/ui/Kebab";
import type { MenuItem } from "@/components/ui/Menu";

const COLUMNS: Column<StaffMember>[] = [
  { key: "name", header: "Name", type: "primary", width: "26%", title: (r) => r.name, subtitle: (r) => r.title },
  { key: "email", header: "Email", type: "text", width: "26%", value: (r) => r.email },
  { key: "role", header: "Role", type: "pill", width: "30%", mobileLabel: "Roles", label: (r) => r.roles.map((role) => ROLES[role].label) },
  { key: "status", header: "Status", type: "status", width: "18%", status: (r) => r.status },
];

/** The row menu column. The wrapper sits above the row's stretched link (z-10) so the menu opens instead of the member page. */
const actionsColumn = (actionsFor: (person: StaffMember) => MenuItem[]): Column<StaffMember> => ({
  key: "actions",
  header: "Actions",
  type: "custom",
  width: "56px",
  render: (person) => (
    <div className="relative z-10 flex justify-end max-sm:justify-start">
      {/* Text for the phone card's "Actions" row (a cell with only an icon button would read as an empty value); the button has its own accessible name. */}
      <span className="sr-only" aria-hidden="true">Account actions</span>
      <Kebab label={`Account actions for ${person.name}`} items={actionsFor(person)} />
    </div>
  ),
});

export function MembersTab({ actionsFor }: { actionsFor?: (person: StaffMember) => MenuItem[] }) {
  const { rows, isLoading, error, retry } = useListData(loadStaffRows, { subscribe: subscribeStaff });

  return (
    <DataTable
      label="Staff"
      columns={actionsFor ? [...COLUMNS, actionsColumn(actionsFor)] : COLUMNS}
      rows={rows ?? []}
      getRowKey={(r) => r.id}
      getRowHref={(r) => `/staff/${r.id}`}
      loading={isLoading}
      error={error}
      onRetry={retry}
      pageSize={25}
      emptyNoData={{ icon: UserCog, title: "No staff accounts yet", description: "Invite the first admin or support member." }}
      emptyNoResults={{ icon: UserCog, title: "No staff match" }}
    />
  );
}
