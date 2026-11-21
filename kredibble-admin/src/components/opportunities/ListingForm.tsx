"use client";

/**
 * ListingForm: create (/opportunities/new) or edit (/opportunities/[id]/edit) a STAFF-CURATED listing. Hirer-submitted
 * postings are not edited here; they keep their approve / reject detail page.
 * Built on the shared form system (src/components/ui/form).
 *
 * Sections (FormSection):
 *   Basic details       title, description, offering organisation, organisation logo, opportunity type
 *   Logistics           application deadline, official application link, cost or fee label, format, location,
 *                       country, optional event date and time, duration label
 *   Media and attribution  featured image, assigned writer, "Referral code on apply" switch
 *   Vetting checkpoint  (VettingCheckpoint, a distinct warning-tinted card) vetted, vetted by, vetted on
 * Actions in the StickyActionBar:
 *   - New listing or a draft: "Save draft" (always allowed, vetted or not) and "Publish" (DISABLED until Vetted is
 *     checked; the reason shows next to it and in a tooltip). Publishing sets the status to published and the
 *     published date.
 *   - A published listing: "Save changes" (still needs Vetted).
 * Validation: required fields are those without an "Optional" tag. Errors show after a field is left and on submit; the
 * first invalid field takes focus. The application link must be a valid http(s) URL. On publish the deadline must not be
 * in the past. Leaving with unsaved changes asks first.
 * Data: services/listings.ts (shared mock store). Each save carries a TODO(backend).
 *
 * Props: listing? (the listing being edited; omit for a new one)
 */
import { useMemo, useRef, useState, type FormEvent } from "react";
import { LISTING_COUNTRIES } from "@/config/countries";
import { LISTING_FORMATS, type Listing, type ListingFormat, type ListingType } from "@/lib/mock-entities";
import { CATEGORY_DETAILS, FUNDING_LABELS, OPPORTUNITY_CATEGORIES } from "@/lib/opportunity-types";
import { createListing, currentStaffMember, listingStaff, todayIsoDate, updateListing, type ListingFields } from "@/lib/services/listings";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/form/Field";
import { FileDrop } from "@/components/ui/form/FileDrop";
import { FormSection } from "@/components/ui/form/FormSection";
import { DatePicker } from "@/components/ui/form/DatePicker";
import { DateTimeField } from "@/components/ui/form/DateTimeField";
import { Input } from "@/components/ui/form/Input";
import { Select, type SelectOption } from "@/components/ui/form/Select";
import { StickyActionBar } from "@/components/ui/form/StickyActionBar";
import { Switch } from "@/components/ui/form/Switch";
import { RichTextEditor } from "@/components/ui/form/RichTextEditor";
import { focusFirstInvalid, useTouched } from "@/components/ui/form/use-touched";
import { useUnsavedGuard } from "@/components/ui/form/use-unsaved-guard";
import { useToast } from "@/components/ui/Toast";
import { VettingCheckpoint } from "./VettingCheckpoint";

const LIST_HREF = "/opportunities";
const NONE = "none";

export const TYPE_LABELS: Record<ListingType, string> = {
  job: "Job",
  internship: "Internship",
  scholarship: "Scholarship",
  fellowship: "Fellowship",
  grant: "Grant",
  event: "Event",
  volunteer: "Volunteering",
  training: "Training",
  mentorship: "Mentorship",
};
const FORMAT_LABELS: Record<ListingFormat, string> = { online: "Online", "in-person": "In person", hybrid: "Hybrid" };

// The opportunity type is one of the eight categories (the same list as the app and the queue tabs). A listing saved earlier with a type that has no
// category of its own (an internship) keeps that type in its own form, so editing it never blanks the field.
const CATEGORY_OPTIONS: SelectOption<ListingType>[] = OPPORTUNITY_CATEGORIES.map((category) => ({ value: category.listingType, label: category.label }));
const typeOptionsFor = (current: ListingType | ""): SelectOption<ListingType>[] =>
  current && !CATEGORY_OPTIONS.some((option) => option.value === current) ? [...CATEGORY_OPTIONS, { value: current, label: TYPE_LABELS[current] }] : CATEGORY_OPTIONS;
/** An optional choice: "Not set" first, then the values. */
const optionalOptions = (values: string[], labels: Record<string, string> = {}): SelectOption<string>[] => [
  { value: NONE, label: "Not set" },
  ...values.map((value) => ({ value, label: labels[value] ?? value })),
];

/** Keeps what was chosen for the details only while the new type still offers it (a training level means nothing on a scholarship). */
const clearStaleDetails = (form: FormState, type: ListingType): Partial<FormState> => {
  const details = CATEGORY_DETAILS[type];
  const cleared: Partial<FormState> = {};
  if (!details?.focusOptions.includes(form.focusArea)) cleared.focusArea = "";
  if (!details?.levelOptions?.includes(form.level)) cleared.level = "";
  if (!details?.fundingOptions?.includes(form.fundingType)) cleared.fundingType = "";
  if (!details?.certificateLabel) cleared.certificateOffered = false;
  return cleared;
};
const FORMAT_OPTIONS: SelectOption<ListingFormat>[] = LISTING_FORMATS.map((format) => ({ value: format, label: FORMAT_LABELS[format] }));
const COUNTRY_OPTIONS: SelectOption<string>[] = LISTING_COUNTRIES.map((country) => ({ value: country, label: country }));

interface FormState {
  title: string;
  description: string;
  organisation: string;
  logoUrl: string | undefined;
  type: ListingType | "";
  deadline: string;
  applyUrl: string;
  costLabel: string;
  format: ListingFormat;
  location: string;
  country: string;
  eventAt: string;
  durationLabel: string;
  eligibility: string;
  benefits: string;
  fundingType: string;
  level: string;
  focusArea: string;
  certificateOffered: boolean;
  imageUrl: string | undefined;
  writerId: string;
  referralOnApply: boolean;
  vetted: boolean;
  vettedById: string;
  vettedOn: string;
}

const EMPTY: FormState = {
  title: "",
  description: "",
  organisation: "",
  logoUrl: undefined,
  type: "",
  deadline: "",
  applyUrl: "",
  costLabel: "",
  format: "online",
  location: "",
  country: "",
  eventAt: "",
  durationLabel: "",
  eligibility: "",
  benefits: "",
  fundingType: "",
  level: "",
  focusArea: "",
  certificateOffered: false,
  imageUrl: undefined,
  writerId: NONE,
  referralOnApply: false,
  vetted: false,
  vettedById: "",
  vettedOn: "",
};

const fromListing = (listing: Listing): FormState => ({
  title: listing.title,
  description: listing.description,
  organisation: listing.organisation,
  logoUrl: listing.logoUrl,
  type: listing.type,
  deadline: listing.closesAt.slice(0, 10),
  applyUrl: listing.applyUrl,
  costLabel: listing.costLabel ?? "",
  format: listing.format,
  location: listing.location ?? "",
  country: listing.country,
  eventAt: listing.eventAt ?? "",
  durationLabel: listing.durationLabel ?? "",
  eligibility: listing.eligibility ?? "",
  benefits: listing.benefits ?? "",
  fundingType: listing.fundingType ?? "",
  level: listing.level ?? "",
  focusArea: listing.focusArea ?? "",
  certificateOffered: Boolean(listing.certificateOffered),
  imageUrl: listing.imageUrl,
  writerId: listing.writerId ?? NONE,
  referralOnApply: listing.referralOnApply,
  vetted: listing.vetted,
  vettedById: listing.vettedById ?? "",
  vettedOn: listing.vettedOn ?? "",
});

/** True for a well-formed http or https address. */
export function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

type Errors = Partial<Record<"title" | "description" | "organisation" | "type" | "deadline" | "applyUrl" | "country" | "vettedBy" | "vettedOn", string>>;

/** The rules. `publishing` adds the ones that only matter when the listing goes live. */
export function validateListing(form: FormState, publishing: boolean, today = todayIsoDate()): Errors {
  const errors: Errors = {};
  if (!form.title.trim()) errors.title = "Enter a title.";
  if (!form.description.trim()) errors.description = "Enter a description.";
  if (!form.organisation.trim()) errors.organisation = "Enter the offering organisation.";
  if (!form.type) errors.type = "Choose the opportunity type.";
  if (!form.country) errors.country = "Choose a country.";
  if (!form.deadline) errors.deadline = "Choose the application deadline.";
  else if (publishing && form.deadline < today) errors.deadline = "The deadline has passed. Choose today or a later date to publish.";
  if (!form.applyUrl.trim()) errors.applyUrl = "Enter the official application link.";
  else if (!isValidUrl(form.applyUrl)) errors.applyUrl = "Enter a full web address, starting with https://";
  if (form.vetted && !form.vettedById) errors.vettedBy = "Choose who vetted this listing.";
  if (form.vetted && !form.vettedOn) errors.vettedOn = "Choose the date it was vetted.";
  return errors;
}

export function ListingForm({ listing }: { listing?: Listing }) {
  const staff = useMemo(() => listingStaff(), []);
  const me = useMemo(() => currentStaffMember(), []);
  const initial = useMemo<FormState>(() => (listing ? fromListing(listing) : EMPTY), [listing]);
  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  // Publishing-only rules (the deadline must not be past) show once someone has tried to publish.
  const [publishTried, setPublishTried] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const { show, touch, touchAll } = useTouched();
  const toast = useToast();

  const isPublished = listing?.status === "published";
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const guard = useUnsavedGuard(dirty && !saving);
  const defaultVetterId = me?.id ?? staff[0]?.id ?? "";
  const errors = validateListing(form, publishTried && !isPublished);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const writerOptions: SelectOption<string>[] = [
    { value: NONE, label: "No writer assigned" },
    ...staff.map((person) => ({ value: person.id, label: person.name, description: person.title })),
  ];

  /** Saves as a draft or publishes (or, for a published listing, saves the changes). */
  const save = async (mode: "draft" | "publish") => {
    touchAll();
    if (mode === "publish") setPublishTried(true);
    const found = validateListing(form, mode === "publish" && !isPublished);
    // A draft only needs the fields to be valid; the deadline check belongs to publishing.
    if (Object.keys(found).length > 0) {
      focusFirstInvalid(formRef.current);
      return;
    }
    if (mode === "publish" && !form.vetted) return; // the button is disabled; this guards the Enter key
    setSaving(mode);
    const fields: ListingFields = {
      title: form.title.trim(),
      description: form.description.trim(),
      organisation: form.organisation.trim(),
      logoUrl: form.logoUrl,
      type: form.type as ListingType,
      closesAt: form.deadline,
      applyUrl: form.applyUrl.trim(),
      costLabel: form.costLabel.trim() || undefined,
      format: form.format,
      location: form.location.trim() || undefined,
      country: form.country,
      eventAt: form.eventAt || undefined,
      durationLabel: form.durationLabel.trim() || undefined,
      eligibility: form.eligibility.trim() || undefined,
      benefits: form.benefits.trim() || undefined,
      fundingType: form.fundingType || undefined,
      level: form.level || undefined,
      focusArea: form.focusArea || undefined,
      certificateOffered: form.certificateOffered,
      imageUrl: form.imageUrl,
      writerId: form.writerId === NONE ? undefined : form.writerId,
      referralOnApply: form.referralOnApply,
      vetted: form.vetted,
      vettedById: form.vetted ? form.vettedById : undefined,
      vettedOn: form.vetted ? form.vettedOn : undefined,
    };
    // GOD-T31: real mode waits for the API (the listing is saved on the server); a failure keeps the form as typed and says so.
    let saved: Awaited<ReturnType<typeof createListing>> | undefined;
    try {
      saved = listing ? await updateListing(listing.id, fields, mode === "publish" && !isPublished) : await createListing(fields, mode === "publish");
    } catch (error) {
      setSaving(null);
      toast.error(error instanceof Error ? `The listing was not saved: ${error.message}` : "The listing was not saved.");
      return;
    }
    const id = saved?.id ?? listing?.id ?? "";
    toast.success(
      isPublished
        ? `${fields.title} was updated.`
        : mode === "publish"
          ? `${fields.title} was published.`
          : `${fields.title} was saved as a draft.`,
    );
    guard.leaveNow(id ? `${LIST_HREF}/${id}` : LIST_HREF);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void save("publish"); // the form's submit button is "Publish" (or "Save changes" for a published listing)
  };

  const details = form.type ? CATEGORY_DETAILS[form.type] : undefined;
  const canPublish = form.vetted;
  const publishLabel = isPublished ? "Save changes" : "Publish";

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex flex-1 flex-col">
      <div className="max-w-240">
        <h1 data-testid="page-title" className="page-title">
          {listing ? "Edit listing" : "New listing"}
        </h1>
        <p className="page-subtitle mt-1 mb-6">
          {listing ? "Change this curated listing. Hirer-submitted postings are reviewed, not edited." : "Create a listing curated by the desk. Save it as a draft, or publish it once it is vetted."}
        </p>

        <div className="space-y-4">
          <Card>
            <FormSection title="Basic details" description="What the listing is and who offers it.">
              <Field label="Title" error={show("title") ? errors.title : undefined}>
                <Input value={form.title} onChange={(e) => set("title", e.target.value)} onBlur={() => touch("title")} placeholder="e.g. Graduate Software Engineer" autoComplete="off" />
              </Field>
              <Field label="Description" error={show("description") ? errors.description : undefined}>
                <RichTextEditor value={form.description} onChange={(value) => set("description", value)} onBlur={() => touch("description")} rows={8} placeholder="What the opportunity is, who it is for and what is needed. Use the buttons above to add headings, bold, lists and links." />
              </Field>
              <Field label="Offering organisation" error={show("organisation") ? errors.organisation : undefined}>
                <Input value={form.organisation} onChange={(e) => set("organisation", e.target.value)} onBlur={() => touch("organisation")} placeholder="e.g. MTN Ghana" autoComplete="off" />
              </Field>
              <Field label="Organisation logo" optional>
                <div className="max-w-sm">
                  <FileDrop value={form.logoUrl} onChange={(url) => set("logoUrl", url)} alt="Organisation logo" emptyLabel="Click to upload or drag the logo here" />
                </div>
              </Field>
              <Field label="Opportunity type" error={show("type") ? errors.type : undefined}>
                <Select options={typeOptionsFor(form.type)} value={form.type} onChange={(value) => setForm((current) => ({ ...current, type: value, ...clearStaleDetails(current, value) }))} onBlur={() => touch("type")} placeholder="Choose a type" sheetTitle="Opportunity type" />
              </Field>
            </FormSection>
          </Card>

          <Card>
            <FormSection title="Logistics" description="When, where and how people apply.">
              <Field label="Application deadline" error={show("deadline") ? errors.deadline : undefined}>
                <DatePicker value={form.deadline} onChange={(iso) => set("deadline", iso)} onBlur={() => touch("deadline")} label="Choose the application deadline" />
              </Field>
              <Field label="Official application link" error={show("applyUrl") ? errors.applyUrl : undefined} helper="Where people apply. Must start with https://">
                <Input type="url" inputMode="url" value={form.applyUrl} onChange={(e) => set("applyUrl", e.target.value)} onBlur={() => touch("applyUrl")} placeholder="https://" autoComplete="off" />
              </Field>
              <Field label="Cost or fee" optional helper={'Shown to seekers, for example "Free" or "USD 20".'}>
                <Input value={form.costLabel} onChange={(e) => set("costLabel", e.target.value)} placeholder="Free" autoComplete="off" />
              </Field>
              <Field label="Format">
                <Select options={FORMAT_OPTIONS} value={form.format} onChange={(value) => set("format", value)} sheetTitle="Format" />
              </Field>
              <Field label="Location" optional helper="Free text, for example a city or an address.">
                <Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Accra, Ghana" autoComplete="off" />
              </Field>
              <Field label="Country" error={show("country") ? errors.country : undefined}>
                <Select options={COUNTRY_OPTIONS} value={form.country} onChange={(value) => set("country", value)} onBlur={() => touch("country")} placeholder="Choose a country" sheetTitle="Country" />
              </Field>
              {/* GOD-T31: only for an event (or a listing that already has an event date), so other types get a shorter form */}
              {(form.type === "event" || form.eventAt) && (
                <DateTimeField label="Event date and time" optional helper="When the event takes place." value={form.eventAt} onChange={(value) => set("eventAt", value)} />
              )}
              <Field label="Duration" optional helper={'For example "3 months" or "2 days".'}>
                <Input value={form.durationLabel} onChange={(e) => set("durationLabel", e.target.value)} placeholder="3 months" autoComplete="off" />
              </Field>
            </FormSection>
          </Card>

          <Card>
            <FormSection title="Details" description="What seekers read before they apply, and the facts the app uses to filter this listing.">
              <Field label="Who can apply" optional helper="One point on each line.">
                <RichTextEditor value={form.eligibility} onChange={(value) => set("eligibility", value)} rows={5} placeholder={"Citizens of Ghana\nUnder 30 years old"} />
              </Field>
              <Field label="What it offers" optional helper="One point on each line.">
                <RichTextEditor value={form.benefits} onChange={(value) => set("benefits", value)} rows={5} placeholder={"Tuition\nA monthly allowance"} />
              </Field>
              {details && (
                <>
                  <Field label={details.focusLabel} optional>
                    <Select options={optionalOptions(details.focusOptions)} value={form.focusArea || NONE} onChange={(value) => set("focusArea", value === NONE ? "" : value)} sheetTitle={details.focusLabel} />
                  </Field>
                  {details.levelOptions && details.levelLabel && (
                    <Field label={details.levelLabel} optional>
                      <Select options={optionalOptions(details.levelOptions)} value={form.level || NONE} onChange={(value) => set("level", value === NONE ? "" : value)} sheetTitle={details.levelLabel} />
                    </Field>
                  )}
                  {details.fundingOptions && details.fundingLabel && (
                    <Field label={details.fundingLabel} optional>
                      <Select options={optionalOptions(details.fundingOptions, FUNDING_LABELS)} value={form.fundingType || NONE} onChange={(value) => set("fundingType", value === NONE ? "" : value)} sheetTitle={details.fundingLabel} />
                    </Field>
                  )}
                  {details.certificateLabel && (
                    <Switch
                      checked={form.certificateOffered}
                      onChange={(checked) => set("certificateOffered", checked)}
                      label={details.certificateLabel}
                      statusText={form.certificateOffered ? "Yes" : "No"}
                    />
                  )}
                </>
              )}
            </FormSection>
          </Card>

          <Card>
            <FormSection title="Media and attribution" description="The picture, who wrote it up and how referrals work.">
              <Field label="Featured image" optional>
                <div className="max-w-sm">
                  <FileDrop value={form.imageUrl} onChange={(url) => set("imageUrl", url)} alt="Featured image" emptyLabel="Click to upload or drag an image here" />
                </div>
              </Field>
              <Field label="Assigned writer" optional>
                <Select options={writerOptions} value={form.writerId} onChange={(value) => set("writerId", value)} sheetTitle="Assigned writer" />
              </Field>
              <Switch
                checked={form.referralOnApply}
                onChange={(checked) => set("referralOnApply", checked)}
                label="Referral code on apply"
                statusText={form.referralOnApply ? "On" : "Off"}
                description="When on, an ambassador's referral code is added to the application link, so applications can be credited to them."
              />
            </FormSection>
          </Card>

          <VettingCheckpoint
            vetted={form.vetted}
            vettedById={form.vettedById}
            vettedOn={form.vettedOn}
            staff={staff}
            defaultVetterId={defaultVetterId}
            onChange={(next) => setForm((current) => ({ ...current, ...next }))}
            errors={{ vettedBy: errors.vettedBy, vettedOn: errors.vettedOn }}
          />
        </div>
      </div>

      <StickyActionBar
        dirty={dirty}
        saving={saving === "publish"}
        saveLabel={publishLabel}
        maxWidth="60rem"
        onCancel={() => guard.leave(listing ? `${LIST_HREF}/${listing.id}` : LIST_HREF)}
        saveDisabled={!canPublish}
        saveDisabledReason={`Check "Vetted" to ${isPublished ? "save changes" : "publish"}.`}
        extraActions={
          isPublished ? undefined : (
            <Button type="button" variant="secondary" loading={saving === "draft"} onClick={() => void save("draft")} className="max-sm:h-11 max-sm:flex-1">
              Save draft
            </Button>
          )
        }
      />
      {guard.dialog}
    </form>
  );
}
