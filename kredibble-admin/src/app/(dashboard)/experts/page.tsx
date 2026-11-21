"use client";

/**
 * Experts: seekers who asked, in the mobile app, to be shown on the Expert listing.
 * Built on the shared list template (ListPage + TableToolbar + DataTable), like Ambassador applications.
 *
 * Data: GET /admin/experts (real API; there is no mock version). It loads the first 100 once and the status filter and its counts are
 * computed here. A failed request shows inline with "Try again". Each row opens /experts/[id], where the expert is approved, turned down or hidden.
 */
import { useMemo, useState } from "react";
import { BadgeCheck } from "lucide-react";
import { getAdminExperts, type ExpertApplicationRecord } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useListData } from "@/lib/use-list-data";
import { DataTable } from "@/components/list/DataTable";
import { ListPage } from "@/components/list/ListPage";
import { TableToolbar } from "@/components/list/TableToolbar";
import type { Column } from "@/components/list/types";

type Filter = "all" | "pending" | "approved" | "rejected" | "hidden";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "hidden", label: "Hidden" },
  { value: "all", label: "All" },
];

const loadExperts = async (): Promise<ExpertApplicationRecord[]> => (await getAdminExperts({ limit: 100 })).data;

const COLUMNS: Column<ExpertApplicationRecord>[] = [
  { key: "expert", header: "Expert", type: "primary", width: "30%", title: (r) => r.name, subtitle: (r) => r.email, subtitleLines: 1, leading: (r) => ({ avatarName: r.name }) },
  { key: "profession", header: "Profession", type: "text", width: "20%", value: (r) => r.profession || "—" },
  { key: "location", header: "Location", type: "text", width: "16%", value: (r) => [r.city, r.country].filter(Boolean).join(", ") || "—" },
  { key: "rating", header: "Rating", type: "text", width: "10%", value: (r) => (r.ratingCount > 0 ? `${r.rating.toFixed(1)} (${r.ratingCount})` : "—") },
  { key: "applied", header: "Applied", type: "text", width: "12%", value: (r) => (r.appliedAt ? formatDate(r.appliedAt) : "—") },
  { key: "status", header: "Status", type: "status", width: "12%", status: (r) => r.status },
];

export default function ExpertsPage() {
  const { rows, isLoading, error, retry } = useListData(loadExperts);
  const [filter, setFilter] = useState<Filter>("pending");

  const all = useMemo(() => rows ?? [], [rows]);
  const options = FILTERS.map((f) => ({
    ...f,
    count: rows ? (f.value === "all" ? all.length : all.filter((r) => r.status === f.value).length) : undefined,
  }));
  const visible = filter === "all" ? all : all.filter((r) => r.status === filter);

  return (
    <ListPage
      title="Experts"
      subtitle="Seekers who asked to be shown on the Expert listing in the app. Approving puts the person on the listing for seekers and hirers; contact details show only if they chose to share them."
      toolbar={<TableToolbar filters={{ options, value: filter, onChange: setFilter, label: "Filter by status" }} />}
    >
      <DataTable
        label="Experts"
        columns={COLUMNS}
        rows={visible}
        getRowKey={(r) => r.id}
        getRowHref={(r) => `/experts/${r.id}`}
        loading={isLoading}
        error={error}
        onRetry={retry}
        // "Filtered" only when there is something to filter: an empty dataset is "No experts yet", never "No matching experts".
        isFiltered={filter !== "all" && all.length > 0}
        onClearFilters={() => setFilter("all")}
        resetKey={filter}
        emptyNoData={{ icon: BadgeCheck, title: "No experts yet", description: "They appear here when a seeker taps “Be listed as an expert” in the app." }}
        emptyNoResults={{ icon: BadgeCheck, title: "No matching experts", description: "Nothing has this status. Choose another status, or clear the filter." }}
      />
    </ListPage>
  );
}
