"use client";

/**
 * AmbassadorBulkActions: the Export menu, the Import button and the History button for the Ambassadors list, with the dialogs
 * behind them. It sits in the list toolbar next to search and filters.
 *
 * Access (two layers, both required):
 *  - the controls are NOT rendered for a role without the permission (ambassadors.export / ambassadors.import), and
 *  - every handler checks `can(...)` again and refuses (with a toast) if the permission is missing, so the action cannot be
 *    reached by any other route into this code.
 * History is shown to anyone who has either permission.
 *
 * Export: "Export filtered results" (what the list shows now), "Export selected" (disabled while nothing is selected) and
 * "Export all" (everyone, ignoring filters). A column picker follows; Download writes ambassadors-YYYY-MM-DD.csv and an audit
 * entry (who, when, counts, filters, columns).
 * Import: opens the four-step wizard; the page's store is only written by the wizard's final confirm, through commitImport.
 *
 * Props: filteredRows (the list as filtered), selectedIds, filters (a plain summary for the audit entry), onClearSelection.
 */
import { useState } from "react";
import { ChevronDown, Download, History, Upload } from "lucide-react";
import { getAdminUser } from "@/lib/api";
import { ROLES } from "@/config/roles";
import { buildExportCsv, exportFilename, type ExistingChoice, type ImportField, type ImportPreview, type ImportStatus } from "@/lib/ambassador-io";
import { downloadTextFile } from "@/lib/csv";
import type { Ambassador } from "@/lib/mock-entities";
import { allAmbassadors, commitImport, recordExport } from "@/lib/services/ambassador-import";
import { todayIsoDate } from "@/lib/services/listings";
import { useRoles } from "@/components/access/RoleProvider";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Menu } from "@/components/ui/Menu";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { AmbassadorExportDialog } from "./AmbassadorExportDialog";
import { AmbassadorHistoryDialog } from "./AmbassadorHistoryDialog";
import { AmbassadorImportDialog } from "./AmbassadorImportDialog";

type Scope = "filtered" | "selected" | "all";

interface AmbassadorBulkActionsProps {
  filteredRows: readonly Ambassador[];
  selectedIds: ReadonlySet<string>;
  filters: { status: string; tier: string; country: string; search: string };
  onClearSelection: () => void;
}

const SCOPE_LABEL: Record<Scope, string> = {
  filtered: "Filtered results",
  selected: "Selected ambassadors",
  all: "All ambassadors",
};

export function AmbassadorBulkActions({ filteredRows, selectedIds, filters, onClearSelection }: AmbassadorBulkActionsProps) {
  const { can, roles } = useRoles();
  const toast = useToast();
  const canExport = can("ambassadors.export", "edit");
  const canImport = can("ambassadors.import", "edit");
  const [exportScope, setExportScope] = useState<Scope | null>(null);
  const [importing, setImporting] = useState(false);
  const [history, setHistory] = useState(false);

  if (!canExport && !canImport) return null;

  // Who: the signed-in person's name and the role(s) they are using.
  const actor = `${getAdminUser()?.name ?? "Unknown user"} (${roles.map((role) => ROLES[role].label).join(" + ")})`;

  const refuse = (what: string) => toast.error(`Your role cannot ${what} ambassador data.`);

  // The people of each scope, from what the page passed in (filtered, selected) or the store (all).
  const rowsFor = (scope: Scope): readonly Ambassador[] => {
    if (scope === "filtered") return filteredRows;
    if (scope === "all") return allAmbassadors();
    return allAmbassadors().filter((ambassador) => selectedIds.has(ambassador.id));
  };

  const openExport = (scope: Scope) => {
    if (!can("ambassadors.export", "edit")) return refuse("export");
    setExportScope(scope);
  };

  const runExport = (columns: ImportField[]) => {
    if (!can("ambassadors.export", "edit")) return refuse("export");
    if (!exportScope) return;
    const people = rowsFor(exportScope);
    downloadTextFile(exportFilename(todayIsoDate()), buildExportCsv(people, columns));
    recordExport({ actor, scope: exportScope, rows: people.length, columns, filters });
    toast.success(`Exported ${people.length} ${people.length === 1 ? "ambassador" : "ambassadors"} to ${exportFilename(todayIsoDate())}.`);
    setExportScope(null);
  };

  const runImport = (preview: ImportPreview, choice: ExistingChoice, status: ImportStatus, fileName: string) => {
    // The wizard only offers this after the permission check at open; checked again here, at the moment of saving.
    if (!can("ambassadors.import", "edit")) {
      refuse("import");
      return { next: allAmbassadors(), status, created: 0, updated: 0, skipped: 0, failed: 0, merged: 0 };
    }
    const result = commitImport(preview, { actor, fileName, choice, status });
    toast.success(`Imported ${result.created + result.updated} ${result.created + result.updated === 1 ? "ambassador" : "ambassadors"} from ${fileName}.`);
    return result;
  };

  const exportItems = [
    { label: "Export filtered results", icon: Download, onSelect: () => openExport("filtered"), disabled: filteredRows.length === 0 },
    { label: selectedIds.size > 0 ? `Export selected (${selectedIds.size})` : "Export selected", icon: Download, onSelect: () => openExport("selected"), disabled: selectedIds.size === 0 },
    { label: "Export all", icon: Download, onSelect: () => openExport("all") },
  ];

  return (
    <>
      {canExport && (
        <Menu label="Export ambassadors" items={exportItems} triggerClassName={cn(buttonClasses("secondary"), "gap-2")} sheetTitle="Export ambassadors">
          <Download size={16} strokeWidth={1.75} aria-hidden="true" />
          Export
          <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
        </Menu>
      )}
      {canImport && (
        <Button
          variant="secondary"
          icon={Upload}
          onClick={() => (can("ambassadors.import", "edit") ? setImporting(true) : refuse("import"))}
          data-testid="import-open"
        >
          Import
        </Button>
      )}
      <Button variant="ghost" icon={History} onClick={() => setHistory(true)} data-testid="history-open">
        History
      </Button>
      {selectedIds.size > 0 && (
        <p className="caption inline-flex items-center gap-2" data-testid="selection-note">
          {selectedIds.size} selected
          <button type="button" onClick={onClearSelection} className="font-semibold text-purple-700 underline-offset-2 hover:underline">
            Clear
          </button>
        </p>
      )}

      {exportScope && (
        <AmbassadorExportDialog scopeLabel={SCOPE_LABEL[exportScope]} rowCount={rowsFor(exportScope).length} onClose={() => setExportScope(null)} onExport={runExport} />
      )}
      {importing && <AmbassadorImportDialog onClose={() => setImporting(false)} onCommit={runImport} />}
      {history && <AmbassadorHistoryDialog onClose={() => setHistory(false)} />}
    </>
  );
}
