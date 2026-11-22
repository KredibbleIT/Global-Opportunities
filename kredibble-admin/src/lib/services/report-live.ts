/**
 * The monthly report from the real API (mock mode off): what the Partner and Team templates show, read from the server instead of the sample store.
 *
 * - Partner report: GET /admin/reports/partner (the ten figures with their change since the previous month, and the website views of the
 *   last six months) and its channels (reach, posts and engagement per platform).
 * - Team report: GET /admin/reports/team (the ten KPI cards, the partner pipeline, the records by source, the team scoreboard) together with
 *   the same loaders the Database, Network, Leaderboard and Social pages use, so this report and those pages always show the same numbers.
 *
 * A month with no records comes back as zeros, never as sample figures. A failed request is an error the page shows with "Try again".
 */
import {
  getBeneficiariesPaceApi,
  getPartnerReportApi,
  getTeamReportApi,
  type PartnerReportMetricRecord,
} from "@/lib/api";
import { POST_PLATFORM_LABELS, RECORD_SOURCES, RECORD_SOURCE_LABELS, type MonthKey, type PostPlatform, type RecordSource } from "@/lib/mock-entities";
import { earliestMonth, isMonthToDate, type PartnerMetric, type PartnerMetricId, type TeamReportData } from "@/lib/report";
import { loadLeaderboard, loadNetworkSummary } from "@/lib/services/network";
import { loadMonthSocialTotals, type PlatformRow } from "@/lib/services/social";
import type { KpiCardData } from "@/lib/services/dashboard-types";
import type { PipelineHealth } from "@/lib/pipeline-health";
import type { RecordsPace, SourceCount } from "@/lib/services/database";
import type { ScorecardPerson } from "@/lib/scorecard";
import type { AudiencePoint, PartnerReportData } from "./report";

const METRIC_IDS: PartnerMetricId[] = [
  "website_views", "daily_first_visits", "daily_visitors", "social_reach", "social_engagement", "posts_published",
  "new_ambassadors", "new_partners", "opportunities_published", "programs_organised",
];

/** "Oct" and "October 2026" for the audience chart. */
const shortMonth = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
const longMonth = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/** The word the report shows for a platform; a platform the desk has no label for keeps its own name. */
const platformLabel = (platform: string) => POST_PLATFORM_LABELS[platform as PostPlatform] ?? platform;

const toMetric = (record: PartnerReportMetricRecord, month: MonthKey): PartnerMetric => ({
  id: record.id as PartnerMetricId,
  // Not the server's longer wording ("Daily first visits (sum)"): the cards use the short names of the design.
  label: record.label.replace(/ \(sum\)$/, ""),
  value: record.value,
  previous: record.previous,
  // In the month still running the server compares with the same days of the month before, worked out from a full month: an estimate.
  estimated: isMonthToDate(month) && record.previous !== null,
  delta: record.delta,
});

/** The partner report of a month, from the API. */
export async function livePartnerReport(month: MonthKey): Promise<PartnerReportData> {
  const report = await getPartnerReportApi(month);
  const byId = new Map(report.metrics.map((metric) => [metric.id, metric]));
  // Always the ten figures, in the design's order; one the server did not send is a 0 with no comparison, never a made-up number.
  const metrics = METRIC_IDS.map((id): PartnerMetric =>
    toMetric(byId.get(id) ?? { id, label: id, value: 0, previous: null, delta: { kind: "none", text: "—", percent: null }, description: "" }, month),
  );
  const trend = report.audienceTrend ?? report.trend ?? [];
  const audience: AudiencePoint[] = trend
    .filter((point) => point.month >= earliestMonth())
    .map((point) => ({
      month: point.month as MonthKey,
      label: isMonthToDate(point.month as MonthKey) ? `${shortMonth(point.month)} to date` : shortMonth(point.month),
      tooltipLabel: isMonthToDate(point.month as MonthKey) ? `${longMonth(point.month)} to date` : longMonth(point.month),
      website: point.value,
      app: null, // the website's analytics do not report app views: "No data"
    }));
  const channels: PlatformRow[] = (report.channels ?? [])
    .map((row) => ({ platform: row.platform as PostPlatform, label: platformLabel(row.platform), posts: row.posts, reach: row.reach, engagement: row.engagement }))
    .sort((a, b) => b.reach - a.reach || b.posts - a.posts || a.label.localeCompare(b.label));
  return { month, metrics, audience, channels };
}

const toSource = (row: { sourceType: string; count: number }): SourceCount => {
  const source = (RECORD_SOURCES as readonly string[]).includes(row.sourceType) ? (row.sourceType as RecordSource) : "organic";
  return { source, label: RECORD_SOURCE_LABELS[source], count: row.count };
};

/** The team report of a month, from the API. */
export async function liveTeamReport(month: MonthKey): Promise<TeamReportData> {
  const [report, pace, network, leaderboard, social] = await Promise.all([
    getTeamReportApi(month),
    getBeneficiariesPaceApi(month),
    loadNetworkSummary(month),
    loadLeaderboard(month),
    loadMonthSocialTotals(month),
  ]);
  // Every source appears, in the order of the legend, with 0 for one that brought nobody in the month.
  const sources = RECORD_SOURCES.map((source) => {
    const found = report.sources.map(toSource).filter((row) => row.source === source).reduce((sum, row) => sum + row.count, 0);
    return { source, label: RECORD_SOURCE_LABELS[source], count: found };
  });
  return {
    month,
    kpis: report.kpis as KpiCardData[],
    pipeline: report.pipeline as PipelineHealth,
    pipelineTarget: report.pipelineTarget,
    pace: pace as unknown as RecordsPace,
    sources,
    network,
    top: leaderboard.slice(0, 5),
    social,
    people: report.people as ScorecardPerson[],
    tooEarly: report.tooEarly,
  };
}
