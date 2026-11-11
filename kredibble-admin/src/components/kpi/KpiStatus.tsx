/**
 * KPI status UI: the one visual vocabulary for "how far is this number from where it should be".
 *
 * StatusChip: the SOLID StatusBadge (red "Off track", dark amber "At risk", green "On track", white label): the verdict in words,
 * never colour alone. Used by the Team report, the Scorecard and the Priorities panel.
 * TargetBar: the progress-to-target bar (ui/ProgressBar) with a thin tick where the month's pace is. It sits BELOW the chip and shows
 * the share of the monthly target. Used by Priorities, the Team report and the Scorecard rows.
 * CARD_STATUS_WORDS: the words on the chip (On track / At risk / Off track), from lib/status-map.
 */
import { ProgressBar, type ProgressTone } from "@/components/ui/ProgressBar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { KpiStatus } from "@/lib/kpi";
import type { KpiCardData } from "@/lib/services/dashboard-types";
import { KPI_STATUS_LABELS } from "@/lib/status-map";

/** The words on the chip: the one vocabulary of status-map.ts (On track, At risk, Off track). */
export const CARD_STATUS_WORDS: Record<KpiStatus, string> = KPI_STATUS_LABELS;

/** KPI status -> the StatusBadge tone and the ProgressBar tone. */
const TONE: Record<KpiStatus, { badge: "success" | "warning" | "danger"; bar: ProgressTone }> = {
  green: { badge: "success", bar: "success" },
  amber: { badge: "warning", bar: "warning" },
  red: { badge: "danger", bar: "danger" },
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
  // Unslop pass: the soft (tinted) chip, not the filled one. Filled red and amber chips on every row competed with the one thing
  // each card should say; the bar's colour and the chip's word still carry the verdict.
  return <StatusBadge status={status} tone={TONE[status].badge} label={CARD_STATUS_WORDS[status]} testId="kpi-status" dataStatus={status} className="h-6 px-2.5 py-0" />;
}

/** The progress-to-target bar: the fill is the share of the target reached (capped at the full bar), the tick is the month's pace. */
export function TargetBar({ card, label, showPace }: { card: KpiCardData; label: string; showPace: boolean }) {
  const percent = card.attainment === null ? null : Math.round(card.attainment * 100);
  const pace = showPace && card.prorated !== false && card.pace !== null && card.target ? Math.min(1, card.pace) : null;
  return (
    <ProgressBar
      value={card.attainment}
      tone={card.status ? TONE[card.status].bar : "neutral"}
      label={`${label}: progress to target`}
      valueText={percent === null ? "No target" : `${percent}% of the target`}
      tick={pace}
      fillTestId="kpi-bar-fill"
      tickTestId="kpi-pace-tick"
    />
  );
}
