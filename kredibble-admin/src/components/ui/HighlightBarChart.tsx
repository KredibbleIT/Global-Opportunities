"use client";

/**
 * HighlightBarChart: the "New submissions" chart from the design brief.
 * One bar per day; only the latest bar, or the hovered / keyboard-focused one,
 * is orange. Dashed gridlines, evenly spaced axis labels, a dark one-line
 * tooltip ("28 Sep 2026 · 6 submissions"), arrow-key navigation and a visually
 * hidden data table as the text alternative.
 *
 * Accessibility rule for the bars themselves (WCAG 1.4.11, 3:1 for graphics
 * needed to understand the content):
 * - 14 bars or fewer: the pale bars (#D5C6E3, 1.6:1) are kept for the look, and
 *   a small VALUE LABEL is printed above every bar, so the numbers never depend
 *   on seeing the pale colour.
 * - More than 14 bars (the 30-day view): labels would not fit, so the bars use
 *   the darker `chart-bar` colour (3.4:1 on white, 3.1:1 on surface-2) and only
 *   the highlighted bar carries a label.
 * The highlighted bar is also the only one with a bold label, so the highlight
 * is never colour alone.
 *
 * Props:
 * - data: [{ label, tooltipLabel?, value }] in time order (needs 2+ points).
 *   `label` is the short axis text ("Sep 18"); `tooltipLabel` the full date.
 * - ariaLabel: what the chart shows, e.g. "New submissions per day, last 14 days"
 * - unit: noun for the tooltip value, e.g. "submissions"
 * Axis labels are centred under their bars, including the first and last (the plot has right/left
 * padding for them instead of right-aligning the last label).
 * - axisMax: a FIXED top for the y axis (100 for a score out of 100: ticks at 0, 25, 50, 75, 100). Default: the data maximum, rounded up.
 * - height: CSS height class (default "h-chart", 260px), fixed so nothing shifts
 * - fill: draw at the container's measured height instead of 260px (never shorter), for a chart that fills a stretched card;
 *   pass a height class such as "min-h-chart flex-1" with it
 */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/cn";
import { niceAxis } from "./chart-axis";

interface BarPoint {
  label: string;
  tooltipLabel?: string;
  value: number;
}

interface HighlightBarChartProps {
  data: BarPoint[];
  ariaLabel: string;
  unit?: string;
  height?: string;
  axisMax?: number;
  fill?: boolean;
}

// Drawing-space constants (SVG user units = pixels). Top padding leaves room for value labels.
// Right padding keeps the LAST x label (centred under the last bar) from clipping: half of "Sep 30"
// at 12px is about 19px, and the last bar centre is only half a slot from the plot edge.
const HEIGHT = 260; // matches the default h-chart container
const PAD = { top: 28, right: 20, bottom: 28, left: 32 };
const GRID_LINES = 4;
const MAX_LABELLED_BARS = 14; // above this, labels do not fit and bars get the darker colour

export function HighlightBarChart({ data, ariaLabel, unit = "", height = "h-chart", axisMax, fill = false }: HighlightBarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [boxHeight, setBoxHeight] = useState(HEIGHT);
  const [active, setActive] = useState<number | null>(null);

  // Track the container width (and, with fill, its height) so the SVG always fills it.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
      setBoxHeight(entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (data.length < 2) return null;

  const lastIndex = data.length - 1;
  const highlighted = active ?? lastIndex; // the latest bar unless one is hovered / focused
  const labelAllBars = data.length <= MAX_LABELLED_BARS;

  // A whole 1, 2 or 5 step (chart-axis.ts), or four even steps up to a fixed axisMax.
  const axis = axisMax === undefined ? niceAxis(Math.max(...data.map((d) => d.value))) : { top: axisMax, lines: GRID_LINES };
  const yMax = axis.top;
  // The left padding grows with the widest axis label (a 5-digit number needs more room than "100"), so a label is never clipped.
  const pad = { ...PAD, left: Math.max(PAD.left, String(yMax).length * 7 + 14) };

  const innerW = Math.max(width - pad.left - PAD.right, 1);
  // With fill the container has contain: size, so its own classes (min-h-chart flex-1) set the height and the SVG never does: an SVG
  // sized from an earlier measurement would otherwise hold the box open at an old, taller height when the card should shrink.
  const chartHeight = fill ? Math.max(HEIGHT, Math.floor(boxHeight)) : HEIGHT;
  const innerH = chartHeight - PAD.top - PAD.bottom;
  const slot = innerW / data.length;
  const barW = Math.min(slot * 0.6, 28);
  const baseline = PAD.top + innerH;
  const bars = data.map((d, i) => {
    const h = (d.value / yMax) * innerH;
    return { x: pad.left + slot * i + (slot - barW) / 2, y: baseline - h, h, cx: pad.left + slot * i + slot / 2 };
  });

  // X labels: every bar up to 7, every 2nd up to 14, every 5th beyond. Counted back from the
  // LAST bar, so the axis always ends on the last date and the spacing is exactly even.
  const step = data.length <= 7 ? 1 : data.length <= 14 ? 2 : 5;
  const showLabel = (i: number) => (lastIndex - i) % step === 0;

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const index = Math.floor((event.clientX - rect.left - pad.left) / slot);
    setActive(Math.min(lastIndex, Math.max(0, index)));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const from = active ?? lastIndex;
    const moves: Record<string, number> = {
      ArrowLeft: Math.max(0, from - 1),
      ArrowRight: Math.min(lastIndex, from + 1),
      Home: 0,
      End: lastIndex,
    };
    if (event.key in moves) {
      event.preventDefault();
      setActive(moves[event.key]);
    } else if (event.key === "Escape") {
      setActive(null);
    }
  };

  const tip = active === null ? null : bars[active];

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label={`${ariaLabel}. Use the left and right arrow keys to read each bar.`}
      tabIndex={0}
      onPointerMove={onPointerMove}
      onPointerLeave={() => setActive(null)}
      onKeyDown={onKeyDown}
      onBlur={() => setActive(null)}
      className={cn("relative w-full rounded-control", fill && "[contain:size]", height)}
    >
      {width > 0 && (
        <svg width={width} height={chartHeight} aria-hidden="true" className="block">
          {/* Dashed gridlines + y labels */}
          {Array.from({ length: axis.lines + 1 }, (_, i) => {
            const y = PAD.top + (i / axis.lines) * innerH;
            return (
              <g key={i}>
                <line x1={pad.left} x2={width - PAD.right} y1={y} y2={y} strokeDasharray="4 4" className="stroke-line" />
                <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize={12} className="fill-muted">
                  {Math.round(yMax - (i / axis.lines) * yMax)}
                </text>
              </g>
            );
          })}

          {/* Bars */}
          {bars.map((bar, i) => (
            <rect
              key={i}
              x={bar.x}
              y={bar.y}
              width={barW}
              height={Math.max(bar.h, 2)} // a zero day still shows a stub so the slot is visible
              rx={4}
              className={i === highlighted ? "fill-orange-500" : labelAllBars ? "fill-chart-pale" : "fill-chart-bar"}
            />
          ))}

          {/* Value labels: above every bar when there are 14 or fewer, else only the highlighted bar */}
          {bars.map((bar, i) =>
            labelAllBars || i === highlighted ? (
              <text
                key={i}
                x={bar.cx}
                y={bar.y - 6}
                textAnchor="middle"
                fontSize={12}
                className={i === highlighted ? "fill-ink font-semibold" : "fill-muted"}
              >
                {data[i].value}
              </text>
            ) : null,
          )}

          {/* X labels */}
          {data.map((d, i) =>
            showLabel(i) ? (
              // Every label is centred under its bar (the chart has padding for the first and last).
              <text key={i} x={bars[i].cx} y={chartHeight - 6} textAnchor="middle" fontSize={12} className="fill-muted">
                {d.label}
              </text>
            ) : null,
          )}
        </svg>
      )}

      {/* Dark one-line tooltip. aria-live so keyboard users hear each value as they move. */}
      <div aria-live="polite" className="pointer-events-none absolute inset-x-0 top-0">
        {tip && active !== null && (
          <div
            className="badge-text absolute -translate-x-1/2 whitespace-nowrap rounded-inset bg-ink px-3 py-2 font-medium text-white shadow-pop"
            style={{ left: Math.min(Math.max(tip.cx, 90), width - 90), top: Math.max(tip.y - 52, 0) }}
          >
            {data[active].tooltipLabel ?? data[active].label} · {data[active].value} {unit}
          </div>
        )}
      </div>

      {/* Full data for screen readers. The sr-only class is on a WRAPPER: a <table> ignores overflow and height, so on the table itself it stayed a real box
          that stretched the page below the shell (and left the sticky sidebar a blank band at the bottom). */}
      <div className="sr-only">
      <table>
        <caption>{ariaLabel}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th scope="row">{d.tooltipLabel ?? d.label}</th>
              <td>
                {d.value} {unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
