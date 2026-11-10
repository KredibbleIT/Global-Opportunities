/**
 * KeyValueList: label / value rows for detail pages.
 *
 * In a card at least 24rem wide: a two-column grid with a FIXED 140px label column (Inter 12/16 muted) and the value
 * left-aligned right beside it (Inter 14/20). In a narrower card (a side column) each label sits ABOVE its value
 * (GOD-T38: the 140px column left a long email a few characters per line). The card's width decides (a container query),
 * not the window's. Values are never right-aligned away from their labels and are never truncated: long values wrap (and
 * long unbroken strings such as emails break instead of overflowing).
 *
 * Rendered as a real description list (<dl>), so screen readers announce each
 * label with its value.
 *
 * Props:
 * - items: [{ label, value }]. `value` can be text or a node (a link, a badge).
 *   Rows whose value is undefined, null or "" are skipped, which is how
 *   optional fields (Work Type, Salary, ...) stay optional.
 */
import type { ReactNode } from "react";

export interface KeyValueItem {
  label: string;
  value: ReactNode;
}

export function KeyValueList({ items }: { items: KeyValueItem[] }) {
  const visible = items.filter((item) => item.value !== undefined && item.value !== null && item.value !== "");

  return (
    <div className="@container">
      <dl data-testid="key-value-list" className="grid grid-cols-1 gap-x-4 @[24rem]:grid-cols-[140px_minmax(0,1fr)] @[24rem]:gap-y-3">
        {visible.map((item) => (
          <div key={item.label} className="contents">
            <dt className="caption pt-0.5">{item.label}</dt>
            <dd className="input-text mb-3 min-w-0 break-words text-left text-ink last:mb-0 @[24rem]:mb-0">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
