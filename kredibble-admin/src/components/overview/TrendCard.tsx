"use client";

/**
 * TrendCard: the last six months of ONE KPI as highlight bars (the newest bar is orange, every bar carries its value, and a
 * visually hidden data table is the text alternative). A Select over the ten KPIs picks which one; a Priorities row picks it too.
 * The page holds the choice (it lasts while the page is open), so both cards agree on which KPI is shown.
 *
 * The subtitle says what the KPI counts (its kpis.ts note), so a row picked in Priorities is explained here. On phones the header
 * stacks: the title and subtitle get the full width and the KPI select sits below at full width. Beside the Priorities card the chart
 * grows to the row's height (fill), so the two cards end on one line with no blank band.
 *
 * Props:
 * - trend: the six-month series of every KPI, or null when unavailable (the card says so and offers no chart)
 * - kpi / onKpiChange: the KPI shown, and the call that changes it
 * - loading: show the skeleton with the same size
 * - notConnected: real-API mode: "Not available yet" (not an error)
 */
import { useMemo } from "react";
import { LineChart } from "lucide-react";
import { KPI_KEYS, KPIS, type KpiKey } from "@/config/kpis";
import { cn } from "@/lib/cn";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { HighlightBarChart } from "@/components/ui/HighlightBarChart";
import { Select, type SelectOption } from "@/components/ui/form/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import type { TrendPoint } from "@/lib/services/dashboard-types";
import { NotAvailableYet } from "./NotAvailableYet";
import { UnavailableNote } from "./UnavailableNote";

const OPTIONS: SelectOption<KpiKey>[] = KPI_KEYS.map((key) => ({ value: key, label: KPIS[key].label }));

interface TrendCardProps {
  trend: Record<KpiKey, TrendPoint[]> | null;
  kpi: KpiKey;
  onKpiChange: (key: KpiKey) => void;
  loading: boolean;
  notConnected?: boolean;
  className?: string;
}

/** The six-month trend of the chosen KPI on the Overview. */
export function TrendCard({ trend, kpi, onKpiChange, loading, notConnected = false, className }: TrendCardProps) {
  const points = trend?.[kpi];
  const data = useMemo(() => points?.map((point) => ({ label: point.label, tooltipLabel: point.tooltipLabel, value: point.value })), [points]);
  const definition = KPIS[kpi];

  return (
    <Card as="section" ariaLabel="Trend" testId="trend-card" className={cn("flex flex-col", className)}>
      <CardHeader
        className="max-sm:flex-col max-sm:items-stretch"
        title="Trend"
        subtitle={`${definition.label} over the last six months: ${definition.note.charAt(0).toLowerCase()}${definition.note.slice(1)}`}
        action={
          loading || !trend ? undefined : (
            <Select<KpiKey> className="w-full sm:w-56" ariaLabel="KPI shown in the trend" sheetTitle="Choose a KPI" options={OPTIONS} value={kpi} onChange={onKpiChange} />
          )
        }
      />
      {loading ? (
        <div aria-busy="true" aria-label="Loading the trend">
          <Skeleton className="h-chart w-full rounded-control" />
        </div>
      ) : notConnected ? (
        <NotAvailableYet icon={LineChart} />
      ) : !data ? (
        <UnavailableNote message="The trend could not be loaded." />
      ) : data.every((point) => point.value === 0) ? (
        <EmptyState icon={LineChart} title="Nothing counted yet" description={`No ${definition.unit} in these six months.`} />
      ) : (
        <HighlightBarChart data={data} ariaLabel={`${definition.label}, last six months`} unit={definition.unit} height="min-h-chart flex-1" fill />
      )}
    </Card>
  );
}
