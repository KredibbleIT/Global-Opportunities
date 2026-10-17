"use client";

/**
 * Ambassador import/export service: the only place the Network page's import, export and history touch data.
 * One function per need; components never import seed data or call the API themselves.
 *
 * - Real mode (the default): the import sends the CSV FILE to POST /admin/ambassadors/import. The server checks every row
 *   again with the same rules (kredibble-backend/src/lib/ambassador-io.js), saves, gives new people GOD-XXXXXX codes,
 *   queues each Google Drive picture to be copied into our storage, and writes the audit entry. Its result (counts and the
 *   failed rows with their reasons) is what the wizard shows at the end; the preview before it stays in the browser.
 *   The export asks POST /admin/ambassadors/export for the file: the server leaves email, phone and WhatsApp out unless one
 *   of them was ticked, and writes the audit entry. The history reads GET /admin/ambassadors/history.
 * - Mock mode: the import writes the in-memory store, the export is built in the browser, and both go to the in-browser
 *   audit log. Referral codes come from generateReferralCode, the same function the New ambassador form uses.
 */
import {
  exportAmbassadorsApi,
  getAmbassadorHistoryApi,
  importAmbassadorsApi,
  type AmbassadorExportRequest,
  type AmbassadorHistoryApiEntry,
  type AmbassadorImportErrorRow,
} from "@/lib/api";
import { buildExportCsv, applyImport, exportFilename, type ExistingChoice, type ImportField, type ImportPreview, type ImportStatus } from "@/lib/ambassador-io";
import { csvWithBom, downloadTextFile } from "@/lib/csv";
import { getMockCollection, setMockCollection } from "@/lib/mock-store";
import type { Ambassador } from "@/lib/mock-entities";
import { generateReferralCode, notifyNetworkChanged } from "@/lib/services/network";
import { todayIsoDate } from "@/lib/services/listings";
import { recordAudit, type AuditEntry } from "@/lib/services/audit-log";
import { isMockMode } from "@/lib/services/mock-mode";

const BOM = "\uFEFF";
/** The Network page's "no filter" value. */
const ALL = "all";
const SENSITIVE_COLUMNS: readonly ImportField[] = ["email", "phone", "whatsapp"];

/** The emails of the given ambassadors, lowercase, with the ambassador each belongs to. */
export function emailIndex(ambassadors: readonly Ambassador[]): Map<string, string> {
  return new Map(ambassadors.map((ambassador) => [ambassador.email.trim().toLowerCase(), ambassador.id]));
}

export interface ImportContext {
  actor: string;
  fileName: string;
  choice: ExistingChoice;
  /** The status new people get (the file's status column is ignored). */
  status: ImportStatus;
}

/** What the wizard's last step shows. */
export interface ImportOutcome {
  status: ImportStatus;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  merged: number;
  /** Real mode: the server's own list of failed rows (it may refuse a row the preview passed). */
  errors?: AmbassadorImportErrorRow[];
  /** Real mode: Google Drive pictures the server will copy into our storage. */
  picturesQueued?: number;
}

/** Mock mode: saves the import to the store and logs it. The caller has already checked the permission. */
export function commitImport(preview: ImportPreview, context: ImportContext): ImportOutcome {
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
    summary: importSummary(context.fileName, context.status, result),
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
  const { status, created, updated, skipped, failed, merged } = result;
  return { status, created, updated, skipped, failed, merged };
}

/**
 * Runs the import the wizard confirmed. Real mode sends `file` (the server re-reads it; `preview` is not trusted) and
 * rejects with the server's message on a refusal (for example "Another ambassador import is running").
 */
export async function importAmbassadors(file: File, preview: ImportPreview, context: ImportContext): Promise<ImportOutcome> {
  if (isMockMode()) return commitImport(preview, context);
  const result = await importAmbassadorsApi(file, context.choice, context.status);
  notifyNetworkChanged();
  const { status, created, updated, skipped, failed, merged, errors, picturesQueued } = result;
  return { status, created, updated, skipped, failed, merged, errors, picturesQueued };
}

export interface ExportContext {
  actor: string;
  scope: "filtered" | "selected" | "all";
  rows: number;
  columns: ImportField[];
  /** The filters that were on when "Export filtered results" was used. */
  filters: { status: string; tier: string; country: string; search: string };
}

/** Mock mode: writes the export to the audit log. */
export function recordExport(context: ExportContext) {
  recordAudit({
    actor: context.actor,
    action: "ambassadors.export",
    summary: exportSummary(context.rows, context.scope),
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

export interface ExportRequest extends ExportContext {
  /** The people of the scope as the page shows them (mock mode builds the file from them). */
  people: readonly Ambassador[];
  /** The ticked rows, for scope "selected". */
  selectedIds: ReadonlySet<string>;
}

/** The filters the server should apply for "Export filtered results": the ones that are on. */
const activeFilters = (filters: ExportContext["filters"]): AmbassadorExportRequest["filters"] => {
  const on = (value: string) => (value && value !== ALL ? value : undefined);
  const result = { status: on(filters.status), tier: on(filters.tier), country: on(filters.country), search: filters.search.trim() || undefined };
  return Object.values(result).some(Boolean) ? result : undefined;
};

/** Downloads the export file for the scope and columns. Real mode: the server builds the file and records the export. */
export async function exportAmbassadors(request: ExportRequest): Promise<void> {
  const fileName = exportFilename(todayIsoDate());
  if (isMockMode()) {
    downloadTextFile(fileName, buildExportCsv(request.people, request.columns));
    recordExport(request);
    return;
  }
  const text = await exportAmbassadorsApi({
    scope: request.scope,
    columns: request.columns,
    // Ticking a sensitive column in the picker is the explicit opt-in; without it the server leaves them out anyway.
    includeSensitive: request.columns.some((column) => SENSITIVE_COLUMNS.includes(column)),
    ids: request.scope === "selected" ? [...request.selectedIds] : undefined,
    filters: request.scope === "filtered" ? activeFilters(request.filters) : undefined,
  });
  // Reading the response as text drops the byte-order mark Excel needs to read accented names as UTF-8.
  downloadTextFile(fileName, text.startsWith(BOM) ? text : csvWithBom(text));
}

// ---- history ---------------------------------------------------------------------------------------------------------

const plural = (count: number) => `${count} ambassador${count === 1 ? "" : "s"}`;

function importSummary(fileName: string, status: ImportStatus, counts: Pick<ImportOutcome, "created" | "updated" | "skipped" | "failed" | "merged">): string {
  return `Imported ${fileName}: ${counts.created} created as ${status}, ${counts.updated} updated, ${counts.skipped} skipped, ${counts.failed} failed, ${counts.merged} duplicates merged`;
}

const exportSummary = (rows: number, scope: string) => `Exported ${plural(rows)} (${scope})`;

const asNumber = (value: unknown) => (typeof value === "number" ? value : 0);

/** A server audit row's metadata as plain label/value pairs (lists joined, filters spread out). */
function flatDetails(metadata: Record<string, unknown>): AuditEntry["details"] {
  const details: AuditEntry["details"] = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) details[key] = value.join(", ");
    else if (typeof value === "object") {
      for (const [inner, innerValue] of Object.entries(value as Record<string, unknown>)) {
        if (innerValue !== null && innerValue !== undefined) details[`${key}.${inner}`] = String(innerValue);
      }
    } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") details[key] = value;
  }
  return details;
}

function toHistoryEntry(entry: AmbassadorHistoryApiEntry): AuditEntry {
  const meta = entry.metadata;
  const file = typeof meta.file === "string" ? meta.file : "a file";
  const summary =
    entry.action === "ambassadors.export"
      ? exportSummary(asNumber(meta.rows), String(meta.scope ?? "all"))
      : entry.outcome === "failure"
        ? `Import of ${file} stopped before it finished`
        : importSummary(file, meta.status === "pending" ? "pending" : "active", {
            created: asNumber(meta.created),
            updated: asNumber(meta.updated),
            skipped: asNumber(meta.skipped),
            failed: asNumber(meta.failed),
            merged: asNumber(meta.merged),
          });
  return { id: entry.id, at: entry.at, actor: entry.actorName ?? "Unknown user", action: entry.action, summary, details: flatDetails(meta) };
}

/** Real mode: the latest imports and exports from the server's audit log, newest first. */
export async function loadAmbassadorHistory(): Promise<AuditEntry[]> {
  const entries = await getAmbassadorHistoryApi();
  return entries.map(toHistoryEntry);
}
