"use client";

/**
 * Grant detail: one grant's funding pool and its applications.
 * Built on the shared detail template.
 *
 * Fields: title, hirer, sector, funding pool (allocated, total, percent, remaining), and every
 * application (applicant, requested amount, status).
 * Actions: Approve (per pending application, disabled when the request exceeds what remains) and Reject
 * (per pending application, confirm dialog). Allocated is recalculated from approved applications.
 * Data: lib/services/grants.ts (SEC-157). Mock mode keeps changes in the shared store and counts an approved request as allocated.
 * Real mode reads the grant and its applications from the API and decides through PATCH /admin/grant-applications/:id; there an
 * application reserves its amount when it is made, so "allocated" includes requests awaiting a decision, approving never exceeds the
 * pool, and rejecting gives the amount back. A failed decision leaves the application as it was and says so.
 */
import { useCallback } from "react";
import { useParams } from "next/navigation";
import { Check, HandCoins, X } from "lucide-react";
import { useBreadcrumbLabel } from "@/lib/breadcrumb-label";
import { formatMoney } from "@/lib/format";
import type { GrantApplication } from "@/lib/mock-grant-ops";
import { allocatedFromApplications, approvalExceedsPool, decideGrantApplication, loadGrant, pendingIsReserved } from "@/lib/services/grants";
import { useDetailData } from "@/lib/use-detail-data";
import { DetailHeader } from "@/components/detail/DetailHeader";
import { DetailPage } from "@/components/detail/DetailPage";
import { DetailError, DetailNotFound, DetailSkeleton } from "@/components/detail/DetailStates";
import { InfoCard } from "@/components/detail/InfoCard";
import { Button } from "@/components/ui/Button";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { IconButton } from "@/components/ui/IconButton";
import { KeyValueList } from "@/components/ui/KeyValueList";
import { MiniStat } from "@/components/ui/MiniStat";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";

export default function GrantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const load = useCallback(() => loadGrant(id), [id]);
  const { status, record: grant, setRecord, error, retry } = useDetailData(load, { collection: "grants" });
  const toast = useToast();
  const { confirm, dialog } = useConfirmDialog();

  useBreadcrumbLabel(status === "loading" ? undefined : grant ? grant.title : "Not found");

  if (status === "loading") return <DetailSkeleton />;
  if (status === "error") return <DetailError message={error ?? "Could not load this grant."} onRetry={retry} />;
  if (!grant) return <DetailNotFound noun="Grant" listLabel="Grants" listHref="/grants" />;

  const money = (amount: number) => formatMoney(amount, grant.currency); // always with the currency code (USD 5,000)
  const pct = grant.fundingPool > 0 ? Math.round((grant.allocated / grant.fundingPool) * 100) : 0;
  const remaining = grant.fundingPool - grant.allocated;

  // Saves first; the page changes only once the server has the decision (allocated comes back with it).
  const decide = async (app: GrantApplication, next: Exclude<GrantApplication["status"], "pending">, done: string) => {
    try {
      const saved = await decideGrantApplication(grant, app.id, next);
      setRecord((prev) => {
        const applications = prev.applications.map((a) => (a.id === app.id ? { ...a, status: saved.status } : a));
        return { ...prev, applications, allocated: saved.allocated ?? allocatedFromApplications(applications) };
      });
      toast.success(done);
    } catch (saveError) {
      toast.error(saveError instanceof Error ? `The application could not be updated: ${saveError.message}` : "The application could not be updated.");
    }
  };

  const approve = (app: GrantApplication) =>
    void decide(app, "approved", `${app.applicantName}'s request for ${money(app.requestedAmount)} was approved.`);

  const reject = (app: GrantApplication) =>
    confirm({
      title: "Reject this application?",
      description: (
        <>
          <strong className="text-ink">{app.applicantName}</strong>&apos;s request for {money(app.requestedAmount)} from{" "}
          <strong className="text-ink">{grant.title}</strong> will be marked Rejected.
        </>
      ),
      confirmLabel: "Reject application",
      onConfirm: () => decide(app, "rejected", `${app.applicantName}'s request was rejected.`),
    });

  return (
    <>
      <DetailPage
        header={
          <DetailHeader
            leading={{ icon: HandCoins }}
            title={grant.title}
            badges={<StatusBadge status={grant.status} />}
            meta={`${grant.hirer} · ${grant.sector}`}
          />
        }
        main={
          <>
            <InfoCard title="Funding pool">
              <div className="h-3 overflow-hidden rounded-pill bg-surface-2" role="presentation">
                <div className="h-full rounded-pill bg-purple-600" style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>
              <p className="body-sm mt-2 text-muted">
                {money(grant.allocated)} allocated of {money(grant.fundingPool)} ({pct}%) · {money(remaining)} remaining
              </p>
              {pendingIsReserved() && (
                <p data-testid="grant-reservation-note" className="caption mt-1">
                  Includes requests awaiting a decision: each application holds its amount until it is rejected.
                </p>
              )}
            </InfoCard>

            <InfoCard title="Applications">
              {grant.applications.length === 0 ? (
                <p className="body-sm text-muted">No applications yet.</p>
              ) : (
                <ul className="space-y-3">
                  {grant.applications.map((app) => (
                    <li
                      key={app.id}
                      // Name | badge | actions. The badge is always in the same column, so it lines up on every row.
                      className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-3 rounded-control border border-line p-3 sm:grid-cols-[1fr_auto_auto]"
                    >
                      <div className="min-w-0">
                        <p className="body-sm break-words font-semibold text-ink">{app.applicantName}</p>
                        <p className="caption">Requested {money(app.requestedAmount)}</p>
                      </div>
                      <StatusBadge status={app.status} />

                      {/* 640px and up: compact icon buttons in a fixed-width column (empty on decided rows). */}
                      <div className="flex w-22 justify-end gap-2 max-sm:hidden">
                        {app.status === "pending" && (
                          <>
                            <IconButton
                              label={`Approve ${app.applicantName}`}
                              icon={Check}
                              tone="success"
                              disabled={approvalExceedsPool(grant, app)}
                              onClick={() => approve(app)}
                            />
                            <IconButton label={`Reject ${app.applicantName}`} icon={X} tone="danger" onClick={() => reject(app)} />
                          </>
                        )}
                      </div>

                      {/* Phones: a second row inside the card with labelled buttons, 44px tall. */}
                      {app.status === "pending" && (
                        <div className="col-span-2 grid grid-cols-2 gap-2 sm:hidden">
                          <Button
                            variant="secondary"
                            icon={Check}
                            className="h-11"
                            aria-label={`Approve ${app.applicantName}`}
                            disabled={approvalExceedsPool(grant, app)}
                            onClick={() => approve(app)}
                          >
                            Approve
                          </Button>
                          <Button variant="danger" icon={X} className="h-11" aria-label={`Reject ${app.applicantName}`} onClick={() => reject(app)}>
                            Reject
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </InfoCard>
          </>
        }
        side={
          <>
            <InfoCard title="Details">
              <KeyValueList
                items={[
                  { label: "Hirer", value: grant.hirer },
                  { label: "Sector", value: grant.sector },
                  { label: "Currency", value: grant.currency }, // the pool and what remains are in the Funding pool card: one place each
                ]}
              />
            </InfoCard>
            <InfoCard title="Activity">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-1 xl:grid-cols-2">
                <MiniStat value={grant.applications.length} label="Applications" />
                <MiniStat value={grant.applications.filter((a) => a.status === "pending").length} label="Pending" />
              </div>
            </InfoCard>
          </>
        }
      />
      {dialog}
    </>
  );
}
