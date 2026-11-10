"use client";

/**
 * NetworkSummary: the three numbers at the top of the Network page, as compact tiles with a caption (the same pattern as
 * the Partners and Programs summaries):
 *   Network size   everyone in the network, applicants included
 *   Active         ambassadors whose status is Active
 *   Activity rate  active ambassadors who logged at least one share THIS MONTH, divided by the active ones,
 *                  with the two numbers behind it in the caption ("14 of 25 active shared this month")
 * Mock mode: the maths is networkSummary() in services/network.ts over the sample data. Real mode: the server counts them
 * (loadNetworkSummary), loaded again each time the list loads. They count ALL ambassadors, so a filter does not move them.
 * With no active ambassador the rate is "—", never a made-up 0%. An empty network (GOD-T35) shows its 0 once, in Network size with
 * the next step, and "—" in the other two tiles instead of repeating the zero.
 *
 * Props:
 * - ambassadors, logs: what to count (mock mode), or null while the list loads (every tile then shows "—")
 * Test ids: network-summary, network-size, network-active, network-rate.
 */
import { useCallback } from "react";
import { MiniStat } from "@/components/ui/MiniStat";
import { loadNetworkSummary, networkSummary, type NetworkSummaryData } from "@/lib/services/network";
import { isMockMode } from "@/lib/services/mock-mode";
import { useAsync } from "@/lib/use-async";
import type { AmplificationLog, Ambassador } from "@/lib/mock-entities";

export function NetworkSummary({ ambassadors, logs }: { ambassadors: readonly Pick<Ambassador, "id" | "status">[] | null; logs: readonly Pick<AmplificationLog, "ambassadorId" | "at">[] }) {
  const live = !isMockMode();
  // Real mode: wait for the list, then ask the server; a new list (after a save or an import) asks again.
  const load = useCallback(
    (): Promise<NetworkSummaryData | null> => (live && ambassadors ? loadNetworkSummary() : Promise.resolve(null)),
    [live, ambassadors],
  );
  const { data: liveSummary } = useAsync(load);
  const summary = live ? liveSummary : ambassadors ? networkSummary(ambassadors, logs) : null;
  const rate = summary?.activityRate;
  const empty = summary !== null && summary !== undefined && summary.size === 0;
  return (
    <section aria-label="Network summary" data-testid="network-summary" className="grid gap-2 sm:grid-cols-3 sm:max-w-5xl">
      <div data-testid="network-size">
        <MiniStat compact value={summary ? summary.size : "—"} label="Network size" caption={summary ? (empty ? "Add or import ambassadors to start" : "All statuses") : undefined} />
      </div>
      <div data-testid="network-active">
        <MiniStat compact value={summary && !empty ? summary.active : "—"} label="Active" caption={summary && !empty ? `Of ${summary.size} in the network` : undefined} />
      </div>
      <div data-testid="network-rate">
        <MiniStat
          compact
          value={rate === undefined || rate === null ? "—" : `${Math.round(rate * 100)}%`}
          label="Activity rate"
          caption={summary && !empty ? (summary.active === 0 ? "no active ambassadors" : `${summary.sharedActive} of ${summary.active} active shared this month`) : undefined}
        />
      </div>
    </section>
  );
}
