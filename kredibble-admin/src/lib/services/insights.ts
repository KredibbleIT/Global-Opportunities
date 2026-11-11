/**
 * Data for Insights (/analytics), GOD-T29.
 *
 * The admin review asked for Insights' counts to be reconciled with the Overview and the queue pages. Insights used to build
 * every figure from the sample lists, in both modes, so its "Open reports" could not match the Overview or the Reports queue.
 * Now each figure comes from the same loader as the page it summarises, so they agree by construction:
 * - postings by type: loadOpportunityRows (the Opportunities queue's rows, curated and hirer-posted);
 * - verification by decision: loadVerificationRows (the Verification queue's rows);
 * - reports (open count and by reason): loadReportRows (the Reports queue's rows; the Overview counts the same open records);
 * - total applications: GET /admin/analytics (the server counts every application) in real mode; the sample seekers' counts
 *   in mock mode.
 * Mock mode reads the sample lists with this session's changes laid over them, so a decision made elsewhere shows here too.
 */
import { getAnalytics } from "@/lib/api";
import type { Report } from "@/lib/mock-reports";
import { seekerAccounts } from "@/lib/mock-seekers";
import { overlayRows } from "@/lib/mock-store";
import { loadVerificationRows, type VerificationRow } from "./lists";
import { isMockMode } from "./mock-mode";
import { loadOpportunityRows, type OpportunityRow } from "./opportunities";
import { loadReportRows } from "./reports";

export interface InsightsData {
  totalApplications: number;
  postings: OpportunityRow[];
  companies: VerificationRow[];
  reports: Report[];
}

/** Everything Insights shows. Rejects with the first error (the page shows it with Try again). */
export async function loadInsights(): Promise<InsightsData> {
  const [postings, companies, reports, totalApplications] = await Promise.all([
    loadOpportunityRows(),
    loadVerificationRows(),
    loadReportRows(),
    isMockMode()
      ? Promise.resolve(overlayRows("seekers", seekerAccounts).reduce((sum, seeker) => sum + seeker.applicationsCount, 0))
      : getAnalytics().then((summary) => summary.applications?.total ?? 0),
  ]);
  return { totalApplications, postings, companies, reports };
}
