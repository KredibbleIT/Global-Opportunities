"use client";

/**
 * ShowcaseEntryDialog: the add / edit form for one person or organisation featured on the app.
 *
 * Fields: Category (only the categories this person may edit), "Start from an existing record" (ambassadors and partners that are not
 * featured yet: fills the form so nobody is typed in twice), Name, Role or what they do, Short bio (400 characters), Country, Photo
 * (upload, with a preview), "Provided by" (who sent the picture and bio, and when: a record, not a legal form) and a Show-on-the-app
 * switch. Publishing is direct: Visible means it is on the app as soon as it is saved.
 *
 * Errors show after a field is left and on submit, as text with an icon, never by colour alone. The first invalid field takes focus.
 *
 * Props: categories (the ones the person may use), entry? (editing: its values fill the form), defaultCategoryId?, onClose,
 *        onSubmit(form, links) -> (a promise of) { ok: true } to close, or { ok: false, reason, errors? } to stay open with the
 *        messages. Save shows a spinner while the server answers. A newly picked photo is a data: URL here; the service uploads it.
 */
import { useCallback, useRef, useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import type { ShowcaseCategory, ShowcaseEntry } from "@/lib/mock-entities";
import { BIO_MAX, validateEntry, type EntryErrors, type EntryForm } from "@/lib/showcase";
import { loadSuggestions, type Suggestion } from "@/lib/services/showcase";
import { useAsync } from "@/lib/use-async";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/form/Field";
import { FileDrop } from "@/components/ui/form/FileDrop";
import { Input } from "@/components/ui/form/Input";
import { Select, type SelectOption } from "@/components/ui/form/Select";
import { Switch } from "@/components/ui/form/Switch";
import { Textarea } from "@/components/ui/form/Textarea";
import { focusFirstInvalid, useTouched } from "@/components/ui/form/use-touched";

type Result = { ok: true } | { ok: false; reason: string; errors?: EntryErrors };
type Links = { ambassadorId?: string; partnerId?: string };

interface ShowcaseEntryDialogProps {
  categories: ShowcaseCategory[];
  entry?: ShowcaseEntry;
  defaultCategoryId?: string;
  onClose: () => void;
  onSubmit: (form: EntryForm, links: Links) => Result | Promise<Result>;
}

const NONE = "none";
const NO_SUGGESTIONS: Suggestion[] = [];

export function ShowcaseEntryDialog({ categories, entry, defaultCategoryId, onClose, onSubmit }: ShowcaseEntryDialogProps) {
  const [form, setForm] = useState<EntryForm>({
    categoryId: entry?.categoryId ?? defaultCategoryId ?? categories[0]?.id ?? "",
    name: entry?.name ?? "",
    title: entry?.title ?? "",
    bio: entry?.bio ?? "",
    country: entry?.country ?? "",
    providedBy: entry?.providedBy ?? "",
    photoUrl: entry?.photoUrl,
    visible: entry?.visible ?? true,
  });
  const [links, setLinks] = useState<Links>({});
  const [startFrom, setStartFrom] = useState<string>(NONE);
  const [serverErrors, setServerErrors] = useState<EntryErrors>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const { show, touch, touchAll } = useTouched();

  const category = categories.find((item) => item.id === form.categoryId);
  // Only when adding: ambassadors or partners not featured yet, for the chosen category.
  const suggestionKey = entry ? undefined : category?.key;
  const loadOptions = useCallback(() => (suggestionKey ? loadSuggestions(suggestionKey) : Promise.resolve(NO_SUGGESTIONS)), [suggestionKey]);
  const suggestionsState = useAsync(loadOptions);
  const suggestions = suggestionsState.data ?? NO_SUGGESTIONS;
  const errors = { ...validateEntry(form, categories), ...serverErrors };
  const set = <K extends keyof EntryForm>(key: K, value: EntryForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setServerErrors({});
  };

  const categoryOptions: SelectOption<string>[] = categories.map((item) => ({ value: item.id, label: item.name }));
  const suggestionOptions: SelectOption<string>[] = [
    { value: NONE, label: "Type it in", description: "Nothing is copied." },
    ...suggestions.map((item) => ({ value: item.id, label: item.label, description: item.description })),
  ];

  const applySuggestion = (id: string) => {
    setStartFrom(id);
    const picked = suggestions.find((item) => item.id === id);
    if (!picked) {
      setLinks({});
      return;
    }
    setLinks(picked.link);
    setForm((current) => ({ ...current, ...picked.fill, photoUrl: picked.fill.photoUrl ?? current.photoUrl }));
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (saving) return;
    touchAll();
    setProblem(null);
    if (Object.keys(validateEntry(form, categories)).length > 0) {
      focusFirstInvalid(formRef.current);
      return;
    }
    setSaving(true);
    const result = await onSubmit(form, links);
    setSaving(false);
    if (!result.ok) {
      setServerErrors(result.errors ?? {});
      setProblem(result.reason);
      focusFirstInvalid(formRef.current);
    }
  };

  const bioLength = form.bio.trim().length;

  return (
    <Dialog
      title={entry ? "Edit entry" : "Add to the showcase"}
      description={entry ? "Changes show on the app as soon as you save." : "Shown on the app's Meet our people page. Visible means live as soon as you save."}
      onClose={onClose}
      size="lg"
      testId="showcase-entry-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={Save} onClick={() => void submit()} loading={saving} data-testid="showcase-entry-save">
            {entry ? "Save changes" : "Add entry"}
          </Button>
        </>
      }
    >
      <form ref={formRef} onSubmit={(event) => void submit(event)} noValidate className="space-y-4" aria-label={entry ? "Edit entry" : "Add to the showcase"}>
        {problem && (
          <p role="alert" className="caption text-danger" data-testid="showcase-entry-problem">
            <span className="font-semibold">Could not save.</span> {problem}
          </p>
        )}
        <Field label="Category" error={show("categoryId") ? errors.categoryId : undefined}>
          <Select
            options={categoryOptions}
            value={form.categoryId}
            onChange={(value) => {
              set("categoryId", value);
              setStartFrom(NONE);
              setLinks({});
            }}
            ariaLabel="Category"
          />
        </Field>
        {suggestionsState.error && (
          <p role="status" className="caption" data-testid="showcase-suggestions-error">
            The existing {suggestionKey === "partners" ? "partners" : "ambassadors"} could not be loaded ({suggestionsState.error.message}). Type the details in instead.
          </p>
        )}
        {suggestions.length > 0 && (
          <Field label="Start from an existing record" optional helper="Fills the form from the ambassador or partner, so nobody is typed in twice.">
            <Select options={suggestionOptions} value={startFrom} onChange={applySuggestion} ariaLabel="Start from an existing record" />
          </Field>
        )}
        <Field label="Name" error={show("name") ? errors.name : undefined}>
          <Input value={form.name} onChange={(event) => set("name", event.target.value)} onBlur={() => touch("name")} autoComplete="off" placeholder="e.g. Ama Boateng" />
        </Field>
        <Field label="Role or what they do" error={show("title") ? errors.title : undefined}>
          <Input value={form.title} onChange={(event) => set("title", event.target.value)} onBlur={() => touch("title")} autoComplete="off" placeholder="e.g. Campus Lead, KNUST" />
        </Field>
        <Field
          label="Short bio"
          optional
          error={show("bio") ? errors.bio : undefined}
          helper={`${bioLength} of ${BIO_MAX} characters. The app shows the first lines on the card.`}
        >
          <Textarea value={form.bio} onChange={(event) => set("bio", event.target.value)} onBlur={() => touch("bio")} rows={4} />
        </Field>
        <Field label="Country" optional>
          <Input value={form.country} onChange={(event) => set("country", event.target.value)} autoComplete="off" placeholder="e.g. Ghana" />
        </Field>
        <Field label="Photo" optional helper="A square picture works best. Without one the app shows initials.">
          <FileDrop value={form.photoUrl} onChange={(url) => set("photoUrl", url)} alt={`Photo of ${form.name || "this person"}`} emptyLabel="Click to upload or drag a photo here" />
        </Field>
        <Field label="Provided by" optional error={show("providedBy") ? errors.providedBy : undefined} helper="Who sent the photo and bio, and when. A record for the desk, never shown on the app.">
          <Input value={form.providedBy} onChange={(event) => set("providedBy", event.target.value)} onBlur={() => touch("providedBy")} autoComplete="off" placeholder="e.g. Sent by the person by email on 3 Oct" />
        </Field>
        <Switch
          checked={form.visible}
          onChange={(checked) => set("visible", checked)}
          label="Show on the app"
          description={form.visible ? "Visible: it is on the app as soon as you save." : "Hidden: saved here, not shown on the app."}
        />
      </form>
    </Dialog>
  );
}
