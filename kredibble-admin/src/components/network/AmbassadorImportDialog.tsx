"use client";

/**
 * AmbassadorImportDialog: a four-step wizard that imports ambassadors from a CSV file. The preview runs in the browser; nothing
 * is saved until the person confirms in step 3. In real mode the confirm sends the file itself to the server, which checks
 * every row again; step 4 shows the SERVER's counts and its error report (it may refuse a row the preview passed). Step structure and keyboard ideas come from the 21st.dev "Wizard Steps" and
 * "Stepper" candidates (numbered indicators, aria-current="step"), restyled to the brief.
 *
 *   1. Upload   a drop area and a "Choose a CSV file" button (.csv only, 5 MB), plus "Download template". The file is read in
 *               chunks with a progress bar, so a large file never freezes the page.
 *   2. Preview  counts (valid, warnings, errors, duplicates to merge, already in the system), a filter by status and a table
 *               with a status chip and the exact reasons for every row. An error blocks that row only.
 *   3. Options  "Status for imported ambassadors" (Active, preselected, or Pending) and, for emails that already exist, Skip
 *               (default) or Update. A summary of what will happen. The Import button is the only thing that saves.
 *               The file's own status column is ignored; a person who already exists keeps their status.
 *   4. Result   created (with the status chosen), updated, skipped, failed and merged counts, and a download of the error
 *               report. Announced to screen readers.
 *
 * Accessibility: focus moves to the dialog title on every step; a polite live region announces each step and the result; the
 * file input has a label; no status is shown by colour alone (every chip has an icon and a word).
 *
 * Props: existing (emails already in the network -> ambassador id), onClose, onCommit(preview, choice, status, file) -> a
 * promise of the result (the page checks the permission and saves). A rejected commit shows its message in step 3.
 */
import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, FileUp, GitMerge, Info, UserCheck, XCircle } from "lucide-react";
import {
  MAX_FILE_BYTES,
  analyseImport,
  buildErrorReportCsv,
  DEFAULT_IMPORT_STATUS,
  IMPORT_STATUS_LABEL,
  mapHeaders,
  readRows,
  rowOutcome,
  templateCsv,
  type ExistingChoice,
  type ImportStatus,
  type ImportPreview,
  type ImportRow,
} from "@/lib/ambassador-io";
import { csvWithBom, downloadTextFile, parseCsv, toCsv } from "@/lib/csv";
import type { ImportOutcome } from "@/lib/services/ambassador-import";
import { isMockMode } from "@/lib/services/mock-mode";
import { DataTable } from "@/components/list/DataTable";
import type { Column } from "@/components/list/types";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { MiniStat } from "@/components/ui/MiniStat";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";

type Step = 1 | 2 | 3 | 4;
const STEPS = ["Upload", "Preview", "Options", "Result"] as const;
type PreviewFilter = "all" | "valid" | "warning" | "error" | "merged" | "exists";

const nextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** A row's status chips: its outcome (or "Replaced" when a newer submission supersedes it), plus "Already exists". */
function RowChips({ row, status }: { row: ImportRow; status: ImportStatus }) {
  if (row.mergedInto !== undefined) {
    return <StatusBadge status="merged" label={`Replaced by line ${row.mergedInto}`} tone="neutral" icon={GitMerge} />;
  }
  const outcome = rowOutcome(row);
  return (
    <div className="flex flex-wrap gap-1.5">
      {outcome === "error" ? (
        <StatusBadge status="error" label="Error" tone="danger" icon={XCircle} />
      ) : outcome === "warning" ? (
        <StatusBadge status="warning" label="Warning" tone="warning" icon={AlertTriangle} />
      ) : (
        <StatusBadge status="valid" label="Valid" tone="success" icon={CheckCircle2} />
      )}
      {row.exists && <StatusBadge status="exists" label="Already exists" tone="info" icon={UserCheck} />}
      {outcome !== "error" && (
        <p className="caption w-full" data-testid="row-becomes">
          {row.exists ? "Keeps their current status" : `Will be created as ${IMPORT_STATUS_LABEL[status]}`}
        </p>
      )}
    </div>
  );
}

/** The reasons of a row. Each carries a word as well as a colour. */
function RowReasons({ row }: { row: ImportRow }) {
  if (row.issues.length === 0) return <span className="caption">No issues</span>;
  return (
    <ul className="space-y-1">
      {row.issues.map((issue, index) => (
        <li key={index} className={issue.level === "error" ? "caption text-danger" : issue.level === "warning" ? "caption text-warning" : "caption"}>
          <span className="font-semibold">{issue.level === "error" ? "Error" : issue.level === "warning" ? "Warning" : "Note"}</span>
          {issue.field ? ` (${issue.field})` : ""}: {issue.message}
        </li>
      ))}
    </ul>
  );
}

/** The preview columns. The status chip also says what status a new person will get, so the choice is visible per row. */
const makeColumns = (status: ImportStatus): Column<ImportRow>[] => [
  { key: "line", header: "Line", type: "number", width: "8%", value: (row) => row.rowNumber },
  { key: "person", header: "Person", type: "primary", width: "28%", title: (row) => row.record.fullName || "(no name)", subtitle: (row) => row.record.email || "(no email)" },
  { key: "status", header: "Status", type: "custom", width: "22%", render: (row) => <RowChips row={row} status={status} /> },
  { key: "reasons", header: "Details", type: "custom", width: "42%", render: (row) => <RowReasons row={row} /> },
];

interface AmbassadorImportDialogProps {
  existing: ReadonlyMap<string, string>;
  onClose: () => void;
  onCommit: (preview: ImportPreview, choice: ExistingChoice, status: ImportStatus, file: File) => Promise<ImportOutcome>;
}

export function AmbassadorImportDialog({ existing, onClose, onCommit }: AmbassadorImportDialogProps) {
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [commitError, setCommitError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null); // 0..1 while reading, null otherwise
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [filter, setFilter] = useState<PreviewFilter>("all");
  const [choice, setChoice] = useState<ExistingChoice>("skip");
  const [status, setStatus] = useState<ImportStatus>(DEFAULT_IMPORT_STATUS);
  const [hasStatusColumn, setHasStatusColumn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ImportOutcome | null>(null);
  const [dragging, setDragging] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const announce = (text: string) => setAnnouncement(text);
  const go = (next: Step, text: string) => {
    setStep(next);
    announce(`Step ${next} of 4: ${STEPS[next - 1]}. ${text}`);
  };

  /** Reads, parses and analyses a file. Every failure ends as a calm message in step 1; nothing is thrown at the page. */
  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setPreview(null);
    if (!/\.csv$/i.test(file.name)) {
      setError("That file is not a .csv. Export your sheet as CSV (UTF-8) and try again.");
      return;
    }
    if (file.size === 0) {
      setError("That file is empty.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB.`);
      return;
    }
    setFile(file);
    setFileName(file.name);
    try {
      setProgress(0);
      const text = await file.text();
      const table = await parseCsv(text, { onProgress: setProgress });
      setProgress(null);
      setChecking(true);
      await nextTurn(); // let "Checking rows" paint before the heavy loop
      if (table.length === 0) throw new Error("The file has no rows.");
      const mapping = mapHeaders(table[0]);
      if (mapping.missing.length > 0) {
        throw new Error(`The file has no ${mapping.missing.join(" or ")} column. Use the template, or the original form headers (Full Name, Email).`);
      }
      if (table.length < 2) throw new Error("The file has a header row but no people below it.");
      const rows = readRows(table.slice(1), mapping);
      const analysed = analyseImport(rows, existing);
      setIgnored(mapping.ignored);
      setHasStatusColumn(mapping.columns.includes("status"));
      setPreview(analysed);
      setFilter("all");
      setChecking(false);
      const c = analysed.counts;
      go(2, `${c.total} rows read: ${c.valid} valid, ${c.warnings} with warnings, ${c.errors} with errors, ${c.merged} duplicates merged, ${c.exists} already in the system.`);
    } catch (problem) {
      setProgress(null);
      setChecking(false);
      setError(problem instanceof Error ? problem.message : "The file could not be read.");
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void handleFile(event.dataTransfer.files?.[0]);
  };

  const counts = preview?.counts;
  const importable = counts ? counts.valid + counts.warnings : 0;
  const willUpdateOrSkip = counts?.exists ?? 0;
  const willCreate = importable - willUpdateOrSkip;

  const visibleRows = (preview?.rows ?? []).filter((row) => {
    if (filter === "all") return true;
    if (filter === "merged") return row.mergedInto !== undefined;
    if (row.mergedInto !== undefined) return false;
    if (filter === "exists") return row.exists;
    return rowOutcome(row) === filter;
  });

  const filterOptions: { value: PreviewFilter; label: string; count: number }[] = counts
    ? [
        { value: "all", label: "All", count: counts.total },
        { value: "valid", label: "Valid", count: counts.valid },
        { value: "warning", label: "Warnings", count: counts.warnings },
        { value: "error", label: "Errors", count: counts.errors },
        { value: "merged", label: "Merged", count: counts.merged },
        { value: "exists", label: "Already exist", count: counts.exists },
      ]
    : [];

  const confirmImport = async () => {
    if (!preview || !file) return;
    setSaving(true);
    setCommitError(null);
    await nextTurn(); // show "Importing…" for at least a frame
    try {
      const done = await onCommit(preview, choice, status, file);
      setResult(done);
      setSaving(false);
      go(4, `Done. ${done.created} created as ${IMPORT_STATUS_LABEL[done.status]}, ${done.updated} updated, ${done.skipped} skipped, ${done.failed} failed, ${done.merged} duplicates merged.`);
    } catch (problem) {
      setSaving(false);
      const message = problem instanceof Error ? problem.message : "The import could not be saved.";
      setCommitError(message);
      announce(`Nothing was imported. ${message}`);
    }
  };

  // The server's own list of failed rows when it sent one (real mode), otherwise the preview's.
  const downloadErrors = () => {
    if (result?.errors) {
      const lines = [["row", "email", "reason"], ...result.errors.map((row) => [String(row.row), row.email, row.reason])];
      downloadTextFile(`ambassadors-import-errors.csv`, csvWithBom(toCsv(lines)));
    } else if (preview) downloadTextFile(`ambassadors-import-errors.csv`, buildErrorReportCsv(preview));
  };

  const stepper = (
    <ol className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1" aria-label="Import steps">
      {STEPS.map((label, index) => {
        const n = (index + 1) as Step;
        const state = n === step ? "current" : n < step ? "done" : "todo";
        return (
          <li key={label} aria-current={state === "current" ? "step" : undefined} className="flex items-center gap-2">
            <span
              className={
                state === "current"
                  ? "caption inline-flex size-6 items-center justify-center rounded-full bg-purple-600 font-semibold text-white"
                  : state === "done"
                    ? "caption inline-flex size-6 items-center justify-center rounded-full bg-purple-50 font-semibold text-purple-700"
                    : "caption inline-flex size-6 items-center justify-center rounded-full border border-line font-semibold"
              }
              aria-hidden="true"
            >
              {state === "done" ? "✓" : n}
            </span>
            <span className={state === "current" ? "caption font-semibold text-ink" : "caption"}>{label}</span>
          </li>
        );
      })}
    </ol>
  );

  const pictureNote = (
    <div className="flex gap-3 rounded-control bg-purple-50 p-3" data-testid="picture-note">
      <Info size={18} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 shrink-0 text-purple-700" />
      <p className="caption text-ink">
        <span className="font-semibold">Pictures:</span> the picture column holds Google Drive links, not images. They are saved as a source link and the
        list shows an initials avatar{" "}
        {isMockMode()
          ? "(sample data: nothing is copied). With live data the server copies each file into our own storage"
          : "until the server has copied each file into our own storage, shortly after the import"}
        . The files must be shared as <span className="font-semibold">&ldquo;Anyone with the link&rdquo;</span> for that to work.
      </p>
    </div>
  );

  let footer: ReactNode;
  if (step === 1) {
    footer = (
      <Button variant="secondary" onClick={onClose}>
        Cancel
      </Button>
    );
  } else if (step === 2) {
    footer = (
      <>
        {importable === 0 && (
          <p className="caption mr-auto" role="status">
            No row can be imported. Fix the file and upload it again.
          </p>
        )}
        <Button variant="secondary" onClick={() => go(1, "Choose a CSV file.")}>
          Back
        </Button>
        <Button disabled={importable === 0} onClick={() => go(3, "Choose what happens to people who already exist.")} data-testid="import-continue">
          Continue
        </Button>
      </>
    );
  } else if (step === 3) {
    footer = (
      <>
        <Button variant="secondary" onClick={() => go(2, "Review the rows.")} disabled={saving}>
          Back
        </Button>
        <Button loading={saving} disabled={importable === 0} onClick={confirmImport} data-testid="import-confirm">
          {`Import ${importable.toLocaleString("en-US")} ${importable === 1 ? "ambassador" : "ambassadors"}`}
        </Button>
      </>
    );
  } else {
    footer = (
      <>
        {result && result.failed > 0 && (
          <Button variant="secondary" onClick={downloadErrors} data-testid="download-error-report">
            Download error report
          </Button>
        )}
        <Button onClick={onClose} data-testid="import-done">
          Done
        </Button>
      </>
    );
  }

  return (
    <Dialog
      title="Import ambassadors"
      description="Upload a CSV, check it, then confirm. Nothing is saved until the last step."
      headerExtra={stepper}
      onClose={onClose}
      dismissable={!saving}
      size="xl"
      focusKey={step}
      testId="import-dialog"
      footer={footer}
    >
      <p className="sr-only" role="status" aria-live="polite" data-testid="import-announcement">
        {announcement}
      </p>

      {step === 1 && (
        <section aria-label="Upload" className="space-y-4">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={
              dragging
                ? "flex flex-col items-center gap-3 rounded-card border-2 border-dashed border-purple-500 bg-purple-50 px-6 py-10 text-center"
                : "flex flex-col items-center gap-3 rounded-card border-2 border-dashed border-input px-6 py-10 text-center"
            }
            data-testid="import-dropzone"
          >
            <FileUp size={28} strokeWidth={1.5} aria-hidden="true" className="text-purple-700" />
            <label htmlFor="ambassador-import-file" className="body-sm font-semibold text-ink">
              CSV file to import
            </label>
            <p className="caption">Drag a .csv file here, or choose one. Up to 5 MB. Excel files (.xlsx) are not supported: save as CSV first.</p>
            <input
              ref={inputRef}
              id="ambassador-import-file"
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              data-testid="import-file-input"
              onChange={(event) => {
                void handleFile(event.target.files?.[0]);
                event.target.value = ""; // choosing the same file again must work
              }}
            />
            <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={progress !== null || checking}>
              Choose a CSV file
            </Button>
          </div>

          {progress !== null && (
            <div role="status" aria-live="polite" data-testid="import-progress">
              <p className="caption mb-1">Reading {fileName}… {Math.round(progress * 100)}%</p>
              <div className="h-1.5 w-full rounded-full bg-neutral-soft" aria-hidden="true">
                <div className="h-1.5 rounded-full bg-purple-600 transition-[width] duration-150" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            </div>
          )}
          {checking && (
            <div role="status" aria-live="polite" className="space-y-2" data-testid="import-checking">
              <p className="caption">Checking every row…</p>
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          )}
          {error && (
            <div role="alert" className="flex gap-3 rounded-control bg-danger-soft p-3" data-testid="import-error">
              <XCircle size={18} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 shrink-0 text-danger" />
              <p className="caption text-danger">
                <span className="font-semibold">Could not use this file.</span> {error}
              </p>
            </div>
          )}

          <p className="body-sm">
            Not sure about the format?{" "}
            <button
              type="button"
              onClick={() => downloadTextFile("ambassadors-template.csv", templateCsv())}
              className="font-semibold text-purple-700 underline-offset-2 hover:underline"
              data-testid="download-template"
            >
              Download the template
            </button>
            . The original sign-up form sheet works too (Timestamp, Full Name, Email, Phone and WhatsApp number, Country, City, Picture, Biography).
          </p>
          {pictureNote}
        </section>
      )}

      {step === 2 && preview && counts && (
        <section aria-label="Preview" className="space-y-4">
          <p className="body-sm">
            <span className="font-semibold">{fileName}</span>: {counts.total.toLocaleString("en-US")} rows read.
            {ignored.length > 0 && <span className="caption block">Columns not used: {ignored.join(", ")}.</span>}
          </p>
          <p className="body-sm rounded-control bg-purple-50 p-3" data-testid="preview-status-note">
            New ambassadors will be created as <span className="font-semibold">{IMPORT_STATUS_LABEL[status]}</span>. You can change this in the next step.
            {hasStatusColumn && " The Status column in the file is ignored."}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" data-testid="import-counts">
            <MiniStat compact value={counts.valid} label="Valid" />
            <MiniStat compact value={counts.warnings} label="Warnings" />
            <MiniStat compact value={counts.errors} label="Errors" />
            <MiniStat compact value={counts.merged} label="Duplicates merged" caption="Latest kept" />
            <MiniStat compact value={counts.exists} label="Already exist" />
          </div>
          <SegmentedControl options={filterOptions} value={filter} onChange={setFilter} ariaLabel="Filter rows by status" />
          <DataTable
            label="Rows in the file"
            columns={makeColumns(status)}
            rows={visibleRows}
            getRowKey={(row) => String(row.rowNumber)}
            isFiltered={filter !== "all"}
            resetKey={filter}
            pageSize={8}
            emptyNoData={{ icon: FileUp, title: "No rows", description: "The file had no people in it." }}
            emptyNoResults={{ icon: FileUp, title: "No rows in this filter", description: "Choose another status, or All." }}
          />
          {pictureNote}
        </section>
      )}

      {step === 3 && counts && (
        <section aria-label="Options" className="space-y-4">
          {commitError && (
            <div role="alert" className="flex gap-3 rounded-control bg-danger-soft p-3" data-testid="import-commit-error">
              <XCircle size={18} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 shrink-0 text-danger" />
              <p className="body-sm text-ink">
                <span className="font-semibold">Nothing was imported.</span> {commitError}
              </p>
            </div>
          )}
          <div data-testid="status-choice">
            <p className="body-sm mb-2 font-semibold text-ink">Status for imported ambassadors</p>
            <SegmentedControl
              options={[
                { value: "active" as ImportStatus, label: "Active" },
                { value: "pending" as ImportStatus, label: "Pending" },
              ]}
              value={status}
              onChange={setStatus}
              ariaLabel="Status for imported ambassadors"
            />
            <p className="caption mt-2">
              {status === "active"
                ? "They are already ambassadors, so they start as Active. This is the default."
                : "They start as Pending, the same as a new application. An admin activates them later."}{" "}
              Any Status column in the file is ignored, and people who already exist keep their current status.
            </p>
          </div>
          <div>
            <p className="body-sm mb-2 font-semibold text-ink">When an email is already in the system</p>
            <SegmentedControl
              options={[
                { value: "skip" as ExistingChoice, label: "Skip", count: counts.exists },
                { value: "update" as ExistingChoice, label: "Update", count: counts.exists },
              ]}
              value={choice}
              onChange={setChoice}
              ariaLabel="What to do with emails that already exist"
            />
            <p className="caption mt-2">
              {choice === "skip"
                ? "Skip leaves the existing ambassador exactly as it is."
                : "Update fills in what the file has (name, phone, country, city, region, biography, picture link). The referral code, tier, training and joining date are kept."}
            </p>
          </div>
          <ul className="space-y-1 rounded-control bg-surface-2 p-4" data-testid="import-summary">
            <li className="body-sm">
              <span className="font-semibold">{willCreate.toLocaleString("en-US")}</span> new {willCreate === 1 ? "ambassador" : "ambassadors"} will be created as{" "}
              <span className="font-semibold">{IMPORT_STATUS_LABEL[status]}</span>
            </li>
            <li className="body-sm">
              <span className="font-semibold">{willUpdateOrSkip.toLocaleString("en-US")}</span> already {willUpdateOrSkip === 1 ? "exists" : "exist"} and will be{" "}
              {choice === "skip" ? "skipped" : "updated"}
            </li>
            <li className="body-sm">
              <span className="font-semibold">{counts.errors.toLocaleString("en-US")}</span> {counts.errors === 1 ? "row has" : "rows have"} an error and will be skipped
            </li>
            <li className="body-sm">
              <span className="font-semibold">{counts.merged.toLocaleString("en-US")}</span> older {counts.merged === 1 ? "submission is" : "submissions are"} merged into the latest one
            </li>
          </ul>
        </section>
      )}

      {step === 4 && result && (
        <section aria-label="Result" className="space-y-4" data-testid="import-result">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={20} strokeWidth={1.75} aria-hidden="true" className="text-success" />
            <p className="body-sm font-semibold text-ink">Import finished. The ambassadors are in the list now.</p>
          </div>
          <p className="body-sm" data-testid="result-status">
            New ambassadors were created as <span className="font-semibold">{IMPORT_STATUS_LABEL[result.status]}</span>. Existing ambassadors kept their status.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <MiniStat compact value={result.created} label="Created" />
            <MiniStat compact value={result.updated} label="Updated" />
            <MiniStat compact value={result.skipped} label="Skipped" />
            <MiniStat compact value={result.failed} label="Failed" />
            <MiniStat compact value={result.merged} label="Duplicates merged" />
          </div>
          {result.failed > 0 && <p className="caption">Rows that failed were not imported. Download the error report to see the line and the reason for each.</p>}
          {result.picturesQueued !== undefined && result.picturesQueued > 0 && (
            <p className="caption" data-testid="result-pictures">
              {result.picturesQueued} {result.picturesQueued === 1 ? "picture is" : "pictures are"} being copied from Google Drive. Each one shows on the
              ambassador once it has been copied.
            </p>
          )}
          {pictureNote}
        </section>
      )}
    </Dialog>
  );
}
