"use client";

/**
 * Reports queue: trust & safety reports across posts, users, channels and postings.
 * Built on the shared list template; this file holds the column config, the status filter
 * (default: Open) and the data.
 * Data: lib/services/reports.ts. Mock mode: the sample reports with this session's changes; real mode: GET /admin/reports, the same records the
 * Overview's "Open reports" counts, so the two numbers agree.
 *
 * "Open" is a warning here (the report is waiting on a person), unlike an open opportunity;
 * that is the status badge's kind="report".
 */
import { useState } from "react";
import { Flag } from "lucide-react";
import type { Report } from "@/lib/mock-reports";
import { subscribeMockStore } from "@/lib/mock-store";
import { loadReportRows } from "@/lib/services/reports";
import { useListData } from "@/lib/use-list-data";
import { DataTable } from "@/components/list/DataTable";
import { ListPage } from "@/components/list/ListPage";
import { TableToolbar } from "@/components/list/TableToolbar";
import type { Column } from "@/components/list/types";

const loadReports = loadReportRows;

type Filter = "all" | "open" | "resolved" | "dismissed";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
];

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const COLUMNS: Column<Report>[] = [
  { key: "target", header: "Target", type: "primary", width: "30%", title: (r) => r.targetLabel, titleLines: 2 },
  { key: "type", header: "Type", type: "text", width: "13%", value: (r) => capitalise(r.targetType) },
  { key: "reason", header: "Reason", type: "text", width: "20%", value: (r) => r.reason },
  { key: "reporter", header: "Reported by", type: "text", width: "20%", mobileLabel: "Reported by", value: (r) => r.reporterName },
  { key: "status", header: "Status", type: "status", width: "17%", kind: "report", status: (r) => r.status },
];

export default function ReportsQueuePage() {
  const { rows, isLoading, error, retry } = useListData(loadReports, { subscribe: subscribeMockStore });
  const [filter, setFilter] = useState<Filter>("open"); // reports default to the open ones

  const all = rows ?? [];
  const options = FILTERS.map((f) => ({
    ...f,
    count: rows ? (f.value === "all" ? all.length : all.filter((r) => r.status === f.value).length) : undefined,
  }));
  const visible = filter === "all" ? all : all.filter((r) => r.status === filter);
  const openCount = all.filter((r) => r.status === "open").length;

  return (
    <ListPage
      title="Reports queue"
      subtitle={
        rows
          ? `${openCount} open report${openCount === 1 ? "" : "s"} awaiting review across posts, users, channels, and postings.`
          : "Open reports awaiting review across posts, users, channels, and postings."
      }
      toolbar={<TableToolbar filters={{ options, value: filter, onChange: setFilter, label: "Filter by status" }} />}
    >
      <DataTable
        label="Reports"
        columns={COLUMNS}
        rows={visible}
        getRowKey={(r) => r.id}
        getRowHref={(r) => `/reports/${r.id}`}
        loading={isLoading}
        error={error}
        onRetry={retry}
        isFiltered={filter !== "all" && all.length > 0} // an empty dataset is "No reports yet", whatever the default filter
        onClearFilters={() => setFilter("all")}
        resetKey={filter}
        emptyNoData={{ icon: Flag, title: "No reports yet", description: "Reports from users appear here for review." }}
        emptyNoResults={{ icon: Flag, title: "No reports in this category", description: "Try another status, or choose All." }}
      />
    </ListPage>
  );
}
