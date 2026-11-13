"use client";

/**
 * ReferenceSuggestions (GOD-T59): entries people typed at registration that a list doesn't have yet.
 * They wait here until staff decide; until then only the person who typed them has them.
 *
 *   Suggested at registration                                   2 waiting
 *   Academic City University College   asked 3 times   [Approve] [Reject]
 *
 * Approve adds the entry to the list for everyone; Reject drops it. Shown only when the list has suggestions.
 *
 * Props: label ("Universities"), suggestions, busyLabel (the row being decided), onDecide(label, decision)
 */
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { ReferenceSuggestionApi } from "@/lib/api";

export type SuggestionDecision = "approve" | "reject";

interface ReferenceSuggestionsProps {
  label: string;
  suggestions: ReferenceSuggestionApi[];
  busyLabel: string | null;
  onDecide: (label: string, decision: SuggestionDecision) => void;
}

/** "13 Nov 2026" for the first time an entry was suggested. */
const formatDay = (value: string) =>
  new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function ReferenceSuggestions({ label, suggestions, busyLabel, onDecide }: ReferenceSuggestionsProps) {
  if (suggestions.length === 0) return null;

  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="card-title">Suggested at registration</h2>
        <p className="caption tabular-nums" aria-live="polite">
          {suggestions.length} waiting
        </p>
      </div>
      <p className="caption mb-4">
        People typed these {label.toLowerCase()} because the list didn&apos;t have them. Approve adds one to the list for
        everyone; Reject drops it.
      </p>

      <ul className="divide-y divide-line" aria-label={`Suggested ${label.toLowerCase()}`}>
        {suggestions.map((suggestion) => {
          const busy = busyLabel === suggestion.label;
          return (
            <li key={suggestion.label} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="break-words font-medium">{suggestion.label}</p>
                <p className="caption">
                  {suggestion.count === 1 ? "Asked once" : `Asked ${suggestion.count} times`} · first on{" "}
                  {formatDay(suggestion.firstSuggestedAt)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  icon={Check}
                  disabled={busyLabel !== null}
                  aria-label={`Approve ${suggestion.label}`}
                  onClick={() => onDecide(suggestion.label, "approve")}
                >
                  {busy ? "Saving..." : "Approve"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={X}
                  disabled={busyLabel !== null}
                  aria-label={`Reject ${suggestion.label}`}
                  onClick={() => onDecide(suggestion.label, "reject")}
                >
                  Reject
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
