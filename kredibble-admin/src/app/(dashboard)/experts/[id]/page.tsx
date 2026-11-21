"use client";

/**
 * Expert review: one seeker's application to be shown on the Expert listing, with the profile exactly as other people will see it.
 * Built on the shared detail template.
 *
 * Actions: pending -> Approve (goes live) or Reject (a short reason is required, the seeker reads it); approved -> Hide (a reason is
 * required, the seeker reads it); hidden -> Restore. Each asks for confirmation, then the server updates the listing and notifies the seeker.
 * Data: GET /admin/experts/:id (real API).
 */
import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import { Check, Eye, EyeOff, X } from "lucide-react";
import { approveExpert, getAdminExpertById, hideExpert, rejectExpert, unhideExpert, type ExpertApplicationRecord } from "@/lib/api";
import { useBreadcrumbLabel } from "@/lib/breadcrumb-label";
import { formatDate } from "@/lib/format";
import { useDetailData } from "@/lib/use-detail-data";
import { DetailHeader } from "@/components/detail/DetailHeader";
import { DetailPage } from "@/components/detail/DetailPage";
import { DetailError, DetailNotFound, DetailSkeleton } from "@/components/detail/DetailStates";
import { InfoCard } from "@/components/detail/InfoCard";
import { Button } from "@/components/ui/Button";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/form/Field";
import { Textarea } from "@/components/ui/form/Textarea";
import { KeyValueList } from "@/components/ui/KeyValueList";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TagPill } from "@/components/ui/TagPill";
import { useToast } from "@/components/ui/Toast";

export default function ExpertReviewPage() {
  const { id } = useParams<{ id: string }>();
  const load = useCallback(() => getAdminExpertById(id).catch((err: { status?: number }) => (err?.status === 404 ? undefined : Promise.reject(err))), [id]);
  const { status, record, setRecord, error, retry } = useDetailData<ExpertApplicationRecord>(load);
  const toast = useToast();
  const { confirm, dialog } = useConfirmDialog();

  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useBreadcrumbLabel(status === "loading" ? undefined : record ? record.name : "Not found");

  if (status === "loading") return <DetailSkeleton />;
  if (status === "error") return <DetailError message={error ?? "Could not load this expert."} onRetry={retry} />;
  if (!record) return <DetailNotFound noun="Expert" listLabel="Experts" listHref="/experts" />;

  const preview = record.preview;

  const decide = async (action: () => Promise<ExpertApplicationRecord>, success: string) => {
    setSaving(true);
    try {
      const updated = await action();
      setRecord((prev) => ({ ...prev, ...updated }));
      setNote("");
      toast.success(success);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save this decision.");
    } finally {
      setSaving(false);
    }
  };

  // Turning one down or hiding it needs a reason the seeker can act on.
  const needReason = () => {
    if (note.trim().length < 3) {
      setNoteError("Give a short reason so the person knows what to change.");
      return false;
    }
    setNoteError(null);
    return true;
  };

  const approve = () =>
    confirm({
      title: "Approve this expert?",
      description: (
        <>
          <strong className="text-ink">{record.name}</strong> goes on the Expert listing for every seeker and hirer in the app, and gets a notification.
        </>
      ),
      confirmLabel: "Approve",
      tone: "neutral",
      onConfirm: () => decide(() => approveExpert(record.id, note.trim() || undefined), `${record.name} is now on the Expert listing.`),
    });

  const reject = () => {
    if (!needReason()) return;
    confirm({
      title: "Reject this application?",
      description: (
        <>
          <strong className="text-ink">{record.name}</strong> reads your reason, can update their profile and apply again.
        </>
      ),
      confirmLabel: "Reject application",
      onConfirm: () => decide(() => rejectExpert(record.id, note.trim()), `${record.name}'s application was rejected.`),
    });
  };

  const hide = () => {
    if (!needReason()) return;
    confirm({
      title: "Hide this expert?",
      description: (
        <>
          <strong className="text-ink">{record.name}</strong> is taken off the Expert listing straight away and reads your reason. They cannot apply again until you restore them.
        </>
      ),
      confirmLabel: "Hide expert",
      onConfirm: () => decide(() => hideExpert(record.id, note.trim()), `${record.name} was taken off the Expert listing.`),
    });
  };

  const restore = () =>
    confirm({
      title: "Restore this expert?",
      description: (
        <>
          <strong className="text-ink">{record.name}</strong> goes back on the Expert listing.
        </>
      ),
      confirmLabel: "Restore",
      tone: "neutral",
      onConfirm: () => decide(() => unhideExpert(record.id), `${record.name} is back on the Expert listing.`),
    });

  const reasonField = (label: string, helper: string) => (
    <Field label={label} helper={helper} error={noteError ?? undefined}>
      <Textarea value={note} onChange={(e) => { setNote(e.target.value); setNoteError(null); }} rows={3} maxLength={500} />
    </Field>
  );

  const place = [record.city, record.country].filter(Boolean).join(", ");
  const contact = preview?.contact ?? {};

  return (
    <>
      <DetailPage
        header={
          <DetailHeader
            leading={{ name: record.name }}
            title={record.name}
            badges={<StatusBadge status={record.status} />}
            meta={`${record.email}${record.appliedAt ? ` · applied ${formatDate(record.appliedAt)}` : ""}`}
          />
        }
        main={
          <>
            {record.status === "pending" && (
              <InfoCard title="Decision" subtitle="Approving puts this profile on the Expert listing. Rejecting asks the person to improve it and apply again. Either way they get a notification.">
                <div className="space-y-4">
                  {reasonField("Reason (needed to reject)", "The person reads this, so say what to change. Optional when approving.")}
                  <div className="flex flex-wrap gap-3">
                    <Button icon={Check} onClick={approve} loading={saving} data-testid="expert-approve">
                      Approve
                    </Button>
                    <Button variant="danger" icon={X} onClick={reject} disabled={saving} data-testid="expert-reject">
                      Reject
                    </Button>
                  </div>
                </div>
              </InfoCard>
            )}
            {record.status === "approved" && (
              <InfoCard title="On the Expert listing" subtitle="Hiding takes the profile off the listing at once, for example after a report.">
                <div className="space-y-4">
                  {reasonField("Reason for hiding", "The person reads this.")}
                  <Button variant="danger" icon={EyeOff} onClick={hide} loading={saving} data-testid="expert-hide">
                    Hide from the listing
                  </Button>
                </div>
              </InfoCard>
            )}
            {record.status === "hidden" && (
              <InfoCard title="Hidden from the listing">
                <div className="space-y-4">
                  <KeyValueList items={[{ label: "Reason", value: record.reviewNote }, { label: "Decided", value: record.reviewedAt ? formatDate(record.reviewedAt) : undefined }]} />
                  <Button icon={Eye} onClick={restore} loading={saving} data-testid="expert-restore">
                    Put back on the listing
                  </Button>
                </div>
              </InfoCard>
            )}
            {record.status === "rejected" && (
              <InfoCard title="Rejected">
                <KeyValueList items={[{ label: "Reason", value: record.reviewNote }, { label: "Decided", value: record.reviewedAt ? formatDate(record.reviewedAt) : undefined }]} />
                <p className="caption mt-3">They can update their profile and apply again.</p>
              </InfoCard>
            )}

            <InfoCard title="Public profile" subtitle="What other people see in the app once this expert is approved.">
              {!preview ? (
                <p className="body-sm text-muted">Nothing to show yet.</p>
              ) : (
                <div className="space-y-4">
                  <KeyValueList
                    items={[
                      { label: "Profession", value: preview.profession },
                      { label: "Location", value: preview.location },
                      { label: "University", value: preview.university },
                      { label: "Experience level", value: preview.experienceLevel },
                    ]}
                  />
                  <TextBlock title="Bio" text={preview.bio} />
                  <TextBlock title="Professional summary" text={preview.professionalSummary} />
                  <TagBlock title="Technical skills" items={preview.technicalSkills} />
                  <TagBlock title="Soft skills" items={preview.softSkills} />
                  <TagBlock title="Tools" items={preview.tools} />
                  <TagBlock title="Certifications" items={preview.certifications} />
                  {preview.workExperience.length > 0 && (
                    <div>
                      <p className="caption mb-1 font-semibold text-ink">Work experience</p>
                      <ul className="space-y-2">
                        {preview.workExperience.map((job, index) => (
                          <li key={index} className="body-sm text-ink">
                            <strong>{job.role}</strong>
                            {[job.company, job.duration].filter(Boolean).length > 0 && <span className="text-muted"> · {[job.company, job.duration].filter(Boolean).join(" · ")}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {preview.education.length > 0 && (
                    <div>
                      <p className="caption mb-1 font-semibold text-ink">Education</p>
                      <ul className="space-y-1">
                        {preview.education.map((item, index) => (
                          <li key={index} className="body-sm text-ink">
                            {[item.degree, item.institution, item.duration].filter(Boolean).join(" · ")}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {preview.projects.length > 0 && (
                    <div>
                      <p className="caption mb-1 font-semibold text-ink">Projects</p>
                      <ul className="space-y-1">
                        {preview.projects.map((project, index) => (
                          <li key={index} className="body-sm text-ink">{project.name}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </InfoCard>
          </>
        }
        side={
          <>
            <InfoCard title="Seeker">
              <KeyValueList
                items={[
                  { label: "Email", value: record.email },
                  { label: "Profession", value: record.profession },
                  { label: "Location", value: place },
                  { label: "Joined the platform", value: record.joinedAt ? formatDate(record.joinedAt) : undefined },
                  { label: "Email verified", value: record.emailVerified === undefined ? undefined : record.emailVerified ? "Yes" : "No" },
                  { label: "Verified profile", value: record.verified ? "Yes" : "No" },
                  { label: "Rating", value: record.ratingCount > 0 ? `${record.rating.toFixed(1)} from ${record.ratingCount}` : "No ratings yet" },
                ]}
              />
            </InfoCard>
            <InfoCard title="Contact details shown" subtitle="Only what the seeker chose to share. Everything else stays private.">
              <KeyValueList
                items={[
                  { label: "Email", value: contact.email ?? "Not shown" },
                  { label: "Phone", value: contact.phone ?? "Not shown" },
                  { label: "Website", value: contact.website ?? "Not shown" },
                ]}
              />
            </InfoCard>
            {record.missing && record.missing.length > 0 && (
              <InfoCard title="Profile is thin" subtitle="Missing from their profile:">
                <p className="body-sm text-ink">{record.missing.join(", ")}</p>
              </InfoCard>
            )}
          </>
        }
      />
      {dialog}
    </>
  );
}

function TextBlock({ title, text }: { title: string; text?: string }) {
  if (!text) return null;
  return (
    <div>
      <p className="caption mb-1 font-semibold text-ink">{title}</p>
      <p className="body-sm whitespace-pre-wrap text-ink">{text}</p>
    </div>
  );
}

function TagBlock({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="caption mb-1 font-semibold text-ink">{title}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <TagPill key={item}>{item}</TagPill>
        ))}
      </div>
    </div>
  );
}
