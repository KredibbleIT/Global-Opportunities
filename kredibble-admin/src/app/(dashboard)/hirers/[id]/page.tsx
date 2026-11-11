"use client";

/**
 * Hirer detail: one hirer / company account.
 * Built on the shared detail template.
 *
 * Fields: Recruiter, Recruiter Email, Joined, Active Postings, industry, location, verification
 * summary + status, and (when linked) the "Go to Verification Review" link.
 * Actions: Suspend account (danger zone, with a confirm dialog) and Reinstate account (header).
 * Data: services/directory.ts: mock accounts in mock mode (changes go to the shared mock store), the admin API
 * otherwise. Suspend and Reinstate save first and change the page only after the server agrees (SEC-147); a failed
 * save says so and leaves the status as it was. Suspending signs the recruiter out of every device and blocks sign-in.
 */
import { useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Ban, RotateCcw, ShieldCheck } from "lucide-react";
import { formatDate } from "@/lib/format";
import { useBreadcrumbLabel } from "@/lib/breadcrumb-label";
import type { AccountStatus } from "@/lib/mock-hirers";
import { loadHirer, saveHirerStatus } from "@/lib/services/directory";
import { getStatusMeta } from "@/lib/status-map";
import { useDetailData } from "@/lib/use-detail-data";
import { DangerZone } from "@/components/detail/DangerZone";
import { DetailHeader } from "@/components/detail/DetailHeader";
import { DetailPage } from "@/components/detail/DetailPage";
import { DetailError, DetailNotFound, DetailSkeleton } from "@/components/detail/DetailStates";
import { InfoCard } from "@/components/detail/InfoCard";
import { Button, buttonClasses } from "@/components/ui/Button";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { KeyValueList } from "@/components/ui/KeyValueList";
import { MiniStat } from "@/components/ui/MiniStat";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";

export default function HirerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const load = useCallback(() => loadHirer(id), [id]);
  const { status, record: hirer, setRecord, error, retry } = useDetailData(load, { collection: "hirers" });
  const toast = useToast();
  const { confirm, dialog } = useConfirmDialog();

  useBreadcrumbLabel(status === "loading" ? undefined : hirer ? hirer.companyName : "Not found");

  if (status === "loading") return <DetailSkeleton />;
  if (status === "error") return <DetailError message={error ?? "Could not load this hirer."} onRetry={retry} />;
  if (!hirer) return <DetailNotFound noun="Hirer" listLabel="Hirers directory" listHref="/hirers" />;

  const isActive = hirer.status === "active";

  // Saves first (real mode), then changes the page; a failed save leaves the status as it was and says so.
  const changeStatus = async (next: AccountStatus, done: string) => {
    try {
      const saved = await saveHirerStatus(hirer.id, next);
      setRecord((prev) => ({ ...prev, status: saved }));
      toast.success(`${hirer.companyName} was ${done}.`);
    } catch (saveError) {
      toast.error(saveError instanceof Error ? `The account could not be updated: ${saveError.message}` : "The account could not be updated.");
    }
  };

  const suspend = () =>
    confirm({
      title: "Suspend this account?",
      description: (
        <>
          <strong className="text-ink">{hirer.companyName}</strong> (recruiter {hirer.recruiterName}, {hirer.recruiterEmail}) will be
          signed out of every device and can&apos;t sign in until you reinstate the account.
        </>
      ),
      confirmLabel: "Suspend account",
      onConfirm: () => void changeStatus("suspended", "suspended"),
    });

  const reinstate = () => void changeStatus("active", "reinstated");

  return (
    <>
      <DetailPage
        header={
          <DetailHeader
            leading={{ name: hirer.companyName }}
            title={hirer.companyName}
            // Two badges: the verification summary, then the account status.
            badges={
              <>
                <StatusBadge status={hirer.verification} />
                <StatusBadge status={hirer.status} />
              </>
            }
            meta={`${hirer.industry} · ${hirer.location}`}
            actions={
              !isActive && (
                <Button variant="secondary" icon={RotateCcw} onClick={reinstate}>
                  Reinstate account
                </Button>
              )
            }
          />
        }
        main={
          <>
            <InfoCard title="Activity">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <MiniStat value={hirer.postingsCount} label="Active Postings" />
              </div>
            </InfoCard>

            {hirer.verification === "not_submitted" && (
              <InfoCard title="Verification">
                <p data-testid="verification-not-submitted" className="input-text text-ink">
                  This company has not submitted verification documents yet, so there is nothing to review.
                </p>
              </InfoCard>
            )}
            {hirer.linkedVerificationId && (
              <InfoCard title="Verification">
                <p className="input-text text-ink">
                  This company&apos;s verification documents are {getStatusMeta(hirer.verification).label.toLowerCase()}.
                </p>
                <Link href={`/verification/${hirer.linkedVerificationId}`} className={`${buttonClasses("secondary")} mt-4`}>
                  <ShieldCheck size={16} strokeWidth={1.75} aria-hidden="true" />
                  Go to Verification Review
                </Link>
              </InfoCard>
            )}
          </>
        }
        side={
          <InfoCard title="Details">
            <KeyValueList
              items={[
                { label: "Recruiter", value: hirer.recruiterName },
                { label: "Recruiter email", value: hirer.recruiterEmail },
                { label: "Joined", value: formatDate(hirer.joinedDate) },
              ]}
            />
          </InfoCard>
        }
        danger={
          isActive && (
            <DangerZone explanation="Signs this company's recruiter out of every device and blocks sign-in. You can reinstate the account at any time.">
              <Button variant="danger" icon={Ban} onClick={suspend}>
                Suspend account
              </Button>
            </DangerZone>
          )
        }
      />
      {dialog}
    </>
  );
}
