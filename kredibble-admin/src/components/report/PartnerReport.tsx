"use client";

/**
 * PartnerReport: the report prepared for partners. AGGREGATE ONLY: no staff name, no person's figures, no ambassador name and no scoreboard anywhere in it.
 *
 *   Progress report · <month>   (orange-to-purple rule)
 *   Performance overview: one line on what the percentages are compared with; ten figures in the Overview's card design (label, figure,
 *   change since the previous month) — nothing else (November 2026 review)
 *   Website and app views: "Monthly views by platform", two bars per month (Website, App) with a legend; "No data" where app analytics
 *   are not tracked — never a zero bar
 *   Channel performance: Channel, Posts, Reach, Engagement (sorted by reach); hidden, with a neutral note, when the month has no post
 *
 * The figures come from lib/report.ts (the same functions as the Overview, the lists and Social). A month with no data shows the paper with zeros and a neutral note.
 *
 * Props: data (null while loading: a skeleton in the paper's shape), month, toDate (the current month: "Month to date")
 */
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { GroupedBarChart } from "@/components/ui/GroupedBarChart";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { formatMonth } from "@/lib/format";
import type { MonthKey } from "@/lib/mock-entities";
import { isEmptyMonth, previousMonthLabel, type Delta } from "@/lib/report";
import type { PartnerReportData } from "@/lib/services/report";
import { ReportPaper, ReportSection } from "./ReportPaper";

const format = (value: number) => value.toLocaleString("en-US");

/** The change since the previous month: an arrow AND words (colour is never the only signal). */
function DeltaText({ delta }: { delta: Delta }) {
  const Icon = delta.kind === "up" ? ArrowUp : delta.kind === "down" ? ArrowDown : delta.kind === "flat" ? Minus : null;
  return (
    <p data-testid="metric-delta" data-kind={delta.kind} className={cn("flex items-start gap-1 text-xs font-semibold leading-4", delta.kind === "up" ? "text-success" : delta.kind === "down" ? "text-danger" : "text-muted")}>
      {Icon && <Icon size={12} strokeWidth={2.25} aria-hidden="true" className="mt-0.5 shrink-0" />}
      <span>{delta.text}</span>
    </p>
  );
}

export function PartnerReportSkeleton() {
  return (
    <div data-testid="report-skeleton" aria-busy="true" aria-label="Loading the report" className="report-paper space-y-6 p-4 min-[640px]:p-10">
      <div className="space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-1 w-full rounded-pill" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 min-[640px]:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-control" />
        ))}
      </div>
      <Skeleton className="h-chart w-full rounded-control" />
    </div>
  );
}

export function PartnerReport({ data, month, toDate }: { data: PartnerReportData | null; month: MonthKey; toDate: boolean }) {
  if (!data) return <PartnerReportSkeleton />;
  const previous = previousMonthLabel(month);
  const empty = isEmptyMonth(data.metrics);
  // The one line under "Performance overview": what the percentages are compared with (an estimate for a month still running).
  const comparedWith = toDate ? `the same period last month (${previous}), estimated` : previous;
  return (
    <ReportPaper testId="partner-report" title="Progress report" month={month} toDate={toDate}>
      {empty && (
        <p data-testid="report-empty" className="caption rounded-control bg-surface-2 px-3 py-2">
          No figures were recorded for {formatMonth(month)}.
        </p>
      )}
      <ReportSection title="Performance overview" subtitle={`Percentage changes are compared with ${comparedWith}.`} testId="report-metrics">
        <div className="grid grid-cols-2 gap-3 min-[640px]:grid-cols-5">
          {data.metrics.map((metric) => (
            <div key={metric.id} data-testid={`metric-${metric.id}`} className="report-cell card-surface flex h-full flex-col overflow-hidden">
              <div className="flex flex-1 flex-col gap-1 bg-surface-2 p-3">
                <p className="kpi-label">{metric.label}</p>
                <p data-testid="metric-value" className="ministat-value">
                  {format(metric.value)}
                </p>
              </div>
              <div className="bg-white p-3">
                <DeltaText delta={metric.delta} />
              </div>
            </div>
          ))}
        </div>
      </ReportSection>
      <ReportSection title="Website and app views" subtitle="Monthly views by platform" testId="report-audience">
        {data.audience.length >= 2 ? (
          <GroupedBarChart data={data.audience} ariaLabel={`Views by platform, last ${data.audience.length} months`} unit="views" />
        ) : (
          <p data-testid="audience-none" className="caption">
            There are not enough months of views figures to chart yet.
          </p>
        )}
      </ReportSection>
      {data.channels.length > 0 ? (
        <ReportSection title="Channel performance" subtitle="From the social posts published this month, the channel with the most reach first" testId="report-channels">
          {/* On narrow phones the table's minimum content can exceed the paper: contain it here (never in print). */}
          <div className="overflow-x-auto print:overflow-visible">
          <table data-testid="channel-table" className="w-full text-left">
            <caption className="sr-only">Posts, reach and engagement by channel</caption>
            <thead>
              <tr className="table-head">
                <th scope="col" className="py-2 pr-3">Channel</th>
                <th scope="col" className="px-3 py-2 text-right">Posts</th>
                <th scope="col" className="px-3 py-2 text-right">Reach</th>
                <th scope="col" className="py-2 pl-3 text-right">Engagement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.channels.map((row) => (
                <tr key={row.platform} data-testid="channel-row">
                  <td className="table-text py-2 pr-3 font-semibold">{row.label}</td>
                  <td className="table-text px-3 py-2 text-right tabular-nums">{format(row.posts)}</td>
                  <td className="table-text px-3 py-2 text-right tabular-nums">{format(row.reach)}</td>
                  <td className="table-text py-2 pl-3 text-right tabular-nums">{format(row.engagement)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </ReportSection>
      ) : (
        <p data-testid="channels-none" className="caption">
          No posts were published in {formatMonth(month)}, so there is no channel table.
        </p>
      )}
    </ReportPaper>
  );
}
