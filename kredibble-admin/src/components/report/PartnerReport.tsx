"use client";

/**
 * PartnerReport: the report prepared for partners. AGGREGATE ONLY: no staff name, no person's figures, no ambassador name and no scoreboard anywhere in it.
 *
 *   Progress report · <month>   (orange-to-purple rule)
 *   One line on what the percentages are compared with, then the ten figures (label, figure, change since the previous month) in four cards,
 *   two across on a wide screen (the layout of the design review):
 *     Website & app: the website views and a Metric / Website / App table (views, daily first visits, daily visitors); a dash where the app is not tracked
 *     Social media performance: reach, engagement and posts published, then Channel, Reach (with a bar), Posts, Engagement sorted by reach;
 *       a neutral note instead of the table when the month has no post
 *     Programs: programs organised, opportunities published and the upcoming programs ("Not available" until they are tracked)
 *     Network: Group, Total, New this month for the ambassadors and the partners (a dash where there is no total yet)
 *   Website and app views: "Monthly views by platform", two bars per month (Website, App) with a legend; "No data" where app analytics
 *   are not tracked — never a zero bar
 *
 * The figures come from lib/report.ts (the same functions as the Overview, the lists and Social). A month with no data shows the paper with zeros and a neutral note.
 *
 * Props: data (null while loading: a skeleton in the paper's shape), month, toDate (the current month: "Month to date"), sample (sample figures: the
 * paper shows "Sample report", on screen and in the PDF)
 */
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, CalendarDays, FileText, Handshake, Laptop, Layers, MessageCircle, Minus, Users, type LucideIcon } from "lucide-react";
import { GroupedBarChart } from "@/components/ui/GroupedBarChart";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { formatMonth } from "@/lib/format";
import type { MonthKey } from "@/lib/mock-entities";
import { DAILY_FIGURES_DEFINITION, comparisonLine, isEmptyMonth, type Delta, type PartnerMetric, type PartnerMetricId } from "@/lib/report";
import type { PartnerReportData } from "@/lib/services/report";
import { ReportPaper } from "./ReportPaper";

const format = (value: number) => value.toLocaleString("en-US");

/** The change since the previous month: an arrow AND words (colour is never the only signal); "(est.)" when compared with an estimate. */
function DeltaText({ delta, estimated }: { delta: Delta; estimated: boolean }) {
  const Icon = delta.kind === "up" ? ArrowUp : delta.kind === "down" ? ArrowDown : delta.kind === "flat" ? Minus : null;
  return (
    <p data-testid="metric-delta" data-kind={delta.kind} className={cn("flex items-start gap-1 text-xs font-semibold leading-4", delta.kind === "up" ? "text-success" : delta.kind === "down" ? "text-danger" : "text-muted")}>
      {Icon && <Icon size={12} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0" />}
      <span>
        {delta.text}
        {estimated && delta.percent !== null && <span className="font-normal"> (est.)</span>}
      </span>
    </p>
  );
}

export function PartnerReportSkeleton() {
  return (
    <div data-testid="report-skeleton" aria-busy="true" aria-label="Loading the report" className="report-paper report-paper--wide space-y-5">
      <Skeleton className="h-4 w-80 max-w-full" />
      <div className="grid grid-cols-1 gap-5 min-[1024px]:grid-cols-[5fr_7fr]">
        <Skeleton className="h-72 rounded-card" />
        <Skeleton className="h-72 rounded-card" />
        <Skeleton className="h-64 rounded-card" />
        <Skeleton className="h-64 rounded-card" />
      </div>
      <Skeleton className="h-chart w-full rounded-control" />
    </div>
  );
}

/** A card of the report: a title and what is inside it. Never split across two printed pages. `className` is for layout (a card that spans both columns). */
export function ReportCard({ title, subtitle, children, testId, className }: { title: string; subtitle?: string; children: ReactNode; testId?: string; className?: string }) {
  return (
    <section data-testid={testId} aria-label={title} className={cn("report-section card-surface min-w-0 p-5", className)}>
      <h3 className="font-display text-xl font-semibold leading-7 text-ink">{title}</h3>
      {subtitle && <p className="caption mt-1">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** An icon in a soft square, as in the design. */
function IconTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-control bg-surface-2 text-muted">
      <Icon size={18} strokeWidth={1.5} />
    </span>
  );
}

/** One of the ten figures as a big number: its label, the figure and the change since the previous month. */
function Stat({ metric, icon }: { metric: PartnerMetric; icon: LucideIcon }) {
  return (
    <div data-testid={`metric-${metric.id}`} className="report-cell flex min-w-0 items-center gap-3">
      <IconTile icon={icon} />
      <div className="min-w-0">
        <p className="kpi-label">{metric.label}</p>
        <p data-testid="metric-value" className="font-display text-2xl font-semibold leading-8 tabular-nums text-ink">
          {format(metric.value)}
        </p>
        <DeltaText delta={metric.delta} estimated={metric.estimated} />
      </div>
    </div>
  );
}

/** A figure in a row of its own: icon, label with the change, and the number on the right. */
function StatRow({ metric, icon }: { metric: PartnerMetric; icon: LucideIcon }) {
  return (
    <div data-testid={`metric-${metric.id}`} className="report-cell flex items-center gap-3 rounded-control border border-line p-3">
      <IconTile icon={icon} />
      <div className="min-w-0 flex-1">
        <p className="kpi-label">{metric.label}</p>
        <DeltaText delta={metric.delta} estimated={metric.estimated} />
      </div>
      <p data-testid="metric-value" className="font-display text-xl font-semibold tabular-nums text-ink">
        {format(metric.value)}
      </p>
    </div>
  );
}

/** A table that scrolls sideways inside its card on a narrow phone, and never in print. */
export function TableScroll({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto print:overflow-visible">{children}</div>;
}

const NONE = "—";

export function PartnerReport({ data, month, toDate, sample }: { data: PartnerReportData | null; month: MonthKey; toDate: boolean; sample: boolean }) {
  if (!data) return <PartnerReportSkeleton />;
  const empty = isEmptyMonth(data.metrics);
  // The one line above the cards: what the percentages are compared with (an estimate for a month still running).
  const comparedWith = comparisonLine(month);
  const metric = (id: PartnerMetricId): PartnerMetric => data.metrics.find((entry) => entry.id === id)!;
  // App views of the report month (null: app analytics are not tracked, shown as the dash).
  const appViews = data.audience.find((point) => point.month === month)?.app ?? null;
  const topReach = Math.max(1, ...data.channels.map((row) => row.reach));
  const dailyRows: PartnerMetricId[] = ["daily_first_visits", "daily_visitors"];
  const networkRows: { id: PartnerMetricId; label: string; icon: LucideIcon }[] = [
    { id: "new_ambassadors", label: "Ambassadors", icon: Users },
    { id: "new_partners", label: "Partners", icon: Handshake },
  ];
  return (
    <ReportPaper testId="partner-report" title="Progress report" month={month} toDate={toDate} sample={sample} wide>
      {empty && (
        <p data-testid="report-empty" className="caption rounded-control bg-surface-2 px-3 py-2">
          No figures were recorded for {formatMonth(month)}.
        </p>
      )}
      <div data-testid="report-metrics">
        <h3 className="sr-only">Performance overview</h3>
        <p className="caption mb-3">{comparedWith}</p>
        <div className="grid grid-cols-1 gap-5 min-[1024px]:grid-cols-[5fr_7fr] print:grid-cols-[5fr_7fr]">
          <ReportCard title="Website & app" testId="report-website">
            <Stat metric={metric("website_views")} icon={Laptop} />
            <TableScroll>
              <table data-testid="website-table" className="mt-5 w-full text-left">
                <caption className="sr-only">Website and app figures</caption>
                <thead>
                  <tr className="table-head bg-surface-2">
                    <th scope="col" className="rounded-l-control px-3 py-2">Metric</th>
                    <th scope="col" className="px-3 py-2 text-right">Website</th>
                    <th scope="col" className="rounded-r-control px-3 py-2 text-right">App</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  <tr>
                    <td className="table-text px-3 py-2">Views</td>
                    <td className="table-text px-3 py-2 text-right tabular-nums">{format(metric("website_views").value)}</td>
                    <td data-testid="app-views" className="table-text px-3 py-2 text-right tabular-nums">{appViews === null ? NONE : format(appViews)}</td>
                  </tr>
                  {dailyRows.map((id) => {
                    const entry = metric(id);
                    return (
                      <tr key={id} data-testid={`metric-${id}`}>
                        <td className="table-text px-3 py-2">{entry.label}</td>
                        <td className="table-text px-3 py-2 tabular-nums">
                          <div className="flex flex-col items-end">
                            <span data-testid="metric-value">{format(entry.value)}</span>
                            <DeltaText delta={entry.delta} estimated={entry.estimated} />
                          </div>
                        </td>
                        <td className="table-text px-3 py-2 text-right text-muted">{NONE}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>
            <p data-testid="daily-definition" className="caption mt-3">
              {DAILY_FIGURES_DEFINITION}
            </p>
          </ReportCard>

          <ReportCard title="Social media performance" testId="report-channels">
            <div className="grid grid-cols-1 gap-4 min-[640px]:grid-cols-3 print:grid-cols-3">
              <Stat metric={metric("social_reach")} icon={Users} />
              <Stat metric={metric("social_engagement")} icon={MessageCircle} />
              <Stat metric={metric("posts_published")} icon={FileText} />
            </div>
            {data.channels.length > 0 ? (
              <>
                <TableScroll>
                  <table data-testid="channel-table" className="mt-5 w-full text-left">
                    <caption className="sr-only">Reach, posts and engagement by channel</caption>
                    <thead>
                      <tr className="table-head bg-surface-2">
                        <th scope="col" className="rounded-l-control px-3 py-2">Channel</th>
                        <th scope="col" className="px-3 py-2">Reach</th>
                        <th scope="col" className="px-3 py-2 text-right">Posts</th>
                        <th scope="col" className="rounded-r-control px-3 py-2 text-right">Engagement</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.channels.map((row) => (
                        <tr key={row.platform} data-testid="channel-row">
                          <td className="table-text px-3 py-2 font-semibold">{row.label}</td>
                          <td className="table-text px-3 py-2">
                            <div className="flex items-center gap-3">
                              <span aria-hidden="true" className="hidden h-2.5 min-w-8 flex-1 min-[640px]:block print:block">
                                <span className="block h-full rounded-pill bg-purple-500" style={{ width: `${Math.max(4, Math.round((row.reach / topReach) * 100))}%` }} />
                              </span>
                              <span className="ml-auto tabular-nums">{format(row.reach)}</span>
                            </div>
                          </td>
                          <td className="table-text px-3 py-2 text-right tabular-nums">{format(row.posts)}</td>
                          <td className="table-text px-3 py-2 text-right tabular-nums">{format(row.engagement)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScroll>
                <p className="caption mt-3">Reach may include the same person across platforms.</p>
              </>
            ) : (
              <p data-testid="channels-none" className="caption mt-5">
                No posts were published in {formatMonth(month)}, so there is no channel table.
              </p>
            )}
          </ReportCard>

          <ReportCard title="Programs" testId="report-programs">
            <div className="space-y-3">
              <StatRow metric={metric("programs_organised")} icon={Layers} />
              <StatRow metric={metric("opportunities_published")} icon={FileText} />
              <div data-testid="upcoming-programs" className="report-cell flex items-center gap-3 rounded-control border border-line p-3">
                <IconTile icon={CalendarDays} />
                <div className="min-w-0 flex-1">
                  <p className="kpi-label">Upcoming programs</p>
                  <p className="caption">Not available</p>
                </div>
                <p className="font-display text-2xl font-semibold text-muted">{NONE}</p>
              </div>
            </div>
          </ReportCard>

          <ReportCard title="Network" testId="report-network">
            <TableScroll>
              <table data-testid="network-table" className="w-full text-left">
                <caption className="sr-only">Ambassadors and partners</caption>
                <thead>
                  <tr className="table-head bg-surface-2">
                    <th scope="col" className="rounded-l-control px-3 py-2">Network group</th>
                    <th scope="col" className="px-3 py-2 text-right">Total</th>
                    <th scope="col" className="rounded-r-control px-3 py-2 text-right">{toDate ? "New this month" : "New in the month"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {networkRows.map((row) => {
                    const entry = metric(row.id);
                    return (
                      <tr key={row.id} data-testid={`metric-${row.id}`}>
                        <td className="table-text px-3 py-3">
                          <span className="flex items-center gap-3">
                            <IconTile icon={row.icon} />
                            <span className="font-semibold">{row.label}</span>
                            <span className="sr-only">{entry.label}</span>
                          </span>
                        </td>
                        <td className="table-text px-3 py-3 text-right text-muted">{NONE}</td>
                        <td className="table-text px-3 py-3 tabular-nums">
                          <div className="flex flex-col items-end">
                            <span data-testid="metric-value" className="font-display text-xl font-semibold text-purple-700">{format(entry.value)}</span>
                            <DeltaText delta={entry.delta} estimated={entry.estimated} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>
          </ReportCard>
        </div>
      </div>
      <ReportCard title="Website and app views" subtitle="Monthly views by platform" testId="report-audience">
        {data.audience.length >= 2 ? (
          <GroupedBarChart data={data.audience} ariaLabel={`Views by platform, last ${data.audience.length} months`} unit="views" />
        ) : (
          <p data-testid="audience-none" className="caption">
            There are not enough months of views figures to chart yet.
          </p>
        )}
      </ReportCard>
    </ReportPaper>
  );
}
