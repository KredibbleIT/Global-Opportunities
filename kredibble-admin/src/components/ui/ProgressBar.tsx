/**
 * ProgressBar: one thin bar on a soft track. The ONE bar for "how far along": the KPI progress to the monthly target (via TargetBar in
 * components/kpi/KpiStatus.tsx), and anything else that needs a plain bar. It sits BELOW a status badge (never inside it), so the badge
 * says the verdict in words and the bar shows how much of the target is done.
 *
 * Props:
 * - value: 0-1 (the share reached; capped at the full bar). null = unknown: an empty bar and no aria-valuenow
 * - tone: success | warning | danger | neutral | accent. The fill uses the same solid colours as the solid StatusBadge, so the two match
 * - label: the accessible name ("Verified records: progress to target"); valueText: what a screen reader hears ("72% of the target")
 * - tick: optional 0-1 marker (the month's pace: where the bar should be today)
 * - fillTestId / tickTestId: hooks for tests
 * role="progressbar" with aria-valuenow (omitted when value is null). The width is data-driven, so it is the one inline style here.
 */
import { cn } from "@/lib/cn";

const FILL = {
  success: "bg-success",
  warning: "bg-warning-solid",
  danger: "bg-danger",
  neutral: "bg-neutral-dot",
  accent: "bg-purple-500",
} as const;

export type ProgressTone = keyof typeof FILL;

interface ProgressBarProps {
  value: number | null;
  tone?: ProgressTone;
  label: string;
  valueText?: string;
  tick?: number | null;
  fillTestId?: string;
  tickTestId?: string;
  className?: string;
}

export function ProgressBar({ value, tone = "accent", label, valueText, tick, fillTestId, tickTestId, className }: ProgressBarProps) {
  const reached = value === null ? 0 : Math.min(1, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value === null ? undefined : Math.round(reached * 100)}
      aria-valuetext={valueText}
      className={cn("relative h-1.5 w-full rounded-pill bg-track", className)}
    >
      <div data-testid={fillTestId} className={cn("h-full rounded-pill", FILL[tone])} style={{ width: `${reached * 100}%` }} />
      {tick !== null && tick !== undefined ? (
        <span
          data-testid={tickTestId}
          aria-hidden="true"
          className="absolute -top-0.5 h-2.5 w-0.5 -translate-x-1/2 rounded-full bg-ink"
          style={{ left: `${Math.min(1, Math.max(0, tick)) * 100}%` }}
        />
      ) : null}
    </div>
  );
}
