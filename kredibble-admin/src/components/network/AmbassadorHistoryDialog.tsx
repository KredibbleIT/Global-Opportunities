"use client";

/**
 * AmbassadorHistoryDialog: the audit trail of ambassador imports and exports (from the audit-log mock). Newest first. Each
 * entry shows when, who, what, and the numbers and filters behind it. Empty state when nothing has happened yet.
 *
 * Props: onClose, prefix? (which actions to list, "ambassadors." by default), title?, description?, emptyText?: the Team page reuses this
 * dialog with prefix "accounts." for the account history. load? (real mode): reads the entries from the server instead of the
 * in-browser audit log, with a loading line and a retry on failure.
 */
import { useAuditLog, type AuditEntry } from "@/lib/services/audit-log";
import { useAsync } from "@/lib/use-async";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { History } from "lucide-react";

const noServerLoad = (): Promise<AuditEntry[] | null> => Promise.resolve(null);

const WHEN = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

interface HistoryProps {
  onClose: () => void;
  prefix?: string;
  title?: string;
  description?: string;
  emptyText?: string;
  load?: () => Promise<AuditEntry[]>;
}

export function AmbassadorHistoryDialog({
  onClose,
  prefix = "ambassadors.",
  title = "Import and export history",
  description = "Every bulk import and export of ambassador data is recorded here.",
  emptyText = "Imports and exports appear here with who did them, when, and the filters used.",
  load,
}: HistoryProps) {
  const local = useAuditLog();
  const server = useAsync<AuditEntry[] | null>(load ?? noServerLoad);
  const entries = (load ? server.data ?? [] : local).filter((entry) => entry.action.startsWith(prefix));
  return (
    <Dialog title={title} description={description} onClose={onClose} size="lg" testId="history-dialog">
      {load && server.isLoading ? (
        <p className="caption" role="status" data-testid="history-loading">
          Loading the history…
        </p>
      ) : load && server.error ? (
        <div role="alert" className="space-y-2" data-testid="history-error">
          <p className="body-sm text-ink">The history could not be loaded. {server.error.message}</p>
          <Button variant="secondary" onClick={server.reload}>
            Try again
          </Button>
        </div>
      ) : entries.length === 0 ? (
        <EmptyState icon={History} title="Nothing yet" description={emptyText} />
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-control border border-line p-4" data-testid="history-entry">
              <p className="body-sm font-semibold text-ink">{entry.summary}</p>
              <p className="caption mt-1">
                {WHEN.format(new Date(entry.at))} · {entry.actor}
              </p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                {Object.entries(entry.details).map(([key, value]) => (
                  <div key={key} className="contents">
                    <dt className="caption">{key}</dt>
                    <dd className="caption break-words text-ink">{String(value)}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
