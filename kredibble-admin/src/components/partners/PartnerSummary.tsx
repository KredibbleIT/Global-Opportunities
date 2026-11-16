"use client";

/**
 * PartnerSummary: the three numbers at the top of the Partners board, as THREE equal white cards in one row (label, big figure, caption). The open-deal count lives ONLY here (the health card does not repeat it):
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
import { partnerSummary } from "@/lib/services/partners";
import type { Partner } from "@/lib/mock-entities";
import { pluralWord } from "@/lib/plural";

/** One white, bordered card: the label on top, the big figure, then the muted caption (the same look as the Partners reference design). */
function StatCard({ label, value, caption, testId }: { label: string; value: number | string; caption?: string; testId: string }) {
  return (
    <div data-testid={testId} className="flex h-full flex-col rounded-card border border-line bg-surface p-5">
      <p className="body-sm font-semibold text-ink">{label}</p>
      {/* ministat-value keeps the shared figure font; text-4xl/leading-none (important) make it the big figure of these cards */}
      <p className="ministat-value mt-2 text-4xl! leading-none!">{typeof value === "number" ? value.toLocaleString("en-US") : value}</p>
      {caption && <p className="caption mt-3">{caption}</p>}
    </div>
  );
}

export function PartnerSummary({ partners, target = null, className = "" }: { partners: readonly Pick<Partner, "stage" | "stageHistory">[] | null; target?: number | null; className?: string }) {
  const summary = partners ? partnerSummary(partners) : null;
  return (
    <section aria-label="Partners summary" data-testid="partner-summary" className={`grid grid-cols-1 gap-4 sm:grid-cols-3 ${className}`}>
      <StatCard testId="partner-summary-open" label="Open deals" value={summary ? summary.open : "—"} caption="Prospect to MOU" />
      <StatCard testId="partner-summary-closed" label="Closed this month" value={summary ? summary.closedThisMonth : "—"} caption={summary ? `${summary.closedTotal} closed in total` : undefined} />
      <StatCard
        testId="partner-summary-target"
        label="Next month's target"
        value={target === null ? "—" : target}
        caption={target === null ? undefined : `${pluralWord(target, "partner")} to onboard`}
      />
    </section>
  );
}
