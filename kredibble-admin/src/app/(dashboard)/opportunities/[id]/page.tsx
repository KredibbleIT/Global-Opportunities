"use client";

/**
 * Opportunity detail (/opportunities/[id]): ONE route for both sources of the Opportunities queue.
 *   - A staff-curated listing (an id in the listings collection) shows CuratedListingDetail.
 *   - A hirer-submitted posting shows the review page below: approve and reject. They need edit access on
 *     opportunities_queue; a view-only role sees both buttons disabled with the standard tooltip.
 * Built on the shared detail template.
 *
 * Fields: type, title, company, location, status, Description, and for events / grants an Event Details or Grant
 * Details card (Date & Time, Category, Budget, Sector, each when present). Details: Posted, Deadline and Apply link
 * (always shown, "Not recorded" / "—" when missing, since a moderator checks both), Work type and Salary (when
 * present). Posted by (SEC-151): the
 * hirer's company, contact, email, phone and verification status. A rejected posting shows why first.
 * Actions: Approve and Reject side by side in the header (SEC-151). Approving vets and publishes the posting, so on the
 * API it reads Published. Rejecting asks for a reason and an optional note (RejectPostingDialog); the hirer is told
 * both in the app. While a decision saves, both buttons wait; a failed decision shows the server's message and leaves
 * the posting as it was.
 * Data: src/lib/services/opportunities.ts: mock postings (src/lib/mock-opportunities.ts) kept in the shared mock
 * store in mock mode, the admin API otherwise.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useMockCollection } from "@/lib/mock-store";
import { loadListing } from "@/lib/services/listings";
import { isMockMode } from "@/lib/services/mock-mode";
import { useRoles, VIEW_ONLY_TOOLTIP } from "@/components/access/RoleProvider";
import { CuratedListingDetail } from "@/components/opportunities/CuratedListingDetail";
import { Tooltip } from "@/components/ui/Tooltip";
import { Check, X } from "lucide-react";
import { formatDate } from "@/lib/format";
import { useBreadcrumbLabel } from "@/lib/breadcrumb-label";
import { opportunityTypeMeta } from "@/lib/opportunity-types";
import { decideOpportunity, isApprovedStatus, loadOpportunity, type Opportunity } from "@/lib/services/opportunities";
import type { PostingRejection } from "@/lib/api";
import { rejectionReasonLabel } from "@/lib/rejection-reasons";
import { MISSING } from "@/lib/services/api-helpers";
import { useDetailData } from "@/lib/use-detail-data";
import { RejectPostingDialog } from "@/components/opportunities/RejectPostingDialog";
import { DetailHeader } from "@/components/detail/DetailHeader";
import { DetailPage } from "@/components/detail/DetailPage";
import { DetailError, DetailNotFound, DetailSkeleton } from "@/components/detail/DetailStates";
import { InfoCard } from "@/components/detail/InfoCard";
import { Button } from "@/components/ui/Button";
import { KeyValueList } from "@/components/ui/KeyValueList";
import { RichText } from "@/components/ui/RichText";
import { MiniStat } from "@/components/ui/MiniStat";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TagPill } from "@/components/ui/TagPill";
import { useToast } from "@/components/ui/Toast";

/**
 * Which page an id opens. Mock mode: a curated listing is one in the shared store. Real mode (GOD-T31): curated listings live on the
 * server, so a direct link or a reload asks the API (loadListing answers only for a staff-curated record); anything else is a hirer's
 * posting, whose review page handles "not found" and errors itself.
 */
export default function OpportunityPage() {
  const { id } = useParams<{ id: string }>();
  const listings = useMockCollection("listings");
  const live = !isMockMode();
  const [liveKind, setLiveKind] = useState<{ id: string; curated: boolean } | null>(null);
  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    loadListing(id)
      .then((listing) => !cancelled && setLiveKind({ id, curated: Boolean(listing) }))
      .catch(() => !cancelled && setLiveKind({ id, curated: false }));
    return () => {
      cancelled = true;
    };
  }, [live, id]);
  if (!live) return listings.some((listing) => listing.id === id) ? <CuratedListingDetail id={id} /> : <HirerPostingReview />;
  if (!liveKind || liveKind.id !== id) return <DetailSkeleton />;
  return liveKind.curated ? <CuratedListingDetail id={id} /> : <HirerPostingReview />;
}

function HirerPostingReview() {
  const { id } = useParams<{ id: string }>();
  const { can } = useRoles();
  const canModerate = can("opportunities_queue", "edit");
  const load = useCallback(() => loadOpportunity(id), [id]);
  const { status, record: opp, setRecord, error, retry } = useDetailData<Opportunity>(load, { collection: "opportunities" });
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  useBreadcrumbLabel(status === "loading" ? undefined : opp ? opp.title : "Not found");

  if (status === "loading") return <DetailSkeleton />;
  if (status === "error") return <DetailError message={error ?? "Could not load this opportunity."} onRetry={retry} />;
  if (!opp) return <DetailNotFound noun="Opportunity" listLabel="Opportunities queue" listHref="/opportunities" />;

  const type = opportunityTypeMeta(opp.type);
  const hasExtraDetails = opp.eventDateTime || opp.eventCategory || opp.grantBudgetRange || opp.grantSector;
  const isRejected = opp.moderationStatus === "rejected";

  const approve = async () => {
    setSaving(true);
    try {
      const updated = await decideOpportunity(opp, "approve");
      setRecord(() => updated);
      toast.success(`${opp.title} from ${opp.company} was approved.`);
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not update this opportunity.");
    } finally {
      setSaving(false);
    }
  };

  /** Called by the dialog: it stays open with the server's message when the rejection is refused. */
  const reject = async (rejection: PostingRejection): Promise<{ ok: true } | { ok: false; reason: string }> => {
    setSaving(true);
    try {
      const updated = await decideOpportunity(opp, "reject", rejection);
      setRecord(() => updated);
      setRejecting(false);
      toast.success(`${opp.title} from ${opp.company} was rejected. The hirer was told why.`);
      return { ok: true };
    } catch (failure) {
      return { ok: false, reason: failure instanceof Error ? failure.message : "Could not update this opportunity." };
    } finally {
      setSaving(false);
    }
  };

  const approveButton = canModerate ? (
    <Button icon={Check} onClick={() => void approve()} disabled={isApprovedStatus(opp.moderationStatus) || saving}>
      Approve
    </Button>
  ) : (
    <Tooltip label={VIEW_ONLY_TOOLTIP}>
      <Button icon={Check} disabled>
        Approve
      </Button>
    </Tooltip>
  );
  const rejectButton = canModerate ? (
    <Button variant="danger" icon={X} onClick={() => setRejecting(true)} disabled={isRejected || saving}>
      Reject
    </Button>
  ) : (
    <Tooltip label={VIEW_ONLY_TOOLTIP}>
      <Button variant="danger" icon={X} disabled>
        Reject
      </Button>
    </Tooltip>
  );

  const hirer = opp.hirer;
  const applyLink = opp.applyUrl ? (
    <a href={opp.applyUrl} target="_blank" rel="noopener noreferrer" className="text-purple-700 hover:underline" data-testid="apply-link">
      {opp.applyUrl}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  ) : (
    MISSING
  );

  return (
    <>
      <DetailPage
        header={
          <DetailHeader
            leading={{ icon: type.icon }}
            eyebrow={<TagPill icon={type.icon}>{type.label}</TagPill>}
            title={opp.title}
            badges={<StatusBadge status={opp.moderationStatus} />}
            meta={`${opp.company} · ${opp.location}`}
            actions={
              <div className="flex flex-wrap items-center gap-2" data-testid="moderation-actions">
                {rejectButton}
                {approveButton}
              </div>
            }
          />
        }
        // Under the header at every width, so a phone shows why before the facts (the side column comes first there).
        notice={
          isRejected ? (
            <InfoCard title="Why it was rejected">
              <KeyValueList
                items={[
                  { label: "Reason", value: rejectionReasonLabel(opp.rejectionReason) ?? "No reason was recorded" },
                  { label: "Note to the hirer", value: opp.rejectionNote },
                  { label: "Rejected", value: opp.rejectedAt ? formatDate(opp.rejectedAt) : undefined },
                ]}
              />
            </InfoCard>
          ) : undefined
        }
        main={
          <>
            <InfoCard title="Description">
              <RichText text={opp.description} testId="posting-description" />
            </InfoCard>

            {hasExtraDetails && (
              <InfoCard title={opp.type === "events" ? "Event Details" : "Grant Details"}>
                <KeyValueList
                  items={[
                    { label: "Date & Time", value: opp.eventDateTime },
                    { label: "Category", value: opp.eventCategory },
                    { label: "Budget", value: opp.grantBudgetRange },
                    { label: "Sector", value: opp.grantSector },
                  ]}
                />
              </InfoCard>
            )}
          </>
        }
        side={
          <>
            <InfoCard title="Details">
              <KeyValueList
                items={[
                  { label: "Posted", value: formatDate(opp.date) },
                  { label: "Deadline", value: formatDate(opp.deadline) },
                  { label: "Apply link", value: applyLink },
                  { label: "Work type", value: opp.workType },
                  { label: "Salary", value: opp.salary },
                ]}
              />
            </InfoCard>
            <InfoCard title="Posted by">
              {hirer ? (
                <KeyValueList
                  items={[
                    { label: "Company", value: hirer.companyName },
                    { label: "Contact", value: hirer.recruiterName },
                    {
                      label: "Email",
                      value: hirer.email ? (
                        <a href={`mailto:${hirer.email}`} className="text-purple-700 hover:underline">
                          {hirer.email}
                        </a>
                      ) : (
                        MISSING
                      ),
                    },
                    {
                      label: "Phone",
                      value: hirer.phone ? (
                        <a href={`tel:${hirer.phone.replace(/\s+/g, "")}`} className="text-purple-700 hover:underline">
                          {hirer.phone}
                        </a>
                      ) : undefined,
                    },
                    { label: "Verification", value: <StatusBadge status={hirer.verificationStatus} testId="hirer-verification" /> },
                  ]}
                />
              ) : (
                <p className="input-text text-muted">No hirer account is linked to this posting.</p>
              )}
            </InfoCard>
            <InfoCard title="Activity">
              <MiniStat value={opp.applicantsCount} label="Applicants" />
            </InfoCard>
          </>
        }
      />
      {rejecting && <RejectPostingDialog posting={opp} onClose={() => setRejecting(false)} onReject={reject} />}
    </>
  );
}
