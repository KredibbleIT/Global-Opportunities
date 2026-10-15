"use client";

/**
 * AmbassadorExportDialog: the column picker for "Export ambassadors". Opens after the person chose what to export
 * (filtered results, selected rows or everyone) and lets them tick the columns of the CSV.
 *
 * - The defaults leave the personal contact columns (email, phone, WhatsApp) OFF. Each is marked "Sensitive" with a shield
 *   icon AND the word, never colour alone. Email is needed to import the file again, and the dialog says so.
 * - The note under the list explains how the file is written for Excel (UTF-8 with a byte-order mark; phone numbers with
 *   spaces so the leading 0 survives).
 * - Download is disabled with a reason when no column is ticked or there are no rows.
 *
 * Props: scopeLabel (what is exported, in words), rowCount, onClose, onExport(columns) -> called with the ticked columns in
 *        template order. The page does the permission check, the download and the audit entry.
 */
import { useState } from "react";
import { Download, ShieldAlert } from "lucide-react";
import { ALL_EXPORT_COLUMNS, TEMPLATE_HEADERS, type ImportField } from "@/lib/ambassador-io";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Checkbox } from "@/components/ui/form/Checkbox";

interface AmbassadorExportDialogProps {
  scopeLabel: string;
  rowCount: number;
  onClose: () => void;
  onExport: (columns: ImportField[]) => void;
}

export function AmbassadorExportDialog({ scopeLabel, rowCount, onClose, onExport }: AmbassadorExportDialogProps) {
  const [chosen, setChosen] = useState<Set<ImportField>>(() => new Set(ALL_EXPORT_COLUMNS.filter((column) => column.defaultOn).map((column) => column.key)));

  const toggle = (key: ImportField, on: boolean) =>
    setChosen((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const ordered = TEMPLATE_HEADERS.filter((key) => chosen.has(key));
  const blockedReason = rowCount === 0 ? "There are no rows to export." : ordered.length === 0 ? "Choose at least one column." : null;

  return (
    <Dialog
      title="Export ambassadors"
      description={`${scopeLabel}: ${rowCount.toLocaleString("en-US")} ${rowCount === 1 ? "ambassador" : "ambassadors"}. Choose the columns of the CSV file.`}
      onClose={onClose}
      size="md"
      testId="export-dialog"
      footer={
        <>
          {blockedReason && (
            <p className="caption mr-auto" role="status">
              {blockedReason}
            </p>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={Download} disabled={blockedReason !== null} onClick={() => onExport(ordered)} data-testid="export-download">
            Download CSV
          </Button>
        </>
      }
    >
      <fieldset>
        <legend className="sr-only">Columns to include</legend>
        <div className="mb-3 flex gap-3">
          <Button size="sm" variant="secondary" onClick={() => setChosen(new Set(TEMPLATE_HEADERS))}>
            Select all
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setChosen(new Set())}>
            Clear
          </Button>
        </div>
        <ul className="divide-y divide-line rounded-control border border-line">
          {ALL_EXPORT_COLUMNS.map((column) => (
            <li key={column.key} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <Checkbox checked={chosen.has(column.key)} onChange={(on) => toggle(column.key, on)} label={column.label} description={column.note} />
              {column.sensitive && (
                <span className="caption inline-flex shrink-0 items-center gap-1 font-semibold text-warning" data-testid={`sensitive-${column.key}`}>
                  <ShieldAlert size={14} strokeWidth={2} aria-hidden="true" />
                  Sensitive
                </span>
              )}
            </li>
          ))}
        </ul>
      </fieldset>
      <p className="caption mt-4">
        The file is UTF-8 with a byte-order mark, so Excel shows names correctly. Phone numbers are written with spaces (025 734 9584) so
        Excel keeps the leading 0; the importer removes the spaces again. The headers match the import template.
      </p>
    </Dialog>
  );
}
