"use client";

/**
 * TableToolbar: the row between a list page's header and its table.
 * A search field on the left (where the page has search) and a SegmentedControl
 * of filters (where the page has filters), each optionally with counts.
 *
 * Props:
 * - search: { value, onChange, placeholder, label } renders a 40px search input
 * - filters: { options: [{ value, label, count? }], value, onChange, label } renders the segmented
 *   control (label = its accessible name)
 * Either or both can be given; with neither (and no children) it renders nothing.
 * - children: ROW 2, left: secondary filters (a second SegmentedControl, FilterSelect dropdowns...); the row wraps.
 * - actions: ROW 2, right: the page's secondary actions (Export, Import, History...). The page's ONE primary action is not here: it
 *   sits beside the heading (PageHeader / ListPage `action`).
 * Layout: row 1 = search + status filter; row 2 = secondary filters + actions. Row 2 is not drawn when it is empty.
 *
 * FilterSelect: a Select that draws nothing when it has no real choice (only "All", or nothing), so a useless filter never shows.
 */
import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select, type SelectProps } from "@/components/ui/form/Select";

interface TableToolbarProps<F extends string> {
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    label: string;
  };
  filters?: {
    options: { value: F; label: string; count?: number }[];
    value: F;
    onChange: (value: F) => void;
    label: string;
  };
  children?: ReactNode;
  actions?: ReactNode;
  /** Keep `children` on row 1, beside the search (a page that is short of vertical space, like the Partners board). */
  inline?: boolean;
}

export function TableToolbar<F extends string>({
  search,
  filters,
  children,
  actions,
  inline = false,
}: TableToolbarProps<F>) {
  if (!search && !filters && !children && !actions) return null;

  return (
    <div className="flex flex-col gap-3">
      {(search || filters || (inline && children)) && (
        <div className="flex flex-wrap items-center gap-3">
          {search && (
            <div className="relative w-full max-w-sm">
              <Search
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                type="search"
                value={search.value}
                onChange={(event) => search.onChange(event.target.value)}
                placeholder={search.placeholder}
                aria-label={search.label}
                className="input-text h-10 w-full rounded-control border border-border-input bg-surface pl-9 pr-3 text-ink placeholder:text-muted"
              />
            </div>
          )}
          {filters && (
            <SegmentedControl
              options={filters.options}
              value={filters.value}
              onChange={filters.onChange}
              ariaLabel={filters.label}
            />
          )}
          {inline && children}
        </div>
      )}
      {((!inline && children) || actions) && (
        <div className="flex flex-wrap items-center gap-3">
          {!inline && children}
          {actions && (
            <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
              {actions}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** A filter dropdown that is hidden when it only offers "All" (or nothing): there is nothing to choose. */
export function FilterSelect<T extends string>(props: SelectProps<T>) {
  if (props.options.length <= 1) return null;
  return <Select className="w-fit" {...props} />;
}
