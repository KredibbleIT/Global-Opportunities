/**
 * niceAxis: the y axis of the bar charts. The step between gridlines is a whole 1, 2 or 5 times a power of ten, and there are at
 * most `maxLines` steps above zero, so the labels read 0, 1, 2 (not 0, 1, 2, 3, 4 when the tallest bar is 2) and 0, 5,000, 10,000,
 * 15,000 (not 0, 2,625, 5,250...). The top is the first step at or above the data maximum, so the tallest bar nearly fills the chart.
 *
 * SEC-153 follow-up (2026-11-11): before, both charts rounded the maximum up to a multiple of four and always drew four steps.
 */
export interface ChartAxis {
  /** The value at the top gridline. */
  top: number;
  /** The number of steps above zero (gridlines = lines + 1, counting zero). */
  lines: number;
}

/** The axis for data whose largest value is `maxValue` (counts, so the step is never below 1). */
export function niceAxis(maxValue: number, maxLines = 4): ChartAxis {
  const max = Math.max(1, maxValue);
  const raw = max / maxLines;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map((multiple) => multiple * magnitude).find((candidate) => candidate >= raw) ?? 10 * magnitude);
  const lines = Math.ceil(max / step);
  return { top: lines * step, lines };
}
