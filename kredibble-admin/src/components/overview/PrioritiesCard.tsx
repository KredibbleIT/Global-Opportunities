"use client";

/**
 * PrioritiesCard: the three KPIs furthest behind their pace, each as a bar toward the monthly target. "See all 10" shows every KPI
 * with a target (worst first) and "Show fewer" folds it back.
 *
 * Expanding never resizes the card, so nothing below it moves (Jerry, 2026-11-11: "Expanding a card shouldn't push other cards down
 * or stretch out the page"). The full list scrolls inside the space the three rows had:
 * the list keeps the height the collapsed rows had (measured before expanding), at every width. Beside it the Trend chart grows to
 * the row height, so the two cards end on one line.
 * A fade at the bottom says there is more to scroll until the end of the list is reached.
 *
 * The status is measured against the pace: the share of the target the month has earned so far (day 10 of 30 = a third). A KPI
 * with no target is left out (nothing to be behind). Colour is never the only signal: the status word and the percent are printed.
 *
 * Layout (Team performance pass, 2026-11-11): a tally of the whole month under the header (how many KPIs are off track, at risk and
 * on track), then one compact row per KPI: name and status chip, the bar with its pace tick, then "value of target" and the share
 * of where it should be today. What a KPI counts (its kpis.ts note) is the row's tooltip and appears in the Trend card when the KPI
 * is chosen. Each row is a button that shows its KPI in the Trend card (aria-pressed marks the one shown). The button is a stretched
 * overlay on the label, so the progress bar keeps its own role instead of being flattened inside a button.
 *
 * Props:
 * - cards: the ten KpiCardData, or null when unavailable
 * - loading: show the skeleton with the same size
 * - isPast: a past month (the bar has no pace tick)
 * - notConnected: real-API mode: "Not available yet" (not an error)
 * - selectedKpi / onSelectKpi: the KPI the Trend card shows, and the call that changes it
 */
import { useState, type CSSProperties } from "react";
import { ListChecks } from "lucide-react";
import { KPIS, type KpiKey } from "@/config/kpis";
import { cn } from "@/lib/cn";
import { useScrollFade } from "@/lib/use-scroll-fade";
import type { KpiStatus } from "@/lib/kpi";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { furthestBehind, paceAttainment, rankByPace } from "@/lib/services/dashboard";
import { formatAttainment } from "@/lib/scorecard";
import type { KpiCardData } from "@/lib/services/dashboard-types";
import { StatusChip, TargetBar } from "@/components/kpi/KpiStatus";
import { NotAvailableYet } from "./NotAvailableYet";
import { UnavailableNote } from "./UnavailableNote";

const format = (value: number) => value.toLocaleString("en-US");

/** The tally, worst first. The words are the chip's words in lower case, so the vocabulary stays one. */
const TALLY: { status: KpiStatus; word: string; dot: string }[] = [
  { status: "red", word: "off track", dot: "bg-danger-dot" },
  { status: "amber", word: "at risk", dot: "bg-warning-dot" },
  { status: "green", word: "on track", dot: "bg-success-dot" },
];

interface PrioritiesCardProps {
  cards: KpiCardData[] | null;
  loading: boolean;
  isPast: boolean;
  notConnected?: boolean;
  selectedKpi?: KpiKey;
  onSelectKpi?: (key: KpiKey) => void;
  className?: string;
}

/** The Priorities panel of the Overview's Team performance section. */
export function PrioritiesCard({ cards, loading, isPast, notConnected = false, selectedKpi, onSelectKpi, className }: PrioritiesCardProps) {
  const [all, setAll] = useState(false);
  const [collapsedHeight, setCollapsedHeight] = useState<number | null>(null);
  const ranked = cards ? rankByPace(cards) : [];
  const shown = all ? ranked : cards ? furthestBehind(cards) : [];

  // The fade at the bottom while more rows are below (shared with Recent activity).
  const { attach: attachList, element: listElement, onScroll: onListScroll, style: fadeStyle } = useScrollFade<HTMLUListElement>([all, shown.length]);

  const toggle = () => {
    // Remember the collapsed height before expanding: the full list scrolls inside it, so the card keeps its size.
    if (!all && listElement) setCollapsedHeight(listElement.offsetHeight);
    if (all) listElement?.scrollTo({ top: 0 });
    setAll((open) => !open);
  };
  const listStyle = (all && collapsedHeight ? { "--collapsed-list-h": `${collapsedHeight}px` } : {}) as CSSProperties;


  return (
    <Card as="section" ariaLabel="Priorities" testId="priorities-card" className={cn("flex flex-col", className)}>
      <CardHeader
        title="Priorities"
        subtitle={isPast ? "Furthest short of the full target first" : "Furthest behind today's pace first"}
      />
      {loading ? (
        <div className="space-y-5" aria-busy="true" aria-label="Loading priorities">
          <Skeleton className="h-4 w-2/3" />
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-1.5 w-full rounded-pill" />
              <Skeleton className="h-3.5 w-1/2" />
            </div>
          ))}
        </div>
      ) : notConnected ? (
        <NotAvailableYet icon={ListChecks} />
      ) : !cards ? (
        <UnavailableNote message="The priorities could not be loaded." />
      ) : shown.length === 0 ? (
        <EmptyState icon={ListChecks} title="No targets set" description="Set a monthly target in Settings and the KPIs furthest behind show here." />
      ) : (
        <>
          {/* The month at a glance: every KPI with a status, not only the rows shown. */}
          <p data-testid="priorities-tally" className="caption -mt-1 mb-3 flex flex-wrap gap-x-4 gap-y-1">
            {TALLY.map(({ status, word, dot }) => (
              <span key={status} className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className={cn("size-2 rounded-pill", dot)} />
                <span>
                  <span className="font-semibold tabular-nums text-ink">{cards.filter((card) => card.status === status).length}</span> {word}
                </span>
              </span>
            ))}
          </p>
          <ul
            ref={attachList}
            id="priorities-list"
            data-testid="priorities-list"
            onScroll={onListScroll}
            style={{ ...listStyle, ...fadeStyle }}
            className={cn("-mx-2 min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain", all && collapsedHeight && "h-(--collapsed-list-h) flex-none")}
          >
            {shown.map((card) => {
              const definition = KPIS[card.key];
              const attainment = paceAttainment(card);
              const selected = selectedKpi === card.key;
              return (
                <li
                  key={card.key}
                  data-testid="priority-row"
                  data-kpi={card.key}
                  data-selected={selected || undefined}
                  className={cn(
                    "relative rounded-inset px-2 py-2.5 transition-colors",
                    onSelectKpi && "hover:bg-neutral-soft has-[button:focus-visible]:bg-neutral-soft",
                    selected && "bg-purple-50 hover:bg-purple-50",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    {onSelectKpi ? (
                      <button
                        type="button"
                        aria-pressed={selected}
                        title={definition.note}
                        onClick={() => onSelectKpi(card.key)}
                        className="body-sm min-w-0 truncate rounded-inset text-left font-medium text-ink outline-none after:absolute after:inset-0 after:rounded-inset focus-visible:after:ring-2 focus-visible:after:ring-purple-500"
                      >
                        {definition.label}
                        <span className="sr-only">, show in the trend</span>
                      </button>
                    ) : (
                      <span title={definition.note} className="body-sm min-w-0 truncate font-medium text-ink">
                        {definition.label}
                      </span>
                    )}
                    <StatusChip status={card.status} />
                  </div>
                  <div className="mt-2.5">
                    <TargetBar card={card} label={definition.label} showPace={!isPast} />
                  </div>
                  <div className="caption mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className="tabular-nums">
                      <span className="font-semibold text-ink">{format(card.value ?? 0)}</span> of {format(card.target ?? 0)}
                    </span>
                    {attainment !== null && (
                      <span>
                        <span className="font-semibold tabular-nums text-ink">{formatAttainment(attainment).text}</span>
                        {` ${isPast ? "of the target" : "of where it should be today"}`}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {ranked.length > 3 && (
            <div className="mt-3 border-t border-line pt-3">
              <Button type="button" variant="ghost" size="sm" aria-expanded={all} aria-controls="priorities-list" onClick={toggle} className="-ml-3">
                {all ? "Show fewer" : `See all ${ranked.length}`}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
