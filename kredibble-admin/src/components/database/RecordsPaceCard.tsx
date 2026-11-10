"use client";

/**
 * RecordsPaceCard: the card at the top of Database. Two halves side by side from 1024px, top-aligned, stacked below:
 *
 *   Verified this month                 [ Behind ]      Records by source
 *   9 of 15 verified                                    [██████ ███ ██ █ ██]   a mini segmented bar
 *   [██████████░░░░░░░░░░░]  one bar                     ● Organic 25  ● Ambassador referral 24 ...
 *   Expected by today: 11    one caption
 *
 * (GOD-T17, admin review: one total, one progress bar and one "expected by today" caption; the repeated Pace and Target figures, the
 * zone words and the pace tick are gone.) The numbers and the status are NOT worked out here: they come from recordsPace()
 * (services/database.ts), which uses kpiValue, kpiTarget and kpiStatus, the same functions as the Overview. The bar is a role="meter"
 * whose text value reads "9 of 15 verified, pro-rated pace 11, behind"; its fill is the share of the target (full once the target
 * is met) in the colour of the status badge, which says the status in words. The bar of sources is decorative; its legend carries
 * every number and percentage.
 *
 * Props:
 * - pace: the result of recordsPace(), or null while the records load (a skeleton, never a 0)
 * - sources: the counts by source (all records, whatever the list's filters say), or null while loading
 * - error / onRetry: when the records could not be loaded
 * Test ids: records-pace, pace-status, pace-headline, pace-bar, pace-bar-fill, pace-expected, pace-no-target, source-bar, source-legend,
 * source-legend-<source>.
 */
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";
import { RECORD_SOURCES, RECORD_SOURCE_LABELS } from "@/lib/mock-entities";
import { type PaceStatus, type RecordsPace, type SourceCount } from "@/lib/services/database";

/** The bar's fill follows the status badge (and the badge carries the words, so colour is never the only signal). */
const BAR_TONE: Record<PaceStatus, string> = { far_behind: "bg-danger-dot", behind: "bg-warning-dot", on_pace: "bg-success-dot" };

/** One style for each source: the bar segment and its legend dot always match. */
const SOURCE_STYLES: Record<(typeof RECORD_SOURCES)[number], string> = {
  organic: "bg-purple-500",
  ambassador: "bg-orange-500",
  event: "bg-purple-300",
  partner: "bg-orange-100 border border-orange-500",
  import: "bg-neutral-400",
};

interface RecordsPaceCardProps {
  pace: RecordsPace | null;
  sources: SourceCount[] | null;
  error?: string | null;
  onRetry?: () => void;
}

function SourceBar({ sources }: { sources: SourceCount[] }) {
  const total = sources.reduce((sum, entry) => sum + entry.count, 0);
  return (
    <div>
      {/* The same row height as "Verified this month" and its badge, so the two titles line up (GOD-T17). */}
      <div className="flex min-h-7 items-center">
        <h3 className="font-display text-sm font-bold leading-5 text-ink">Records by source</h3>
      </div>
      {total === 0 ? (
        <p data-testid="source-empty" className="caption mt-2">Nothing to chart yet.</p>
      ) : (
        <>
          <div aria-hidden="true" data-testid="source-bar" className="mt-2 flex h-2 gap-0.5 overflow-hidden rounded-pill">
            {sources
              .filter((entry) => entry.count > 0)
              .map((entry) => (
                <span key={entry.source} data-testid={`source-segment-${entry.source}`} className={cn("h-full", SOURCE_STYLES[entry.source])} style={{ flexGrow: entry.count, flexBasis: 0 }} />
              ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The legend of the source bar: a compact row of items, left-aligned, wrapping, with a 16px gap between them (it is not spread
 * across the card). Every item is ONE line: a dot, the label, the count and the percentage. Five fit on one row only where the
 * card is wide enough (about 1440px); otherwise the row wraps.
 */
function SourceLegend({ sources }: { sources: SourceCount[] }) {
  const total = sources.reduce((sum, entry) => sum + entry.count, 0);
  if (total === 0) return null;
  const percent = (count: number) => Math.round((count / total) * 100);
  return (
    <ul data-testid="source-legend" className="flex flex-wrap justify-start gap-x-4 gap-y-1.5 lg:col-span-2">
      {sources.map((entry) => (
        <li key={entry.source} data-testid={`source-legend-${entry.source}`} className="caption flex items-center gap-1.5 whitespace-nowrap">
          <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-pill", SOURCE_STYLES[entry.source])} />
          <span className="text-ink">
            {RECORD_SOURCE_LABELS[entry.source]}
          </span>
          <span className="shrink-0 tabular-nums">
            {entry.count} · {percent(entry.count)}%
          </span>
        </li>
      ))}
    </ul>
  );
}

export function RecordsPaceCard({ pace, sources, error, onRetry }: RecordsPaceCardProps) {
  if (error) {
    return (
      <Card as="section" ariaLabel="Verification pace" padding="sm" className="flex flex-wrap items-center justify-between gap-3 py-3">
        <p role="alert" className="body-sm text-danger">{error}</p>
        {onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        )}
      </Card>
    );
  }
  if (!pace || !sources) {
    return (
      <Card as="section" ariaLabel="Verification pace" padding="sm" className="grid gap-4 py-3 lg:grid-cols-2" testId="records-pace">
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-3 w-full" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      </Card>
    );
  }

  return (
    <Card as="section" ariaLabel="Verification pace" padding="sm" className="grid gap-x-8 gap-y-4 py-3 lg:grid-cols-2" testId="records-pace">
      <div className="space-y-1.5">
        <div className="flex min-h-7 items-center justify-between gap-2">
          <h2 className="font-display text-sm font-bold leading-5 text-ink">Verified this month</h2>
          {/* The thresholds behind the status ("Off track: below 70% of the pro-rated pace...") on hover and focus. */}
          <Tooltip label={pace.hint}>
            <span data-testid="pace-status" tabIndex={0} className="rounded-pill focus-visible:outline-2 focus-visible:outline-offset-2">
              <StatusBadge status={pace.status} />
            </span>
          </Tooltip>
        </div>
        {pace.target > 0 ? (
          <>
            <p data-testid="pace-headline" className="font-display text-xl font-extrabold leading-6.5 text-ink">
              {pace.verified} of {pace.target} verified
            </p>
            {/* GOD-T17: one bar (the share of the month's target verified so far) and one caption. The status badge above says
                whether that is on pace; the pace and target are not repeated as separate figures. */}
            <div
              role="meter"
              aria-label="Records verified this month"
              aria-valuemin={0}
              aria-valuemax={pace.target}
              aria-valuenow={pace.verified}
              aria-valuetext={pace.text}
              data-testid="pace-bar"
              className="h-2 overflow-hidden rounded-pill bg-surface-2"
            >
              <div data-testid="pace-bar-fill" className={cn("h-full rounded-pill", BAR_TONE[pace.status])} style={{ width: `${Math.min(100, (pace.verified / pace.target) * 100)}%` }} />
            </div>
            <p data-testid="pace-expected" className="caption tabular-nums">
              Expected by today: {pace.paceRounded}
            </p>
          </>
        ) : (
          <p data-testid="pace-no-target" className="body-sm text-muted">
            No target is set for this month, so there is no pace to judge. {pace.verified} verified so far.
          </p>
        )}
      </div>
      <SourceBar sources={sources} />
      <SourceLegend sources={sources} />
    </Card>
  );
}
