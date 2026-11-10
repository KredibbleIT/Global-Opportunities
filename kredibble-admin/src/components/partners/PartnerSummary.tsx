"use client";

/**
 * PartnerSummary: the three numbers at the top of the Partners board, as THREE SEPARATE, aligned MiniStats (the same pattern as
 * ProgramSummary on the Programs page). The open-deal count lives ONLY here (the health card does not repeat it):
 *   Open deals         deals in Prospect, Outreach, Proposal or MOU right now        caption "Prospect to MOU"
 *   Closed this month  partners that moved into Onboard or Renew this calendar month  caption "5 closed in total" (everyone
 *                      now in Onboarded or Renewed)
 *   Next month's target  the "Partners onboarded" target for next month (a "—" while it loads)
 * The counts come from partnerSummary() in services/partners.ts, so this is the one place they are worked out.
 * They count ALL partners, so a filter on the board does not move them. The tiles are compact (the number beside its
 * label and caption), so two of them stacked are barely taller than the health card next to them.
 *
 * Props:
 * - partners: the partners to count, or null while they load (both stats then show "—", never 0)
 * - target: next month's "Partners onboarded" target, or null while it loads
 * - className?: layout classes for the strip
 * Test ids: partner-summary, partner-summary-open, partner-summary-closed, partner-summary-target.
 */
import { MiniStat } from "@/components/ui/MiniStat";
import { partnerSummary } from "@/lib/services/partners";
import type { Partner } from "@/lib/mock-entities";
import { pluralWord } from "@/lib/plural";

export function PartnerSummary({ partners, target = null, className = "" }: { partners: readonly Pick<Partner, "stage" | "stageHistory">[] | null; target?: number | null; className?: string }) {
  const summary = partners ? partnerSummary(partners) : null;
  return (
    <section aria-label="Partners summary" data-testid="partner-summary" className={`grid grid-cols-1 gap-2 sm:grid-cols-3 ${className}`}>
      <div data-testid="partner-summary-open">
        <MiniStat value={summary ? summary.open : "—"} label="Open deals" caption="Prospect to MOU" compact />
      </div>
      <div data-testid="partner-summary-closed">
        <MiniStat value={summary ? summary.closedThisMonth : "—"} label="Closed this month" caption={summary ? `${summary.closedTotal} closed in total` : undefined} compact />
      </div>
      <div data-testid="partner-summary-target">
        <MiniStat value={target === null ? "—" : target} label="Next month's target" caption={target === null ? undefined : `${pluralWord(target, "partner")} to onboard`} compact />
      </div>
    </section>
  );
}
