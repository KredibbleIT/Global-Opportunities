"use client";

/**
 * ProRatingNote: the muted line explaining how status is judged, with a worked example in a tooltip.
 * For a past month it instead says which targets and thresholds applied.
 */
import { Info } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tooltip } from "@/components/ui/Tooltip";
import { formatMonth } from "@/lib/format";
import { monthProgress } from "@/lib/kpi";
import type { MonthKey } from "@/lib/mock-entities";

export function ProRatingNote({ month, isPast, loading }: { month: MonthKey; isPast: boolean; loading: boolean }) {
  if (loading) return <Skeleton className="h-4 w-80 max-w-full" />;
  if (isPast) {
    return (
      <p data-testid="pro-rating-note" className="caption">
        Showing the targets and thresholds that applied in {formatMonth(month)}
      </p>
    );
  }
  const { dayOfMonth, daysInMonth } = monthProgress(month);
  const expected = Math.round((12000 * dayOfMonth) / daysInMonth / 100) * 100;
  return (
    <p data-testid="pro-rating-note" className="caption flex flex-wrap items-center gap-x-1.5">
      Targets are monthly. Status compares each figure with where it should be by today.
      <Tooltip label={`Day ${dayOfMonth} of ${daysInMonth}: a 12,000 target expects about ${expected.toLocaleString("en-US")} by now. Running totals, such as Active ambassadors, are judged against the full target.`} wrap>
        <button type="button" aria-label="How status is worked out" data-testid="pro-rating-help" className="inline-flex size-6 items-center justify-center rounded-pill text-muted hover:text-ink">
          <Info size={14} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </Tooltip>
    </p>
  );
}
