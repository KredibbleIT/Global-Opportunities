/**
 * Data for the Reports queue (/reports) and the report detail page (/reports/[id]).
 *
 * The same switch as the Seekers and Hirers directories (see mock-mode.ts):
 * - Mock mode: the sample reports (mock-reports.ts) WITH this session's changes laid over them (mock-store.ts).
 * - Real mode: the admin data API (GET /admin/reports, GET/PATCH /admin/reports/:id, via lib/api.ts), mapped to the shape the pages use.
 *
 * Before this (November 2026 review) the queue always showed the sample reports, even with Mock data off, while the Overview counted the database:
 * "3 open reports" on the queue against "0" on the Overview. Both now read the same Report records (status "open"), so the two counts agree.
 *
 * Errors reject with the server's message; the pages show them inline with a retry button. A missing record resolves with undefined ("not found").
 */
import { getReportById, getReports, updateReport, type ReportRecord } from "@/lib/api";
import { reports as sampleReports, type Report, type ReportStatus, type ReportTargetType } from "@/lib/mock-reports";
import { overlayRows } from "@/lib/mock-store";
import { MISSING, fetchAll, orMissing } from "./api-helpers";
import { isMockMode } from "./mock-mode";

const TARGET_TYPES: ReportTargetType[] = ["post", "user", "opportunity", "channel"];
const STATUSES: ReportStatus[] = ["open", "resolved", "dismissed"];

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Maps one API report to the page's shape. A type or status the admin does not know shows as "other" / "open" rather than being dropped. */
export function toReport(record: ReportRecord): Report {
  const targetType = TARGET_TYPES.find((type) => type === record.targetType) ?? "other";
  return {
    id: record.id,
    targetType,
    targetLabel: record.targetLabel || `${capitalise(record.targetType || "other")} report`,
    reporterName: record.reporterName || MISSING,
    reason: record.reason,
    details: record.details || MISSING,
    date: record.date || record.createdAt,
    status: STATUSES.find((status) => status === record.status) ?? "open",
    linkedChannelId: record.linkedChannelId,
  };
}

/** Every report: the sample ones in mock mode, the database's in real mode. */
export async function loadReportRows(): Promise<Report[]> {
  if (isMockMode()) return overlayRows("reports", sampleReports);
  return (await fetchAll((page, limit) => getReports({ page, limit }))).map(toReport);
}

/** One report, or undefined when there is no such report. */
export async function loadReport(id: string): Promise<Report | undefined> {
  if (isMockMode()) return sampleReports.find((report) => report.id === id);
  return getReportById(id).then(toReport, orMissing<Report>);
}

/**
 * Saves a report's new status (Mark resolved, Dismiss). Real mode: PATCH /admin/reports/:id and resolves with the saved status. Mock mode: nothing to
 * send; the page's local change (useDetailData's setRecord) is the whole effect, as before.
 */
export async function saveReportStatus(id: string, status: Exclude<ReportStatus, "open">): Promise<ReportStatus> {
  if (isMockMode()) return status;
  const saved = await updateReport(id, { status });
  return STATUSES.find((value) => value === saved.status) ?? status;
}
