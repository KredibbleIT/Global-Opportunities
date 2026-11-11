"use client";

/**
 * GroupedBarChart: two series side by side per month, with a legend ("Website", "App"). Dashed gridlines, evenly spaced axis
 * labels, a dark one-line tooltip ("Oct 2026 · Website 14,900 views · App 6,100 views"), arrow-key navigation and a visually
 * hidden data table as the text alternative.
 *
 * Missing data: a series with no figure for a month shows the words "No data" where its bar would be, and "No data" in the
 * hidden table — never a zero-height bar, which would read as zero views.
 *
 * Accessibility rule for the bars (WCAG 1.4.11, 3:1 for graphics needed to understand the content): there are at most 12 bars,
 * so a VALUE LABEL is printed above every bar and the numbers never depend on seeing the bar colour. The hovered / keyboard-focused
 * month's pair is full colour while the rest are pale; the focused pair's labels are bold, so the highlight is never colour alone.
 * Website is purple-500, App is orange-500; the legend dots match.
 *
 * Props:
 * - data: [{ label, tooltipLabel?, website, app }] in time order (needs 2+ points; `app` is null for "No data")
 * - ariaLabel: what the chart shows, e.g. "Views by platform, last six months"
 * - unit: noun for the tooltip value, e.g. "views"
 * Axis labels are centred under their month group. `height` sets the CSS height class (default "h-chart", 260px).
 */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/cn";

export interface GroupedBarPoint {
  /** Short axis text ("Oct"). */
  label: string;
  /** Full month for the tooltip and the hidden table ("October 2026"). */
  tooltipLabel?: string;
  /** Website views (0 when the month recorded nothing). */
  website: number;
  /** App views, or null when app analytics are not tracked for the month: the chart shows "No data". */
  app: number | null;
}

interface GroupedBarChartProps {
  data: GroupedBarPoint[];
  ariaLabel: string;
  unit?: string;
  height?: string;
}

const HEIGHT = 260; // matches the default h-chart container
const PAD = { top: 28, right: 20, bottom: 28, left: 32 };
const GRID_LINES = 4;
const BAR_GAP = 6;

const format = (value: number) => value.toLocaleString("en-US");

export function GroupedBarChart({ data, ariaLabel, unit = "", height = "h-chart" }: GroupedBarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  // Track the container width so the SVG always fills it.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (data.length < 2) return null;

  const lastIndex = data.length - 1;
  const highlighted = active ?? lastIndex;

  // Round the top of the y axis up to a multiple of GRID_LINES so ticks are whole numbers.
  const maxValue = Math.max(1, ...data.flatMap((d) => [d.website, d.app ?? 0]));
  const yMax = Math.ceil(maxValue / GRID_LINES) * GRID_LINES;
  // The left padding grows with the widest axis label (a 5-digit number needs more room than "100"), so nothing clips.
  const pad = { ...PAD, left: Math.max(PAD.left, String(format(yMax)).length * 7 + 14) };

  const innerW = Math.max(width - pad.left - PAD.right, 1);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const slot = innerW / data.length;
  const barW = Math.min((slot - BAR_GAP) / 2, 30);
  const baseline = PAD.top + innerH;

  const groups = data.map((d, i) => {
    const center = pad.left + slot * i + slot / 2;
    const half = barW + BAR_GAP / 2;
    return {
      website: { x: center - half, cx: center - half + barW / 2 },
      app: { x: center + BAR_GAP / 2, cx: center + BAR_GAP / 2 + barW / 2 },
      cx: center,
    };
  });

  const barHeight = (value: number) => (value / yMax) * innerH;

  // X labels: every month up to 7, every 2nd up to 14. Counted back from the LAST month, so the axis always ends on it.
  const step = data.length <= 7 ? 1 : 2;
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

  const activePoint = active === null ? null : data[active];
  const tip = active === null ? null : groups[active];

  const valueLabel = (value: number | null, x: number, y: number, key: string, bold: boolean) =>
    value === null ? null : (
      <text key={key} x={x} y={y} textAnchor="middle" fontSize={11} className={bold ? "fill-ink font-semibold" : "fill-muted"}>
        {format(value)}
      </text>
    );

  return (
    <div>
      <div
        ref={containerRef}
        role="group"
        aria-label={`${ariaLabel}. Use the left and right arrow keys to read each month.`}
        tabIndex={0}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setActive(null)}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
        className={cn("relative w-full rounded-control", height)}
      >
        {width > 0 && (
          <svg width={width} height={HEIGHT} aria-hidden="true" className="block">
            {/* Dashed gridlines + y labels */}
            {Array.from({ length: GRID_LINES + 1 }, (_, i) => {
              const y = PAD.top + (i / GRID_LINES) * innerH;
              return (
                <g key={i}>
                  <line x1={pad.left} x2={width - PAD.right} y1={y} y2={y} strokeDasharray="4 4" className="stroke-line" />
                  <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize={12} className="fill-muted">
                    {format(Math.round(yMax - (i / GRID_LINES) * yMax))}
                  </text>
                </g>
              );
            })}

            {data.map((d, i) => {
              const pairHighlighted = i === highlighted && active !== null;
              const dim = active !== null && !pairHighlighted;
              const websiteFill = dim ? "fill-chart-pale" : "fill-purple-500";
              const appFill = dim ? "fill-chart-pale" : "fill-orange-500";
              const websiteHeight = barHeight(d.website);
              const appHeight = d.app === null ? 0 : barHeight(d.app);
              return (
                <g key={i}>
                  {/* Website bar */}
                  <rect x={groups[i].website.x} y={baseline - websiteHeight} width={barW} height={Math.max(websiteHeight, 2)} rx={3} className={websiteFill} />
                  {valueLabel(d.website, groups[i].website.cx, baseline - websiteHeight - 6, `w-${i}`, pairHighlighted)}
                  {/* App bar, or the words "No data" where the bar would be */}
                  {d.app === null ? (
                    <text x={groups[i].app.cx} y={baseline - 10} textAnchor="middle" fontSize={11} className="fill-muted">
                      No data
                    </text>
                  ) : (
                    <>
                      <rect x={groups[i].app.x} y={baseline - appHeight} width={barW} height={Math.max(appHeight, 2)} rx={3} className={appFill} />
                      {valueLabel(d.app, groups[i].app.cx, baseline - appHeight - 6, `a-${i}`, pairHighlighted)}
                    </>
                  )}
                </g>
              );
            })}

            {/* X labels: centred under each month pair */}
            {data.map((d, i) =>
              showLabel(i) ? (
                <text key={i} x={groups[i].cx} y={HEIGHT - 6} textAnchor="middle" fontSize={12} className="fill-muted">
                  {d.label}
                </text>
              ) : null,
            )}
          </svg>
        )}

        {/* Dark one-line tooltip. aria-live so keyboard users hear each month as they move. */}
        <div aria-live="polite" className="pointer-events-none absolute inset-x-0 top-0">
          {tip && active !== null && activePoint && (
            <div
              className="badge-text absolute -translate-x-1/2 whitespace-nowrap rounded-inset bg-ink px-3 py-2 font-medium text-white shadow-pop"
              style={{ left: Math.min(Math.max(tip.cx, 110), width - 110), top: Math.max(baseline - Math.max(barHeight(activePoint.website), activePoint.app === null ? 0 : barHeight(activePoint.app)) - 52, 0) }}
            >
              {activePoint.tooltipLabel ?? activePoint.label} · Website {format(activePoint.website)} {unit} · App {activePoint.app === null ? "no data" : `${format(activePoint.app)} ${unit}`}
            </div>
          )}
        </div>

        {/* Full data for screen readers. The sr-only class is on a WRAPPER: a <table> ignores overflow and height. */}
        <div className="sr-only">
          <table>
            <caption>{ariaLabel}</caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">Website</th>
                <th scope="col">App</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={i}>
                  <th scope="row">{d.tooltipLabel ?? d.label}</th>
                  <td>
                    {format(d.website)} {unit}
                  </td>
                  <td>{d.app === null ? "No data" : `${format(d.app)} ${unit}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend: the series keys, with dots that match the bars. */}
      <div className="mt-2 flex items-center justify-center gap-4" data-testid="platform-legend">
        <span className="body-sm flex items-center gap-1.5 text-ink">
          <span aria-hidden="true" className="size-2.5 rounded-pill bg-purple-500" />
          Website
        </span>
        <span className="body-sm flex items-center gap-1.5 text-ink">
          <span aria-hidden="true" className="size-2.5 rounded-pill bg-orange-500" />
          App
        </span>
      </div>
    </div>
  );
}
