"use client";

/**
 * Overview (route "/").
 *
 * The page calls getOverview(month) once for the month in the header's selector (?month=YYYY-MM; the default is this month). The
 * service dedupes the in-flight request, so React Strict Mode does not double-fetch, and it is called again when the month or the
 * mock store changes (a target saved in Settings changes a status). There are no automatic retries; the banner's "Try again"
 * re-runs it.
 *
 * Reading order (SEC-149, 2026-11-11, replacing the 4-5 Nov review's programs-first order): the dark "Needs your attention" card
 * first, so the four queues that wait on a decision are on the first screen; then "Team performance" (the month selector beside its
 * heading, how status is judged, the trend and the priorities), which is what the subtitle promises; then the programs in progress and
 * upcoming with the latest activity beside them. Before, a 12-item feed put the attention card about 1,380 px down. Card rows keep
 * their natural heights (a stretched Trend card left a blank band).
 *
 * Team performance (2026-11-11 pass): ONE header row, the heading with the pro-rating note under it on the left and the month on the
 * right (it wraps under on narrow screens). Trend and Priorities share the chosen KPI: clicking a Priorities row shows that KPI in the
 * Trend card, and the Trend is scrolled into view when it is off screen. Below 1025px the cards stack with Priorities first, so the
 * verdict comes before the chart; "See all" scrolls inside the Priorities card instead of
 * growing it, so the programs row never moves; side by side, the Trend chart grows to the row height; the DOM order (Trend, then Priorities) is unchanged for screen readers and the desktop layout. The ten KPI cards were removed in the November 2026 design review:
 * the Priorities panel shows the same judgement against the monthly targets in a compact form ("See all" expands to all ten).
 *
 * Failure handling: a slim banner explains what went wrong, and only the affected sections show "—". Every section keeps its final
 * dimensions while loading, loaded and unavailable, so the layout never jumps.
 */
import { useCallback, useState } from "react";
import type { KpiKey } from "@/config/kpis";
import { BRAND } from "@/config/brand";
import { getOverview, type OverviewIssue } from "@/lib/services/dashboard";
import { useMockStoreVersion } from "@/lib/mock-store";
import { useAsync } from "@/lib/use-async";
import { useMonth } from "@/lib/use-month";
import { MonthSelect } from "@/components/ui/MonthSelect";
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
  // The KPI the Trend card shows; a Priorities row sets it too.
  const [trendKpi, setTrendKpi] = useState<KpiKey>("opportunities_published");
  const showInTrend = useCallback((key: KpiKey) => {
    setTrendKpi(key);
    const trendCard = document.querySelector<HTMLElement>("[data-testid=\"trend-card\"]");
    if (!trendCard) return;
    const { top, bottom } = trendCard.getBoundingClientRect();
    if (top < 0 || bottom > window.innerHeight) {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      trendCard.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    }
  }, []);

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

        <NeedsAttentionCard counts={data?.attention ?? null} loading={loading} notConnected={notConnected} />

        {/* Team performance: one header row. The heading and how status is judged on the left, the month it drives on the right. */}
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pt-4">
          <div className="min-w-0 space-y-1">
            <h2 className="card-title">Team performance</h2>
            <ProRatingNote month={data?.month ?? month} isPast={data?.isPast ?? false} loading={loading} />
          </div>
          <MonthSelect />
        </div>

        <div className="grid grid-cols-1 items-start gap-4 min-[1025px]:grid-cols-3 min-[1025px]:items-stretch">
          <TrendCard trend={data?.trend ?? null} kpi={trendKpi} onKpiChange={setTrendKpi} loading={loading} notConnected={notConnected} className="min-[1025px]:col-span-2" />
          <PrioritiesCard cards={data?.kpis ?? null} loading={loading} isPast={data?.isPast ?? false} notConnected={notConnected} selectedKpi={trendKpi} onSelectKpi={showInTrend} className="max-[1024px]:order-first" />
        </div>

        {/* The programs card sets this row's height; Recent activity takes it (contain: size) and scrolls inside, so it is never the taller card. */}
        <div className="grid grid-cols-1 items-start gap-4 pt-2 min-[1025px]:grid-cols-3 min-[1025px]:items-stretch">
          <UpcomingProgramsCard programs={data?.programs ?? null} loading={loading} notConnected={notConnected} className="min-[1025px]:col-span-2" />
          <RecentActivityCard items={data?.activity ?? null} loading={loading} notConnected={notConnected} className="min-[1025px]:min-h-80 min-[1025px]:[contain:size]" />
        </div>

      </div>

      <PageFooter crumbs={[BRAND.sub, "Overview"]} />
    </div>
  );
}
