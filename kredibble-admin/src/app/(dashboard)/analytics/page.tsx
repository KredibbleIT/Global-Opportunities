"use client";

/**
 * Insights (/analytics): charts only. The Overview owns the headline KPIs, so this page keeps just one
 * stat row (total applications, open reports) and the charts below.
 *
 * Charts:
 * - Postings by type          segmented bar    the Opportunities Queue's rows, by type
 * - Verification status       segmented bar    the Verification Queue's rows, by decision
 * - Reports by reason         highlight bar    the Reports Queue's rows, by reason (sorted so the most common is last, which is
 *                                              the bar the chart highlights in orange)
 * Each chart has a visually hidden text-alternative table and an empty state.
 *
 * Data (GOD-T29): lib/services/insights.ts reads each figure from the SAME loader as the page it summarises, so Insights agrees with
 * the queues and the Overview by construction: the API in real mode, the sample lists (with this session's changes) in mock mode.
 * The month selector keeps the month in the URL (useMonth). These charts do not change by month yet, so choosing a past month
 * shows a note that says so. A skeleton while loading; an error with Try again.
 */
import { BarChart3, Briefcase, Flag } from "lucide-react";
import { useCallback } from "react";
import { useMockStoreVersion } from "@/lib/mock-store";
import type { OpportunityType } from "@/lib/mock-opportunities";
import { loadInsights } from "@/lib/services/insights";
import { useAsync } from "@/lib/use-async";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { getStatusMeta } from "@/lib/status-map";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { HighlightBarChart } from "@/components/ui/HighlightBarChart";
import { IconTile } from "@/components/ui/IconTile";
import { MonthSelect } from "@/components/ui/MonthSelect";
import { formatMonth } from "@/lib/format";
import { useMonth } from "@/lib/use-month";
import { SegmentedBar } from "@/components/ui/SegmentedBar";

const TYPE_LABELS: Record<OpportunityType, string> = {
  jobs: "Jobs",
  internships: "Internships",
  events: "Events",
  grants: "Grants",
};

const VERIFICATION_ORDER = ["approved", "pending", "rejected"] as const;

export default function InsightsPage() {
  const version = useMockStoreVersion(); // load again when a decision elsewhere changes the records (mock mode)
  const { month, isCurrent } = useMonth();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(() => loadInsights(), [version]);
  const { data, error, isLoading, reload } = useAsync(load);

  const header = (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h1 data-testid="page-title" className="page-title">Insights</h1>
        <p className="page-subtitle mt-1">How postings, verification and reports break down across the platform.</p>
      </div>
      <MonthSelect />
    </header>
  );
  if (error && !isLoading) {
    return (
      <div className="space-y-4">
        {header}
        <Card>
          <EmptyState icon={BarChart3} tone="danger" title="Could not load Insights" description="Please try again." action={<Button variant="secondary" onClick={reload}>Try again</Button>} />
        </Card>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4" aria-busy="true">
        {header}
        <div data-testid="insights-skeleton" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Skeleton className="h-24 rounded-control" />
          <Skeleton className="h-24 rounded-control" />
        </div>
        <Skeleton className="h-chart w-full rounded-control" />
      </div>
    );
  }

  const { totalApplications, postings: opportunities, companies, reports: reportRows } = data;
  const openReports = reportRows.filter((report) => report.status === "open").length;

  const postingsByType = (Object.keys(TYPE_LABELS) as OpportunityType[]).map((type) => ({
    label: TYPE_LABELS[type],
    value: opportunities.filter((opportunity) => opportunity.type === type).length,
  }));

  const verificationByStatus = VERIFICATION_ORDER.map((status) => ({
    label: getStatusMeta(status).label,
    value: companies.filter((company) => company.overallStatus === status).length,
  }));

  // Reports per reason, fewest first: the chart highlights its last bar, i.e. the most common reason.
  const reasonCounts = [...new Set(reportRows.map((report) => report.reason))]
    .map((reason) => ({ reason, count: reportRows.filter((report) => report.reason === reason).length }))
    .sort((a, b) => a.count - b.count || a.reason.localeCompare(b.reason));

  return (
    <div className="space-y-4">
      {header}
      {!isCurrent && (
        <p className="caption" role="status">
          {formatMonth(month)}: the figures below are totals to date and do not change by month yet.
        </p>
      )}

      {/* The one stat row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard icon={Briefcase} label="Total applications" value={totalApplications} caption="Submitted by seekers" />
        <StatCard icon={Flag} label="Open reports" value={openReports} caption={`of ${reportRows.length} reports`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card as="section" ariaLabel="Postings by type">
          <CardHeader title="Postings by type" subtitle="Every posting in the moderation queue." />
          <SegmentedBar segments={postingsByType} totalLabel="Total postings" ariaLabel="Postings by type" emptyTitle="No postings yet" />
        </Card>

        <Card as="section" ariaLabel="Verification status">
          <CardHeader title="Verification status" subtitle="Company verification requests by decision." />
          <SegmentedBar segments={verificationByStatus} totalLabel="Total requests" ariaLabel="Verification requests by status" emptyTitle="No verification requests yet" />
        </Card>
      </div>

      <Card as="section" ariaLabel="Reports by reason">
        <CardHeader title="Reports by reason" subtitle="The most common reason is highlighted." />
        {reasonCounts.length === 0 ? (
          <EmptyState icon={BarChart3} title="No reports yet" description="Reports appear here once users flag content." />
        ) : reasonCounts.length === 1 ? (
          <EmptyState icon={BarChart3} title="Not enough variety to chart" description={`All ${reasonCounts[0].count} reports share one reason: ${reasonCounts[0].reason}.`} />
        ) : (
          <HighlightBarChart
            data={reasonCounts.map(({ reason, count }) => ({ label: reason, value: count }))}
            ariaLabel="Reports by reason"
            unit="reports"
          />
        )}
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value, caption }: { icon: typeof Briefcase; label: string; value: number; caption: string }) {
  return (
    <Card className="flex items-center gap-4">
      <IconTile icon={icon} tone="accent" />
      <div className="min-w-0">
        <p className="caption">{label}</p>
        <p className="stat-value">{value.toLocaleString("en-US")}</p>
        <p className="caption">{caption}</p>
      </div>
    </Card>
  );
}
