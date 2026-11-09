"use client";

/**
 * Verification Queue: companies that submitted their documents for Hirer verification.
 * Built on the shared list template (ListPage + TableToolbar + DataTable): this file only
 * holds the column config, the filter and the data loader.
 *
 * Data: loadVerificationRows() (mock data in mock mode, GET /verification/companies in real mode).
 * It loads everything once; the filter and its counts are computed here, so changing the filter
 * does not make a request. A failed request shows inline with "Try again".
 *
 * Two sections (tabs), each with its own count and empty state: "Awaiting verification" (pending: the company's documents wait for a
 * decision) and "Reviewed requests" (approved or rejected). Every request in the data has submitted its documents, so the split is by
 * decision.
 */
import { useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { formatDate } from "@/lib/format";
import { loadVerificationRows, type VerificationRow } from "@/lib/services/lists";
import { subscribeMockStore } from "@/lib/mock-store";
import { useListData } from "@/lib/use-list-data";
import { DataTable } from "@/components/list/DataTable";
import { ListPage } from "@/components/list/ListPage";
import { Tabs, tabId, tabPanelId } from "@/components/ui/Tabs";
import type { Column } from "@/components/list/types";

/** The two sections: accounts still waiting for a decision, and requests that already have one (approved or rejected). */
type Section = "awaiting" | "reviewed";
const ID_PREFIX = "verification";

const COLUMNS: Column<VerificationRow>[] = [
  { key: "company", header: "Company", type: "primary", width: "34%", title: (r) => r.name, subtitle: (r) => r.recruiterEmail },
  { key: "industry", header: "Industry", type: "text", width: "22%", value: (r) => r.industry },
  { key: "submitted", header: "Submitted", type: "text", width: "20%", value: (r) => formatDate(r.submittedDate) },
  { key: "status", header: "Status", type: "status", width: "24%", status: (r) => r.overallStatus },
];

export default function VerificationQueuePage() {
  const { rows, isLoading, error, retry } = useListData(loadVerificationRows, { subscribe: subscribeMockStore });
  const [section, setSection] = useState<Section>("awaiting");

  const all = useMemo(() => rows ?? [], [rows]);
  const awaiting = all.filter((r) => r.overallStatus === "pending");
  const reviewed = all.filter((r) => r.overallStatus !== "pending");
  const visible = section === "awaiting" ? awaiting : reviewed;

  return (
    <ListPage
      title="Verification Queue"
      subtitle="Review company verification requests."
      toolbar={
        // Two labelled sections, each with its own count (and its own empty state below).
        <Tabs
          ariaLabel="Verification sections"
          idPrefix={ID_PREFIX}
          value={section}
          onChange={setSection}
          tabs={[
            { value: "awaiting", label: "Awaiting verification", count: rows ? awaiting.length : undefined },
            { value: "reviewed", label: "Reviewed requests", count: rows ? reviewed.length : undefined },
          ]}
        />
      }
    >
      <div role="tabpanel" id={tabPanelId(ID_PREFIX, section)} aria-labelledby={tabId(ID_PREFIX, section)}>
        <DataTable
          label={section === "awaiting" ? "Accounts awaiting verification" : "Reviewed verification requests"}
          columns={COLUMNS}
          rows={visible}
          getRowKey={(r) => r.id}
          getRowHref={(r) => `/verification/${r.id}`}
          loading={isLoading}
          error={error}
          onRetry={retry}
          resetKey={section}
          emptyNoData={
            section === "awaiting"
              ? { icon: ShieldCheck, title: "Nothing is waiting for review", description: "Companies appear here when they submit their documents at signup." }
              : { icon: ShieldCheck, title: "No reviewed requests yet", description: "Requests you approve or reject move here." }
          }
          emptyNoResults={{ icon: ShieldCheck, title: "No requests to show" }}
        />
      </div>
    </ListPage>
  );
}
