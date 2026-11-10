/**
 * Monthly report maths (/monthly-report): pure functions over the desk's data. Nothing here renders or loads anything, and nothing is calculated a second
 * way: every figure comes from the functions the other screens use (kpiValue, kpiTarget and the dated thresholds, newInMonth, pipelineHealth, recordsPace,
 * the leaderboard ranking, the scorecard composite), so a report always agrees with the Overview, the lists and Social for the same month.
 *
 * Two reports, two audiences:
 * - PARTNER report: aggregate only (ten headline figures with their change, the views by platform, the channels). No person appears in it.
 * - TEAM report (internal): the ten KPIs against their targets, pipeline health, database pace, records by source, the network, the top five ambassadors,
 *   social totals and the team scoreboard of the Scorecard.
 *
 * Months: the report is for the LAST COMPLETE month by default. The current month can be chosen ("Month to date"): its figures are compared with the previous
 * month pro-rated to the same day, and that is said ("vs. the same period last month, estimated"). A past month is a read-only snapshot.
 *
 * Known limit: the desk keeps no history of partner stages or record counts, so the pipeline gauge counts partners as they are NOW and the records-by-source bar
 * counts the records verified in the month. Everything else is dated.
 */
import type { KpiKey } from "@/config/kpis";
import { daysInMonth, isPastMonth, kpiTarget, kpiValue, monthsBefore, storeData, currentMonth, type KpiData, newInMonth } from "@/lib/kpi";
import type { AmplificationLog, MonthKey, StaffMember } from "@/lib/mock-entities";
import { pipelineHealth, type PipelineHealth } from "@/lib/pipeline-health";
import { isTooEarly, teamScorecards, type ScorecardPerson } from "@/lib/scorecard";
import { buildKpiCards } from "@/lib/services/dashboard";
import type { KpiCardData } from "@/lib/services/dashboard-types";
import { recordsPace, sourceBreakdown, type RecordsPace, type SourceCount } from "@/lib/services/database";
import { buildLeaderboard, networkSummary, type LeaderboardRow, type NetworkSummaryData } from "@/lib/services/network";
import { flattenMoves } from "@/lib/services/partners";
import { socialMonth, type SocialMonth } from "@/lib/services/social";
import { getMockCollection } from "@/lib/mock-store";
import { SERIES_MONTHS } from "@/lib/mock-seed";
import { formatMonth } from "@/lib/format";

export type ReportView = "partner" | "team";

/** The data a report is built from: the KPI collections plus the people and the shares. `data` is for tests; the default is the shared store. */
export type ReportData = KpiData & { amplificationLogs: AmplificationLog[]; staff: StaffMember[] };

export const storeReportData = (): ReportData => ({ ...storeData(), amplificationLogs: getMockCollection("amplificationLogs"), staff: getMockCollection("staff") });

// ---- months ------------------------------------------------------------------------------------------------------------

/** The default month of the report: the last complete month. */
export const lastCompleteMonth = (today: Date = new Date()): MonthKey => monthsBefore(currentMonth(today), 1);

/** The current month: its figures are month to date. */
export const isMonthToDate = (month: MonthKey, today: Date = new Date()): boolean => month === currentMonth(today);

/** The first month the desk has figures for (the oldest of the selectable months). Nothing before it can be compared with. */
export const earliestMonth = (today: Date = new Date()): MonthKey => monthsBefore(currentMonth(today), SERIES_MONTHS - 1);

/** The day to read "as of" for a month: today for the current month, the last day for a past one (so a past month is read in full). */
export function reportToday(month: MonthKey, today: Date = new Date()): Date {
  if (!isPastMonth(month, today)) return today;
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1, daysInMonth(month), 12));
}

/** The document title while printing: "GOD-Progress-Report-2026-09" (partner) or "GOD-Team-Report-2026-09" (team). */
export const reportTitle = (view: ReportView, month: MonthKey): string => `GOD-${view === "partner" ? "Progress" : "Team"}-Report-${month}`;

// ---- the change since the previous month ---------------------------------------------------------------------------------

export interface Delta {
  /** up / down / flat: a percentage; "na": the previous value was 0; "none": there is no previous month to compare with. */
  kind: "up" | "down" | "flat" | "na" | "none";
  /** The words: "+12%" (or "+12% vs August 2026" when `against` is given), "n/a" or "—". */
  text: string;
  /** The rounded percentage, or null for "na" and "none". */
  percent: number | null;
}

/**
 * The change of a figure against the previous month. `previous` is null when there is no previous month (the first month the desk has figures for): "—".
 * A previous value of 0 gives "n/a" (a percentage of nothing is not a number). Otherwise "+12%", "-8%" or "0%", followed by " vs <against>" when
 * `against` is given. The partner report gives none: it states the comparison once, under "Performance overview" (GOD-T11).
 */
export function metricDelta(value: number, previous: number | null, against?: string): Delta {
  if (previous === null) return { kind: "none", text: "—", percent: null };
  if (previous === 0) return { kind: "na", text: "n/a", percent: null };
  const percent = Math.round(((value - previous) / previous) * 100);
  const sign = percent > 0 ? "+" : "";
  return { kind: percent > 0 ? "up" : percent < 0 ? "down" : "flat", text: against ? `${sign}${percent}% vs ${against}` : `${sign}${percent}%`, percent };
}

// ---- the ten figures of the partner report ----------------------------------------------------------------------------------

export type PartnerMetricId = "website_views" | "daily_first_visits" | "daily_visitors" | "social_reach" | "social_engagement" | "posts_published" | "new_ambassadors" | "new_partners" | "opportunities_published" | "programs_organised";

export interface PartnerMetric {
  id: PartnerMetricId;
  label: string;
  value: number;
  /**
   * The previous month's value; null when there is no previous month. For the current month it is the same period of the previous month (up to the same
   * day): counted from the dated records where there are some (GOD-T12), and pro-rated (an estimate) for the website figures, which are monthly totals.
   */
  previous: number | null;
  /** True when `previous` is an estimate (the website figures of the current month): the card says "(est.)". */
  estimated: boolean;
  delta: Delta;
}

// Labels match the Overview's KPI names. The cards show the label, the figure and the change — nothing else (November 2026 review).
const METRICS: { id: PartnerMetricId; label: string }[] = [
  { id: "website_views", label: "Website views" },
  { id: "daily_first_visits", label: "Daily first visits" },
  { id: "daily_visitors", label: "Daily visitors" },
  { id: "social_reach", label: "Social reach" },
  { id: "social_engagement", label: "Social engagement" },
  { id: "posts_published", label: "Posts published" },
  { id: "new_ambassadors", label: "New ambassadors" },
  { id: "new_partners", label: "New partners" },
  { id: "opportunities_published", label: "Opportunities published" },
  { id: "programs_organised", label: "Programs organised" },
];

/** A daily average of the website table, summed over the days the month has had: the whole month for a past one, the days gone for the current one. */
const dailySum = (data: Pick<KpiData, "websiteMonths">, month: MonthKey, field: "dailyFirstVisits" | "dailyVisitors", today: Date): number => {
  const row = data.websiteMonths.find((entry) => entry.month === month);
  if (!row) return 0;
  const days = isMonthToDate(month, today) ? today.getUTCDate() : daysInMonth(month);
  return Math.round(row[field] * days);
};

/** One figure of the partner report in one month (a count, a daily sum, or a KPI). Equal to the matching KPI where there is one. */
export function partnerFigure(id: PartnerMetricId, month: MonthKey, today: Date = new Date(), data: ReportData = storeReportData()): number {
  const kpi: Partial<Record<PartnerMetricId, KpiKey>> = {
    website_views: "website_views",
    social_reach: "social_reach",
    social_engagement: "social_engagement",
    posts_published: "posts_published",
    new_partners: "partners_onboarded",
    opportunities_published: "opportunities_published",
    programs_organised: "programs_organised",
  };
  const key = kpi[id];
  if (key) return kpiValue(key, month, data);
  if (id === "new_ambassadors") return newInMonth("ambassadors", month, data);
  return dailySum(data, month, id === "daily_first_visits" ? "dailyFirstVisits" : "dailyVisitors", isMonthToDate(month, today) ? today : reportToday(month, today));
}

/** The figures that come from monthly totals of the website table: for the current month their "same period" can only be estimated. */
export const ESTIMATED_TO_DATE: ReadonlySet<PartnerMetricId> = new Set<PartnerMetricId>(["website_views", "daily_first_visits", "daily_visitors"]);

/** The records as they stood at the end of `cutoff` (YYYY-MM-DD): everything dated later is left out (a partner keeps its earlier stages). */
export function recordsUpTo(data: ReportData, cutoff: string): ReportData {
  const upTo = (iso: string | undefined) => !iso || iso.slice(0, 10) <= cutoff;
  return {
    ...data,
    socialPosts: data.socialPosts.filter((post) => upTo(post.postedAt)),
    listings: data.listings.filter((listing) => upTo(listing.publishedAt)),
    programs: data.programs.filter((program) => upTo(program.deliveredAt)),
    ambassadors: data.ambassadors.filter((ambassador) => upTo(ambassador.joinedAt)),
    partners: data.partners.map((partner) => ({ ...partner, stageHistory: partner.stageHistory.filter((entry) => upTo(entry.at)) })),
  };
}

/**
 * The ten figures of the partner report with their change. For a past month the comparison is the previous month. For the current month it is the same
 * period of the previous month, up to the same day: COUNTED from the dated records (posts, reach, engagement, ambassadors, partners, opportunities,
 * programs), so a small total is compared with what really happened (the review saw 2 opportunities shown as +675% against an estimate of 0.26); the
 * website figures are monthly totals, so theirs is the previous month pro-rated to the same day and is marked as an estimate. With no previous month
 * (the first month on record) the change is "—". The change is the percentage alone: the report says once what it is compared with.
 */
export function partnerMetrics(month: MonthKey, today: Date = new Date(), data: ReportData = storeReportData()): PartnerMetric[] {
  const previousMonth = monthsBefore(month, 1);
  const hasPrevious = previousMonth >= earliestMonth(today);
  const toDate = isMonthToDate(month, today);
  // the same day of the previous month (its last day when it is shorter), and the share of it that has gone by
  const cutoffDay = Math.min(today.getUTCDate(), daysInMonth(previousMonth));
  const share = toDate ? Math.min(1, today.getUTCDate() / daysInMonth(previousMonth)) : 1;
  const samePeriod = toDate ? recordsUpTo(data, `${previousMonth}-${String(cutoffDay).padStart(2, "0")}`) : data;
  return METRICS.map((metric) => {
    const value = partnerFigure(metric.id, month, today, data);
    const estimated = toDate && hasPrevious && ESTIMATED_TO_DATE.has(metric.id);
    let previous: number | null = null;
    if (hasPrevious) previous = estimated ? partnerFigure(metric.id, previousMonth, today, data) * share : partnerFigure(metric.id, previousMonth, today, samePeriod);
    return { ...metric, value, previous, estimated, delta: metricDelta(value, previous) };
  });
}

/**
 * The one line under "Performance overview" that says what every change is compared with (GOD-T11, GOD-T12):
 * "Percentage changes are compared with October 2026." for a past month, and for the current month
 * "November 2026 to date · Compared with the same period in October 2026 (website figures estimated)."
 */
export function comparisonLine(month: MonthKey, today: Date = new Date()): string {
  const previous = formatMonth(monthsBefore(month, 1));
  if (!isMonthToDate(month, today)) return `Percentage changes are compared with ${previous}.`;
  return `${formatMonth(month)} to date · Compared with the same period in ${previous} (website figures estimated).`;
}

/** What the two daily website figures count, printed once under the cards (GOD-T12). */
export const DAILY_FIGURES_DEFINITION =
  "Daily first visits and Daily visitors are counted each day and added up over the month: someone who visits on three days counts three times.";

/** True when the month recorded nothing at all (every figure is 0): the report says so in a neutral note. */
export const isEmptyMonth = (metrics: readonly PartnerMetric[]): boolean => metrics.every((metric) => metric.value === 0);

/** The previous month in words ("August 2026"): what the partner report is compared with. */
export const previousMonthLabel = (month: MonthKey): string => formatMonth(monthsBefore(month, 1));

/** The month as the report prints it in its footer: "Global Opportunity Desk . October 2026" is built from this. */
export const reportMonthLabel = (month: MonthKey): string => formatMonth(month);

// ---- the team report ----------------------------------------------------------------------------------------------------

export interface TeamReportData {
  month: MonthKey;
  /** The ten KPIs with their target, value and status: the same cards as the Overview. */
  kpis: KpiCardData[];
  /** Partner pipeline health (the gauge of Partners) and the target it is judged against. */
  pipeline: PipelineHealth;
  pipelineTarget: number;
  /** Database pace (the gauge of Database) and the records verified in the month, by source. */
  pace: RecordsPace;
  sources: SourceCount[];
  /** The network: size and activity rate for the month. */
  network: NetworkSummaryData;
  /** The five ambassadors at the top of the month's leaderboard. */
  top: LeaderboardRow[];
  /** Posts, reach and engagement of the month, with the platforms. */
  social: SocialMonth;
  /** The team scoreboard: exactly what the Team scorecard shows for the month (not recalculated). */
  people: ScorecardPerson[];
  /** The month is too young for the scoreboard (before SCORE_FROM_DAY): "Scores start on day 5". */
  tooEarly: boolean;
}

/** Everything the team report shows for a month. */
export function teamReport(month: MonthKey, today: Date = new Date(), data: ReportData = storeReportData()): TeamReportData {
  const asOf = reportToday(month, today);
  const end = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const members = data.ambassadors.filter((ambassador) => ambassador.joinedAt <= end);
  const verifiedInMonth = data.databaseRecords.filter((record) => record.verified && record.verifiedAt?.startsWith(month));
  const target = kpiTarget("partners_onboarded", data, month);
  return {
    month,
    kpis: buildKpiCards(month, today, data),
    pipeline: pipelineHealth(data.partners, flattenMoves(data.partners), target, asOf),
    pipelineTarget: target,
    pace: recordsPace(asOf, data),
    sources: sourceBreakdown(verifiedInMonth),
    network: networkSummary(members, data.amplificationLogs, month),
    top: buildLeaderboard(data.ambassadors, data.amplificationLogs, data.databaseRecords, month).slice(0, 5),
    social: socialMonth(month, data),
    people: teamScorecards(month, today, data, data.staff),
    tooEarly: isTooEarly(month, today),
  };
}
