"use client";

/**
 * Overview (route "/").
 *
 * The page calls getOverview(month) once for the month in the header's selector (?month=YYYY-MM; the default is this month). The
 * service dedupes the in-flight request, so React Strict Mode does not double-fetch, and it is called again when the month or the
 * mock store changes (a target saved in Settings changes a status). There are no automatic retries; the banner's "Try again"
 * re-runs it.
 *
 * Reading order: the programs in progress and upcoming (with the latest activity beside them), the dark "Needs your attention" card,
 * how status is judged, the trend and the priorities. The ten KPI cards were removed in the November 2026 design review: the Priorities
 * panel shows the same judgement against the monthly targets in a compact form ("See all" expands to all ten).
 *
 * Failure handling: a slim banner explains what went wrong, and only the affected sections show "—". Every section keeps its final
 * dimensions while loading, loaded and unavailable, so the layout never jumps.
 */
import { useCallback } from "react";
import { BRAND } from "@/config/brand";
import { getOverview, type OverviewIssue } from "@/lib/services/dashboard";
import { useMockStoreVersion } from "@/lib/mock-store";
import { useAsync } from "@/lib/use-async";
import { useMonth } from "@/lib/use-month";
import { NotConnectedNotice } from "@/components/ui/NotConnectedNotice";
import { PageFooter } from "@/components/ui/PageFooter";
import { NeedsAttentionCard } from "@/components/overview/NeedsAttentionCard";
import { OverviewHeader } from "@/components/overview/OverviewHeader";
import { PrioritiesCard } from "@/components/overview/PrioritiesCard";
import { ProRatingNote } from "@/components/overview/ProRatingNote";
import { RecentActivityCard } from "@/components/overview/RecentActivityCard";
import { StatusBanner } from "@/components/overview/StatusBanner";
import { TrendCard } from "@/components/overview/TrendCard";
import { UpcomingProgramsCard } from "@/components/overview/UpcomingProgramsCard";

export default function DashboardHomePage() {
  const { month } = useMonth();
  const version = useMockStoreVersion();
  // A new function (so useAsync loads again) when the month or the store changes; the data stays on screen until the new one arrives.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(() => getOverview(month), [month, version]);
  const overview = useAsync(load);
  const loading = overview.isLoading;
  const notConnected = overview.data?.data.notConnected ?? false;
  const data = overview.data?.data ?? null; // null while loading, or if getOverview itself failed unexpectedly

  // getOverview() resolves with an `issue` for expected failures; a thrown error is the unexpected case.
  const issue: OverviewIssue | null = overview.data?.issue ?? (overview.error ? { kind: "failed", message: overview.error.message } : null);

  return (
    <div className="space-y-8">
      <OverviewHeader />

      {/* 16px between every block */}
      <div className="space-y-4">
        {notConnected && !loading && (
          <NotConnectedNotice message="Monthly figures aren't connected to live data yet. The queue counts below are live." />
        )}

        {issue && !loading && <StatusBanner issue={issue} onRetry={overview.reload} />}

        <div className="grid grid-cols-1 items-start gap-4 min-[1025px]:grid-cols-3">
          <UpcomingProgramsCard programs={data?.programs ?? null} loading={loading} notConnected={notConnected} className="min-[1025px]:col-span-2" />
          <RecentActivityCard items={data?.activity ?? null} loading={loading} notConnected={notConnected} />
        </div>

        <NeedsAttentionCard counts={data?.attention ?? null} loading={loading} notConnected={notConnected} />

        <ProRatingNote month={data?.month ?? month} isPast={data?.isPast ?? false} loading={loading} />

        <div className="grid grid-cols-1 items-start gap-4 min-[1025px]:grid-cols-3">
          <TrendCard trend={data?.trend ?? null} loading={loading} notConnected={notConnected} className="min-[1025px]:col-span-2" />
          <PrioritiesCard cards={data?.kpis ?? null} loading={loading} isPast={data?.isPast ?? false} notConnected={notConnected} />
        </div>

      </div>

      <PageFooter crumbs={[BRAND.sub, "Overview"]} />
    </div>
  );
}
