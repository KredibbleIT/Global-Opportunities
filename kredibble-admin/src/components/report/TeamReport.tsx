"use client";

/**
 * TeamReport: the INTERNAL report ("Internal. Not for partners."), laid out like the partner report: on screen just the cards (the title block and the footer
 * belong to the printed sheet), two across on a wide screen (5fr / 7fr), then the full-width cards.
 *
 *   One line saying it is internal, then the four cards in the partner report's grid:
 *     Network: size, active ambassadors and the activity rate; the top five ambassadors of the month's leaderboard
 *     Key figures: the ten KPIs with their target, value and status (the Overview's cards; Active ambassadors is a running total, judged against the full target)
 *     Partner pipeline: the pipeline health gauge of Partners
 *     Database: the verification pace gauge and the records verified in the month by source (the Database page's card)
 *   Then, each across the full width:
 *     Social: posts, reach and engagement against their targets
 *     Team scoreboard: EXACTLY the Team scorecard for the month (the same component, not recalculated): the grace period ("Scores start on day 5"),
 *     "300%+", "Highest/Lowest" when everyone owns only on-target metrics, and people with no metrics under "No metrics assigned"
 *
 * A month with no figures shows the same cards with zeros and a neutral note. Props: data (null while loading: a skeleton), month, toDate (the current
 * month: "Month to date"), sample (sample figures: "Sample report" on the paper)
 */
import { PipelineHealthCard } from "@/components/partners/PipelineHealthCard";
import { RecordsPaceCard } from "@/components/database/RecordsPaceCard";
import { StatusChip, TargetBar } from "@/components/kpi/KpiStatus";
import { Scorecard } from "@/components/scorecard/Scorecard";
import { MiniStat } from "@/components/ui/MiniStat";
import { KPIS } from "@/config/kpis";
import { formatMonth } from "@/lib/format";
import { isPastMonth } from "@/lib/kpi";
import type { MonthKey } from "@/lib/mock-entities";
import { pluralize } from "@/lib/plural";
import type { TeamReportData } from "@/lib/report";
import { PartnerReportSkeleton, ReportCard, TableScroll } from "./PartnerReport";
import { ReportPaper } from "./ReportPaper";

const format = (value: number) => value.toLocaleString("en-US");

// The gauges are cards of their own on their own pages. Inside a report card they lose that frame, so a card never sits inside a card.
const UNFRAMED = "[&_.card-surface]:rounded-none [&_.card-surface]:border-0 [&_.card-surface]:p-0 [&_.card-surface]:shadow-none";

export function TeamReport({ data, month, toDate, sample }: { data: TeamReportData | null; month: MonthKey; toDate: boolean; sample: boolean }) {
  if (!data) return <PartnerReportSkeleton />;
  const rate = data.network.activityRate;
  return (
    <ReportPaper testId="team-report" title="Team report" month={month} toDate={toDate} sample={sample} note="Internal. Not for partners." wide>
      {data.kpis.every((card) => card.value === 0) && (
        <p data-testid="report-empty" className="caption rounded-control bg-surface-2 px-3 py-2">
          No figures were recorded for {formatMonth(month)}.
        </p>
      )}
      <div data-testid="team-cards">
        <h3 className="sr-only">Team overview</h3>
        {/* The header with the title is for the printed sheet; on screen this line says the report is internal. */}
        <p data-testid="team-internal-note" className="caption mb-3 print:hidden">
          Internal. Not for partners. The ten KPIs are judged against their monthly targets.
        </p>
        <div className="grid grid-cols-1 gap-5 min-[1024px]:grid-cols-[5fr_7fr] print:grid-cols-[5fr_7fr]">
          <ReportCard title="Network" subtitle="Ambassadors and who is leading this month" testId="team-network">
            <div className="grid gap-2 min-[640px]:grid-cols-3 print:grid-cols-3 min-[1024px]:grid-cols-1 min-[1280px]:grid-cols-3">
              <MiniStat compact value={data.network.size} label="Network size" caption="All statuses" />
              <MiniStat compact value={data.network.active} label="Active ambassadors" />
              <MiniStat compact value={rate === null ? "—" : `${Math.round(rate * 100)}%`} label="Activity rate" caption="Active ambassadors who shared this month" />
            </div>
            {data.top.length > 0 ? (
              <ol data-testid="top-five" className="mt-4 divide-y divide-line">
                {data.top.map((row) => (
                  <li key={row.ambassador.id} data-testid="top-row" className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2 print:py-1">
                    <span className="table-text font-semibold text-ink">
                      {row.rank}. {row.ambassador.name}
                    </span>
                    <span className="caption tabular-nums">
                      {pluralize(row.signups, "verified signup")} · {pluralize(row.clicks, "referred click")} · {pluralize(row.shares, "share")}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p data-testid="top-none" className="caption mt-4">
                No ambassador has activity in {formatMonth(month)} yet.
              </p>
            )}
          </ReportCard>

          <ReportCard title="Key figures" subtitle="The ten KPIs against their monthly targets" testId="team-kpis">
            {/* On narrow phones the table's minimum content can exceed the card: it scrolls inside it (never in print). */}
            <TableScroll>
              <table data-testid="kpi-table" className="w-full text-left">
                <caption className="sr-only">The ten KPIs with target, value and status</caption>
                <thead>
                  <tr className="table-head bg-surface-2">
                    <th scope="col" className="rounded-l-control px-3 py-2">KPI</th>
                    <th scope="col" className="px-3 py-2 text-right">Value</th>
                    <th scope="col" className="px-3 py-2 text-right">Target</th>
                    <th scope="col" className="rounded-r-control px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.kpis.map((card) => (
                    <tr key={card.key} data-testid={`team-kpi-${card.key}`}>
                      <td className="table-text px-3 py-2 font-semibold print:py-1">{KPIS[card.key].label}</td>
                      <td data-testid="team-kpi-value" className="table-text px-3 py-2 text-right tabular-nums print:py-1">{card.value === null ? "—" : format(card.value)}</td>
                      <td className="table-text px-3 py-2 text-right tabular-nums print:py-1">{card.target ? format(card.target) : "—"}</td>
                      <td className="px-3 py-2 print:py-1">
                        {/* The verdict, and the share of the monthly target as a bar BELOW it. */}
                        <div className="flex w-28 flex-col gap-1.5">
                          <StatusChip status={card.status} />
                          <TargetBar card={card} label={KPIS[card.key].label} showPace={false} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </ReportCard>

          <ReportCard title="Partner pipeline" subtitle="Is the open pipeline big enough for the Partners onboarded target?" testId="team-pipeline" className={UNFRAMED}>
            <PipelineHealthCard health={data.pipeline} target={data.pipelineTarget} standalone />
          </ReportCard>

          <ReportCard title="Database" subtitle="Verification pace this month and the records verified by source" testId="team-database" className={UNFRAMED}>
            <RecordsPaceCard pace={data.pace} sources={data.sources} />
          </ReportCard>
        </div>
      </div>

      <ReportCard title="Social" subtitle={`Posts published in ${formatMonth(month)}`} testId="team-social">
        <div className="grid gap-2 min-[640px]:grid-cols-3 print:grid-cols-3">
          <MiniStat compact value={data.social.posts} label="Posts" caption={`Target ${format(data.social.targets.posts)}`} />
          <MiniStat compact value={data.social.reach} label="Reach" caption={`Target ${format(data.social.targets.reach)}`} />
          <MiniStat compact value={data.social.engagement} label="Engagement" caption={`Target ${format(data.social.targets.engagement)}`} />
        </div>
      </ReportCard>

      <ReportCard title="Team scoreboard" subtitle="As on the Team scorecard for this month" testId="team-scoreboard" className={UNFRAMED}>
        <Scorecard scope="team" month={month} people={data.people} tooEarly={data.tooEarly} isPast={isPastMonth(month)} />
      </ReportCard>
    </ReportPaper>
  );
}
