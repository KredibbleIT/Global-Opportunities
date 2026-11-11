"use client";

/**
 * Network (/network): the ambassadors who amplify listings with their referral code (purple accent: Partners and Network are
 * purple). Built on the shared list template.
 *
 * - Summary (NetworkSummary, compact tiles with captions): Network size, Active, and Activity rate (active ambassadors who
 *   logged at least one share this month, divided by the active ones). They count ALL ambassadors, whatever the filters say.
 * - Columns: Ambassador (initials avatar, name, email), Country and city, Campus, Tier, Status badge, Trained (a check or a
 *   dash), Assigned lead.
 * - Filters (they combine): Status (SegmentedControl with counts), Tier and Country (the custom Select), and a search by name
 *   or campus. The status counts follow the other filters.
 * - "New ambassador" (primary) needs edit access on network: Country Lead, Desk Lead, Super Admin. The Partnerships, Training and
 *   Database officers can open the page and read it, and see no such button.
 * Real mode reads the API (services/network.ts); mock mode shows the sample data. The dev ?state= loading|empty|error
 * switch works here (mock mode).
 */
import { useMemo, useState } from "react";
import { Check, Network as NetworkIcon, Plus } from "lucide-react";
import { useRoles } from "@/components/access/RoleProvider";
import { DataTable } from "@/components/list/DataTable";
import { ListPage } from "@/components/list/ListPage";
import { EmptyAction } from "@/components/list/EmptyAction";
import { FilterSelect, TableToolbar } from "@/components/list/TableToolbar";
import type { Column } from "@/components/list/types";
import { AmbassadorBulkActions } from "@/components/network/AmbassadorBulkActions";
import { NetworkSummary } from "@/components/network/NetworkSummary";
import { type SelectOption } from "@/components/ui/form/Select";
import { AMBASSADOR_STATUSES, AMBASSADOR_TIERS, AMBASSADOR_TIER_LABELS, AMBASSADOR_TIER_SHORT_LABELS, type AmbassadorStatus, type AmbassadorTier } from "@/lib/mock-entities";
import { useMockCollection } from "@/lib/mock-store";
import { loadAmbassadorRows, subscribeNetwork, type AmbassadorRow } from "@/lib/services/network";
import { getStatusMeta } from "@/lib/status-map";
import { useListData } from "@/lib/use-list-data";

const ALL = "all";
type StatusFilter = "all" | AmbassadorStatus;

const COLUMNS: Column<AmbassadorRow>[] = [
  {
    key: "ambassador",
    header: "Ambassador",
    type: "primary",
    width: "24%",
    title: (r) => r.name,
    subtitle: (r) => r.email,
    subtitleLines: 1,
    leading: (r) => ({ avatarName: r.name, imageSrc: r.photoUrl }),
  },
  { key: "place", header: "Country and city", type: "text", width: "15%", value: (r) => `${r.city}, ${r.country}` },
  { key: "campus", header: "Campus", type: "text", width: "13%", value: (r) => r.campus },
  { key: "tier", header: "Tier", type: "text", width: "11%", value: (r) => AMBASSADOR_TIER_SHORT_LABELS[r.tier] },
  { key: "status", header: "Status", type: "status", width: "13%", status: (r) => r.status },
  { key: "trained", header: "Trained", type: "text", width: "9%", value: (r) => (r.trained ? "Trained" : "—"), icon: (r) => (r.trained ? Check : undefined) },
  { key: "lead", header: "Assigned lead", type: "text", width: "15%", value: (r) => r.leadName ?? "—" },
];

export default function NetworkPage() {
  const { rows, isLoading, error, retry } = useListData(loadAmbassadorRows, { subscribe: subscribeNetwork });
  const logs = useMockCollection("amplificationLogs");
  const { can } = useRoles();
  const [status, setStatus] = useState<StatusFilter>(ALL);
  const [tier, setTier] = useState<string>(ALL);
  const [country, setCountry] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  // Rows ticked for "Export selected" (by id). They stay ticked while the filters change.
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

  const all = useMemo(() => rows ?? [], [rows]);
  const tierOptions: SelectOption<string>[] = [{ value: ALL, label: "All tiers" }, ...AMBASSADOR_TIERS.map((value) => ({ value, label: AMBASSADOR_TIER_LABELS[value] }))];
  const countryOptions: SelectOption<string>[] = useMemo(
    () => [{ value: ALL, label: "All countries" }, ...[...new Set(all.map((row) => row.country))].sort().map((name) => ({ value: name, label: name }))],
    [all],
  );

  // Tier, Country and the search first; the status tabs and their counts then work on what is left.
  const term = search.trim().toLowerCase();
  const scoped = all.filter(
    (row) =>
      (tier === ALL || row.tier === (tier as AmbassadorTier)) &&
      (country === ALL || row.country === country) &&
      (!term || row.name.toLowerCase().includes(term) || row.campus.toLowerCase().includes(term)),
  );
  const visible = status === ALL ? scoped : scoped.filter((row) => row.status === status);
  const options = [
    { value: ALL as StatusFilter, label: "All", count: rows ? scoped.length : undefined },
    ...AMBASSADOR_STATUSES.map((value) => ({
      value: value as StatusFilter,
      label: getStatusMeta(value).label,
      count: rows ? scoped.filter((row) => row.status === value).length : undefined,
    })),
  ];
  const filtered = status !== ALL || tier !== ALL || country !== ALL || term !== "";

  return (
    <ListPage
      title="Network"
      // SEC-150: "Applicant" here is the registry's first stage, not a request from the app (those are on Ambassador applications).
      subtitle="Ambassadors who amplify listings with their referral code. Applicant is the first stage here; requests from the app are on Ambassador applications."
      action={can("network", "edit") ? { label: "New ambassador", href: "/network/new", icon: Plus } : undefined}
      toolbar={
        <div className="space-y-4">
          <NetworkSummary ambassadors={rows} logs={logs} />
          <TableToolbar
            search={{ value: search, onChange: setSearch, placeholder: "Search by name or campus", label: "Search ambassadors" }}
            filters={{ options, value: status, onChange: setStatus, label: "Filter by status" }}
            // Export, Import and History: each only for a role that has the permission (see AmbassadorBulkActions).
            actions={
            <AmbassadorBulkActions
              allRows={all}
              filteredRows={visible}
              selectedIds={selected}
              filters={{ status, tier, country, search: term }}
              onClearSelection={() => setSelected(new Set())}
            />
            }
          >
            <FilterSelect options={tierOptions} value={tier} onChange={setTier} ariaLabel="Filter by tier" sheetTitle="Tier" />
            <FilterSelect options={countryOptions} value={country} onChange={setCountry} ariaLabel="Filter by country" sheetTitle="Country" />
          </TableToolbar>
        </div>
      }
    >
      <DataTable
        onClearFilters={() => { setStatus(ALL); setTier(ALL); setCountry(ALL); setSearch(""); }}
        label="Ambassadors"
        columns={COLUMNS}
        rows={visible}
        getRowKey={(r) => r.id}
        getRowHref={(r) => `/network/${r.id}`}
        loading={isLoading}
        error={error}
        onRetry={retry}
        isFiltered={filtered}
        resetKey={`${status}|${tier}|${country}|${term}`}
        selection={
          can("ambassadors.export", "edit")
            ? { selected, onChange: (next) => setSelected(next), itemLabel: (row) => `Select ${row.name}` }
            : undefined
        }
        emptyNoData={{ icon: NetworkIcon, title: "No ambassadors yet", description: "People who share listings with their referral code appear here.", action: can("network", "edit") ? <EmptyAction href="/network/new" label="Add your first ambassador" /> : undefined }}
        emptyNoResults={{ icon: NetworkIcon, title: "No ambassadors match these filters", description: "Try another status, tier, country or search." }}
      />
    </ListPage>
  );
}
