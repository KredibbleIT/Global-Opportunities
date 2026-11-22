/**
 * Monthly report data service (/monthly-report): what the two report templates show, and the one write they make (recording that a report was generated).
 *
 * - getPartnerReport(month) and getTeamReport(month): mock mode works the figures out from the shared in-memory store with the same functions as the other
 *   screens (see lib/report.ts; the first load takes a moment, later ones are instant). Real-API mode reads them from the server (./report-live.ts): a month
 *   with no records is zeros and "No data", never sample figures, and a failed request is an issue the page shows with "Try again".
 * - Dev only: ?state=loading|error|empty on the page URL forces that state (mock mode, never in production). "empty" is a month with no figures at all.
 * - recordReport(month, view) is what "Download PDF" does BEFORE it prints: it adds ONE record {reportMonth, view, generatedAt: now}, at most once per
 *   reportMonth and view in each calendar month, so the Monthly reports KPI counts it. Mock mode adds it to the store; real mode saves it on the server.
 */
import { shouldRecordReport } from "@/lib/kpi";
import type { MonthKey, MonthlyReport } from "@/lib/mock-entities";
import { getMockCollection, setMockCollection } from "@/lib/mock-store";
import { partnerMetrics, storeReportData, teamReport, type PartnerMetric, type ReportView, type TeamReportData } from "@/lib/report";
import { platformRows, type PlatformRow } from "@/lib/services/social";
import { buildTrend } from "@/lib/services/dashboard";
import { earliestMonth, isMonthToDate } from "@/lib/report";
import { getMonthlyReportsApi, recordMonthlyReportApi } from "@/lib/api";
import { isMockMode } from "./mock-mode";
import { livePartnerReport, liveTeamReport } from "./report-live";

/** One month of the "Monthly views by platform" chart: the website views, and the app views when they are tracked (null = "No data"). */
export interface AudiencePoint {
  month: MonthKey;
  label: string;
  tooltipLabel: string;
  website: number;
  app: number | null;
}

export interface PartnerReportData {
  month: MonthKey;
  metrics: PartnerMetric[];
  /** The last six months of views, ending with the report month: only the months the desk has figures for (never a made-up 0). `app` is null when app analytics are not tracked for a month (the report shows "No data"). */
  audience: AudiencePoint[];
  /** Channel, posts, reach and engagement of the month, the leading channel first. Empty when the month has no posts. */
  channels: PlatformRow[];
}

export interface ReportIssue {
  kind: "failed";
  message: string;
}

export interface PartnerReportResult {
  data: PartnerReportData | null;
  issue: ReportIssue | null;
}
export interface TeamReportResult {
  data: TeamReportData | null;
  issue: ReportIssue | null;
}

/** Where the report's figures come from: "sample" (the in-memory sample store) or "live" (the API). */
export type ReportSource = "sample" | "live";

/**
 * The source of the report's figures: "sample" in mock mode (the paper then shows a "Sample report" badge and a sample footer, on screen and in the PDF),
 * "live" otherwise (the figures come from the server).
 */
export function reportSource(): ReportSource {
  return isMockMode() ? "sample" : "live";
}

/** The records the sample report is worked out from (mock mode only: the real report is read from the server). */
const reportRecords = () => storeReportData();

const FORCED = ["loading", "error", "empty"] as const;
type Forced = (typeof FORCED)[number];
const MOCK_DELAY_MS = 400;
let loadedOnce = false;

function readForcedState(): Forced | null {
  if (typeof window === "undefined" || process.env.NODE_ENV === "production" || !isMockMode()) return null;
  const value = new URLSearchParams(window.location.search).get("state");
  return FORCED.find((state) => state === value) ?? null;
}

/** Waits for the first load only, then answers at once. */
function afterDelay<T>(make: () => T): Promise<T> {
  if (loadedOnce) return Promise.resolve(make());
  return new Promise<T>((resolve) =>
    setTimeout(() => {
      loadedOnce = true;
      resolve(make());
    }, MOCK_DELAY_MS),
  );
}

/** A real-API read: the report, or the issue the page shows with "Try again". */
async function liveResult<T>(load: () => Promise<T>, fallback: string): Promise<{ data: T | null; issue: ReportIssue | null }> {
  try {
    return { data: await load(), issue: null };
  } catch (error) {
    return { data: null, issue: { kind: "failed", message: error instanceof Error && error.message ? error.message : fallback } };
  }
}

const failed = (): ReportIssue => ({ kind: "failed", message: "Could not load the report. (forced: ?state=error)" });

/** The partner report of a month: aggregate figures only. Nothing about a person is read here. */
export function getPartnerReport(month: MonthKey): Promise<PartnerReportResult> {
  if (!isMockMode()) return liveResult(() => livePartnerReport(month), "Could not load the partner report.");
  const forced = readForcedState();
  if (forced === "loading") return new Promise<PartnerReportResult>(() => {});
  if (forced === "error") return afterDelay(() => ({ data: null, issue: failed() }));
  return afterDelay(() => {
    const data = reportRecords();
    const metrics = partnerMetrics(month, new Date(), data);
    const empty = forced === "empty";
    const websiteByMonth = new Map(data.websiteMonths.map((row) => [row.month, row]));
    return {
      data: {
        month,
        metrics: empty ? metrics.map((metric) => ({ ...metric, value: 0, previous: null, delta: { kind: "none" as const, text: "—", percent: null } })) : metrics,
        audience: buildTrend(month, data).website_views
          .filter((point) => point.month >= earliestMonth())
          .map((point) => ({
            month: point.month,
            // GOD-T15: the month still running says so ("Nov to date"), so its partial figure is not read against a full month
            label: isMonthToDate(point.month) ? `${point.label} to date` : point.label,
            tooltipLabel: isMonthToDate(point.month) ? `${point.tooltipLabel} to date` : point.tooltipLabel,
            website: empty ? 0 : point.value,
            app: empty ? null : (websiteByMonth.get(point.month)?.appViews ?? null),
          })),
        channels: empty ? [] : platformRows(data.socialPosts, month),
      },
      issue: null,
    };
  });
}

/** The team report of a month (internal). */
export function getTeamReport(month: MonthKey): Promise<TeamReportResult> {
  if (!isMockMode()) return liveResult(() => liveTeamReport(month), "Could not load the team report.");
  const forced = readForcedState();
  if (forced === "loading") return new Promise<TeamReportResult>(() => {});
  if (forced === "error") return afterDelay(() => ({ data: null, issue: failed() }));
  return afterDelay(() => {
    const report = teamReport(month, new Date(), reportRecords());
    // "empty": the month recorded nothing: every KPI is 0 (the paper stays, with its neutral note)
    return { data: forced === "empty" ? { ...report, kpis: report.kpis.map((card) => ({ ...card, value: 0, status: card.target ? ("red" as const) : null, attainment: card.target ? 0 : null })) } : report, issue: null };
  });
}

/**
 * Records that a report was generated. "Download PDF" calls this BEFORE window.print(), so the button counts as "generated": the Monthly reports KPI counts
 * reports by the calendar month of generatedAt. At most one record for each reportMonth and view in each calendar month (shouldRecordReport decides), so
 * printing the same report again adds nothing. Returns true when a record was added (the caller then shows the toast, once).
 */
export function recordReport(month: MonthKey, view: ReportView, now: Date = new Date()): boolean {
  const reports = getMockCollection("monthlyReports");
  if (!shouldRecordReport(reports, month, now, view)) return false;
  const record: MonthlyReport = { id: `rpt-${view}-${month}-${now.getTime()}`, reportMonth: month, view, generatedAt: now.toISOString().slice(0, 10) };
  setMockCollection("monthlyReports", [...reports, record], { always: true });
  return true;
}

/** What "Download PDF" calls: the sample store in mock mode, the server in real mode. Resolves with whether a record was added (the page then shows its toast). */
export async function recordGeneratedReport(month: MonthKey, view: ReportView, now: Date = new Date()): Promise<boolean> {
  return isMockMode() ? recordReport(month, view, now) : recordReportOnServer(month, view, now);
}

/** Real mode: asks the server which reports were generated this calendar month and saves this one only when it is the first of its month and view. */
async function recordReportOnServer(month: MonthKey, view: ReportView, now: Date): Promise<boolean> {
  try {
    const existing = await getMonthlyReportsApi({ reportMonth: month, view, limit: 50 });
    const known: MonthlyReport[] = existing.map((row) => ({ id: row.id, reportMonth: row.reportMonth as MonthKey, view: row.view, generatedAt: String(row.generatedAt).slice(0, 10) }));
    if (!shouldRecordReport(known, month, now, view)) return false;
    await recordMonthlyReportApi({ reportMonth: month, view });
    return true;
  } catch {
    // Printing never waits on this: the report still prints, it is just not counted.
    return false;
  }
}
