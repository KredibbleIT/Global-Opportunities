/**
 * TagPill: a small purple-tinted pill for a label that is NOT a status (a staff
 * role, an opportunity type). Statuses use StatusBadge instead.
 * Purple-700 on purple-50 is 9.7:1.
 *
 * Props:
 * - children: the label
 * - icon: optional lucide icon before the label
 * - className: layout classes only (visibility, spacing)
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export function TagPill({ children, icon: Icon, className }: { children: ReactNode; icon?: LucideIcon; className?: string }) {
  // Never wider than its container: a long label ("Training and Capacity Development Officer") ends in an ellipsis instead of running
  // into the next column. Callers that can cut a label give the full text as a title or tooltip. Without an icon it stays one span.
  if (!Icon) {
    return <span className={cn("badge-text inline-block w-fit max-w-full shrink-0 truncate rounded-pill bg-purple-50 px-3 py-1 align-middle text-purple-700", className)}>{children}</span>;
  }
  return (
    <span className={cn("badge-text inline-flex w-fit max-w-full shrink-0 items-center gap-1.5 rounded-pill bg-purple-50 px-3 py-1 text-purple-700", className)}>
      <Icon size={12} strokeWidth={2} aria-hidden="true" className="shrink-0" />
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}
