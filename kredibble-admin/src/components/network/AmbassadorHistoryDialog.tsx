"use client";

/**
 * AmbassadorHistoryDialog: the audit trail of ambassador imports and exports (from the audit-log mock). Newest first. Each
 * entry shows when, who, what, and the numbers and filters behind it. Empty state when nothing has happened yet.
 *
 * Props: onClose, prefix? (which actions to list, "ambassadors." by default), title?, description?, emptyText?: the Team page reuses this
 * dialog with prefix "accounts." for the account history.
 */
import { useAuditLog } from "@/lib/services/audit-log";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { History } from "lucide-react";

const WHEN = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

interface HistoryProps {
  onClose: () => void;
  prefix?: string;
  title?: string;
  description?: string;
  emptyText?: string;
}

export function AmbassadorHistoryDialog({
  onClose,
  prefix = "ambassadors.",
  title = "Import and export history",
  description = "Every bulk import and export of ambassador data is recorded here.",
  emptyText = "Imports and exports appear here with who did them, when, and the filters used.",
}: HistoryProps) {
  const entries = useAuditLog().filter((entry) => entry.action.startsWith(prefix));
  return (
    <Dialog title={title} description={description} onClose={onClose} size="lg" testId="history-dialog">
      {entries.length === 0 ? (
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
