"use client";

/**
 * SegmentedControl: a small set of mutually exclusive options (range picker,
 * status filter).
 *
 * Structure follows the WAI-ARIA radio-group pattern (the idea used by the
 * 21st.dev "Segmented Control" candidates): role="radiogroup", one tab stop
 * (roving tabindex), Arrow keys move AND select, Home/End jump to the ends.
 *
 * Look: an inset track (surface-2) with the selected segment raised as a white
 * pill with a purple border and purple-700 text. Purple marks selection;
 * orange is not used here.
 *
 * Props:
 * - options: [{ value, label, count? }]; a count is shown after the label in tabular numerals
 * - value: currently selected value
 * - onChange: called with the new value
 * - ariaLabel: accessible name for the group (required)
 *
 * When the options are wider than the space (a phone), the group scrolls sideways with no scrollbar and a soft fade
 * shows on each edge that has more options beyond it (the same affordance as Tabs). The scroll container carries
 * data-edge-fade, which the phone overflow test uses to tell a scroller with a fade from a real overflow.
 * The fade blends into the control's own track (surface-2) and carries a small chevron, so "there is more this way" is shown
 * by a shape as well as by a shade. When the selected option changes, the group scrolls so that option is fully in view.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

interface Option<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface SegmentedControlProps<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedControlProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  // Which edges have more options hidden beyond them (drives the fades).
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = () => {
    const el = listRef.current;
    if (!el) return;
    const start = el.scrollLeft > 1;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((current) => (current.start === start && current.end === end ? current : { start, end }));
  };

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Keep the selected option in view (the row scrolls sideways on a phone). Skipped on first render, and it only moves the
  // group's own scroll position, never the page.
  const firstRun = useRef(true);
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const list = listRef.current;
    const button = refs.current[optionsRef.current.findIndex((option) => option.value === value)];
    if (!list || !button) return;
    const margin = 28; // clears the edge fade
    if (button.offsetLeft - margin < list.scrollLeft) list.scrollTo({ left: Math.max(0, button.offsetLeft - margin), behavior: "smooth" });
    else if (button.offsetLeft + button.offsetWidth + margin > list.scrollLeft + list.clientWidth) {
      list.scrollTo({ left: button.offsetLeft + button.offsetWidth + margin - list.clientWidth, behavior: "smooth" });
    }
  }, [value]);

  const select = (index: number) => {
    const next = (index + options.length) % options.length; // wrap around
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const target: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: options.length - 1,
    };
    if (event.key in target) {
      event.preventDefault();
      select(target[event.key]);
    }
  };

  return (
    <div className="relative w-fit max-w-full">
    <div
      ref={listRef}
      role="radiogroup"
      aria-label={ariaLabel}
      data-edge-fade="true"
      onScroll={measure}
      className="no-scrollbar inline-flex w-fit max-w-full gap-1 overflow-x-auto rounded-control border border-line bg-surface-2 p-0.5"
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              "button-text h-10 shrink-0 rounded-inset border px-3 transition-colors max-sm:px-2.5 duration-150 ease-out",
              // Inactive segments keep a transparent border so nothing shifts when the selection changes.
              selected
                ? "border-purple-200 bg-surface text-purple-700 shadow-card"
                : "border-transparent text-muted hover:text-ink",
            )}
          >
            {option.label}
            {/* A real space keeps the accessible name readable: "All 4", not "All4". */}
            {option.count !== undefined && " "}
            {option.count !== undefined && (
              <span className={cn("badge-text ml-1", selected ? "text-purple-700" : "text-muted")}>{option.count}</span>
            )}
          </button>
        );
      })}
    </div>
      {/* Edge fades: shown only while more options are hidden on that side. Decorative. */}
      <span
        aria-hidden="true"
        data-testid="segmented-fade-start"
        className={cn("pointer-events-none absolute inset-y-0 left-0 z-10 flex w-8 items-center rounded-l-control bg-linear-to-r from-surface-2 from-40% to-transparent pl-1 text-muted transition-opacity", edges.start ? "opacity-100" : "opacity-0")}
      >
        <ChevronLeft size={16} strokeWidth={2} />
      </span>
      <span
        aria-hidden="true"
        data-testid="segmented-fade-end"
        className={cn("pointer-events-none absolute inset-y-0 right-0 z-10 flex w-8 items-center justify-end rounded-r-control bg-linear-to-l from-surface-2 from-40% to-transparent pr-1 text-muted transition-opacity", edges.end ? "opacity-100" : "opacity-0")}
      >
        <ChevronRight size={16} strokeWidth={2} />
      </span>
    </div>
  );
}
