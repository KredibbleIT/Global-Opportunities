"use client";

/**
 * Grants: funding-pool allocation and application review across all posted grants.
 * Built on the shared list template; this file holds the column config and the data.
 * Data: lib/services/grants.ts (SEC-157): the samples in mock mode, GET /admin/grants in real mode (amounts in USD).
 */
import { HandCoins } from "lucide-react";
import type { GrantRecord } from "@/lib/mock-grant-ops";
import { subscribeMockStore } from "@/lib/mock-store";
import { loadGrantRows } from "@/lib/services/grants";
import { useListData } from "@/lib/use-list-data";
import { DataTable } from "@/components/list/DataTable";
import { formatMoney } from "@/lib/format";
import { ListPage } from "@/components/list/ListPage";
import type { Column } from "@/components/list/types";


const COLUMNS: Column<GrantRecord>[] = [
  { key: "grant", header: "Grant", type: "primary", width: "30%", title: (r) => r.title, titleLines: 2, leading: () => ({ icon: HandCoins }) },
  { key: "hirer", header: "Hirer", type: "text", width: "12%", value: (r) => r.hirer },
  { key: "sector", header: "Sector", type: "text", width: "10%", value: (r) => r.sector },
  {
    key: "budget",
    header: "Budget allocated",
    type: "progress",
    width: "30%",
    // "USD 75,000 / USD 200,000" and "38%" on one line: below this the table scrolls inside its card instead of spilling.
    minWidth: 272,
    // "USD 75,000 / USD 200,000": the code is always explicit.
    label: (r) => `${formatMoney(r.allocated, r.currency)} / ${formatMoney(r.fundingPool, r.currency)}`,
    percent: (r) => (r.fundingPool > 0 ? Math.round((r.allocated / r.fundingPool) * 100) : 0),
  },
  { key: "status", header: "Status", type: "status", width: "18%", status: (r) => r.status },
];

export default function GrantsOpsPage() {
  const { rows, isLoading, error, retry } = useListData(loadGrantRows, { subscribe: subscribeMockStore });

  return (
    <ListPage title="Grants" subtitle="Funding pool allocation and application review across all posted grants.">
      <DataTable
        label="Grants"
        columns={COLUMNS}
        rows={rows ?? []}
        getRowKey={(r) => r.id}
        getRowHref={(r) => `/grants/${r.id}`}
        loading={isLoading}
        error={error}
        onRetry={retry}
        emptyNoData={{ icon: HandCoins, title: "No grants yet", description: "Grants posted by hirers appear here." }}
        emptyNoResults={{ icon: HandCoins, title: "No grants match" }}
      />
    </ListPage>
  );
}
