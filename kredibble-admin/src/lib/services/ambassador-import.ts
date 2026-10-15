"use client";

/**
 * Ambassador import/export service: the only place the Network page's import and export touch the mock store.
 * One function per need; components never import seed data.
 *
 * - The import writes ONLY to the in-memory mock store ({ always: true }, like the rest of the ambassador writes). It never
 *   calls the backend, because the backend has no import endpoint yet.
 *   TODO(backend): persist this change: POST /admin/ambassadors/import with the previewed rows, and a job that downloads
 *   every pictureSourceUrl (Google Drive files must be shared as "anyone with the link") into our own storage.
 * - Referral codes come from generateReferralCode (the same function the New ambassador form uses), so imported people get
 *   GOD-XXXXXX codes that are unique.
 * - Every import and export is written to the audit log, with who, when, the counts and the filters.
 */
import { getMockCollection, setMockCollection } from "@/lib/mock-store";
import type { Ambassador } from "@/lib/mock-entities";
import { generateReferralCode } from "@/lib/services/network";
import { todayIsoDate } from "@/lib/services/listings";
import { recordAudit } from "@/lib/services/audit-log";
import { applyImport, type ExistingChoice, type ImportPreview, type ImportResult, type ImportStatus } from "@/lib/ambassador-io";

/** The emails already in the system, lowercase, with the ambassador each belongs to. */
export function existingEmails(): Map<string, string> {
  return new Map(getMockCollection("ambassadors").map((ambassador) => [ambassador.email.trim().toLowerCase(), ambassador.id]));
}

/** Everyone in the network (for "Export all"). */
export const allAmbassadors = (): Ambassador[] => getMockCollection("ambassadors");

export interface ImportContext {
  actor: string;
  fileName: string;
  choice: ExistingChoice;
  /** The status new people get (the file's status column is ignored). */
  status: ImportStatus;
}

/** Saves the import to the mock store and logs it. The caller has already checked the permission. */
export function commitImport(preview: ImportPreview, context: ImportContext): ImportResult {
  const stamp = Date.now();
  const result = applyImport(
    preview,
    getMockCollection("ambassadors"),
    context.choice,
    context.status,
    (index) => `amb-imp-${stamp}-${index}`,
    generateReferralCode,
    todayIsoDate(),
  );
  setMockCollection("ambassadors", result.next, { always: true });
  recordAudit({
    actor: context.actor,
    action: "ambassadors.import",
    summary: `Imported ${context.fileName}: ${result.created} created as ${context.status}, ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed, ${result.merged} duplicates merged`,
    details: {
      file: context.fileName,
      existingRows: context.choice,
      statusForNewAmbassadors: context.status,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      failed: result.failed,
      merged: result.merged,
    },
  });
  return result;
}

export interface ExportContext {
  actor: string;
  scope: "filtered" | "selected" | "all";
  rows: number;
  columns: string[];
  /** The filters that were on when "Export filtered results" was used. */
  filters: { status: string; tier: string; country: string; search: string };
}

/** Writes the export to the audit log. */
export function recordExport(context: ExportContext) {
  recordAudit({
    actor: context.actor,
    action: "ambassadors.export",
    summary: `Exported ${context.rows} ambassador${context.rows === 1 ? "" : "s"} (${context.scope})`,
    details: {
      scope: context.scope,
      rows: context.rows,
      columns: context.columns.join(", "),
      filterStatus: context.filters.status,
      filterTier: context.filters.tier,
      filterCountry: context.filters.country,
      filterSearch: context.filters.search || "—",
    },
  });
}
