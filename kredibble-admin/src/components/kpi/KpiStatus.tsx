/**
 * KPI status UI: the one visual vocabulary for "how far is this number from where it should be".
 *
 * StatusChip: a pill with a dot plus the status word (never colour alone) — used by the Team report and the Scorecard.
 * TargetBar: the progress-to-target bar with a thin tick where the month's pace is — used by Priorities and the Scorecard rows. The Overview's Priorities panel shows the same judgement as coloured text (see STATUS_TEXT below and PrioritiesCard).
 * CARD_STATUS_WORDS: the words on the chip (On track / Behind / Off track), from lib/status-map.
 */
import { cn } from "@/lib/cn";
import type { KpiStatus } from "@/lib/kpi";
import type { KpiCardData } from "@/lib/services/dashboard-types";
import { KPI_STATUS_LABELS } from "@/lib/status-map";

/** The words on the chip: the one vocabulary of status-map.ts (On track, Behind, Off track). */
export const CARD_STATUS_WORDS: Record<KpiStatus, string> = KPI_STATUS_LABELS;

const CHIP: Record<KpiStatus, { pill: string; dot: string; bar: string }> = {
  green: { pill: "bg-success-soft text-success", dot: "bg-success-dot", bar: "bg-success-dot" },
  amber: { pill: "bg-warning-soft text-warning", dot: "bg-warning-dot", bar: "bg-warning-dot" },
  red: { pill: "bg-danger-soft text-danger", dot: "bg-danger-dot", bar: "bg-danger-dot" },
};

/** The status word as colour-coded text (never colour alone: the word is always printed). */
export const STATUS_TEXT: Record<KpiStatus, string> = {
  green: "text-success",
  amber: "text-warning",
  red: "text-danger",
};

export function StatusChip({ status }: { status: KpiStatus | null }) {
  if (!status) {
    return (
      <span data-testid="kpi-status" className="inline-flex h-6 w-fit items-center rounded-pill bg-neutral-soft px-2.5 text-xs font-semibold text-neutral">
        No target
      </span>
    );
  }
  const styles = CHIP[status];
  return (
    <span data-testid="kpi-status" data-status={status} className={cn("inline-flex h-6 items-center gap-1.5 rounded-pill px-2.5 text-xs font-semibold", styles.pill)}>
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", styles.dot)} />
      {CARD_STATUS_WORDS[status]}
    </span>
  );
}

/** The progress-to-target bar: the fill is the share of the target reached (capped at the full bar), the tick is the month's pace. */
export function TargetBar({ card, label, showPace }: { card: KpiCardData; label: string; showPace: boolean }) {
  const reached = card.attainment === null ? 0 : Math.min(1, Math.max(0, card.attainment));
  const status = card.status;
  return (
    <div
      role="progressbar"
      aria-label={`${label}: progress to target`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={card.attainment === null ? undefined : Math.round(card.attainment * 100)}
      aria-valuetext={card.attainment === null ? "No target" : `${Math.round(card.attainment * 100)}% of the target`}
      className="relative h-1.5 w-full rounded-pill bg-track"
    >
      <div data-testid="kpi-bar-fill" className={cn("h-full rounded-pill", status ? CHIP[status].bar : "bg-neutral-dot")} style={{ width: `${reached * 100}%` }} />
      {showPace && card.prorated !== false && card.pace !== null && card.target ? (
        <span
          data-testid="kpi-pace-tick"
          aria-hidden="true"
          className="absolute -top-0.5 h-2.5 w-0.5 -translate-x-1/2 rounded-full bg-ink"
          style={{ left: `${Math.min(1, card.pace) * 100}%` }}
        />
      ) : null}
    </div>
  );
}
