/**
 * StatusBadge: pill with a coloured dot AND text (status is never shown by
 * colour alone). Tinted background, 12/16 600 text.
 * The tone and label come from `src/lib/status-map.ts`, the single mapping
 * file, so a status looks the same everywhere.
 *
 * Props:
 * - status: raw status string, e.g. "pending", "approved", "suspended"
 * - label: optional override for the displayed text
 * - tone: optional override for the tone (success | warning | danger | neutral | info)
 * - kind: "report" for the one word whose tone depends on context ("Open" report = warning)
 * - icon: optional lucide icon shown INSTEAD of the dot (e.g. a flag for flagged channels)
 * - variant: "soft" (default: tinted background, tone text, a dot) or "solid" (a filled pill with a WHITE label, no dot). Solid is the
 *   KPI verdict: green "On track", dark amber "At risk", red "Off track" (all 4.9:1 or better against the white label; the amber is
 *   --color-warning-solid, #a16207). Put a ProgressBar BELOW a solid badge to show the share of the target.
 * - testId / dataStatus: test hooks (the KPI chip uses "kpi-status" and the raw status)
 */
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { getStatusMeta, type StatusKind, type StatusTone } from "@/lib/status-map";

const TONE_CLASSES: Record<StatusTone, { pill: string; dot: string }> = {
  success: { pill: "bg-success-soft text-success", dot: "bg-success-dot" },
  warning: { pill: "bg-warning-soft text-warning", dot: "bg-warning-dot" },
  danger: { pill: "bg-danger-soft text-danger", dot: "bg-danger-dot" },
  neutral: { pill: "bg-neutral-soft text-neutral", dot: "bg-neutral-dot" },
  // In progress: purple-50 background, purple-700 text (9.7:1), purple dot. Dot plus text, never colour alone.
  info: { pill: "bg-purple-50 text-purple-700", dot: "bg-purple-600" },
};

/** The solid variant: a filled pill, white label (every pair is 4.9:1 or better). */
const SOLID_CLASSES: Record<StatusTone, string> = {
  success: "bg-success text-white",
  warning: "bg-warning-solid text-white",
  danger: "bg-danger text-white",
  neutral: "bg-neutral text-white",
  info: "bg-purple-700 text-white",
};

interface StatusBadgeProps {
  status: string;
  label?: string;
  tone?: StatusTone;
  kind?: StatusKind;
  icon?: LucideIcon;
  variant?: "soft" | "solid";
  testId?: string;
  dataStatus?: string;
  className?: string;
}

export function StatusBadge({ status, label, tone, kind, icon: Icon, variant = "soft", testId = "status-badge", dataStatus, className }: StatusBadgeProps) {
  const meta = getStatusMeta(status, kind);
  const resolved = tone ?? meta.tone;
  const styles = TONE_CLASSES[resolved];
  const solid = variant === "solid";

  return (
    <span data-testid={testId} data-status={dataStatus} className={cn("badge-text inline-flex w-fit items-center gap-2 rounded-pill px-3 py-1", solid ? SOLID_CLASSES[resolved] : styles.pill, className)}>
      {Icon ? (
        <Icon size={12} strokeWidth={2} aria-hidden="true" />
      ) : (
        !solid && <span aria-hidden="true" className={cn("size-2 rounded-full", styles.dot)} />
      )}
      {label ?? meta.label}
    </span>
  );
}
