"use client";

/**
 * ShowcaseCategoryDialog: add or rename a category (a heading on the app's Meet our people page, for example "Developers").
 * A name (required, at most 40 characters, unique) and a kind: People (round photos) or Organisations (logos). The kind of a built-in
 * category cannot change, so it is shown but not editable. Creating categories needs the showcase.manage permission (the caller checks).
 *
 * Props: category? (editing), onClose, onSubmit(name, kind) -> (a promise of) { ok: true } to close, or { ok: false, reason, errors? }
 *        to stay open. Save shows a spinner while the server answers.
 */
import { useRef, useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import type { ShowcaseCategory, ShowcaseKind } from "@/lib/mock-entities";
import { CATEGORY_NAME_MAX, KIND_LABEL, validateCategory, type CategoryErrors } from "@/lib/showcase";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/form/Field";
import { Input } from "@/components/ui/form/Input";
import { focusFirstInvalid, useTouched } from "@/components/ui/form/use-touched";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

type Result = { ok: true } | { ok: false; reason: string; errors?: CategoryErrors };

interface ShowcaseCategoryDialogProps {
  category?: ShowcaseCategory;
  existing: readonly ShowcaseCategory[];
  onClose: () => void;
  onSubmit: (name: string, kind: ShowcaseKind) => Result | Promise<Result>;
}

export function ShowcaseCategoryDialog({ category, existing, onClose, onSubmit }: ShowcaseCategoryDialogProps) {
  const [name, setName] = useState(category?.name ?? "");
  const [kind, setKind] = useState<ShowcaseKind>(category?.kind ?? "person");
  const [serverErrors, setServerErrors] = useState<CategoryErrors>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const { show, touch, touchAll } = useTouched();
  const errors = { ...validateCategory(name, kind, existing, category?.id), ...serverErrors };
  const builtIn = !!category && category.key !== "custom";

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (saving) return;
    touchAll();
    setProblem(null);
    if (Object.keys(validateCategory(name, kind, existing, category?.id)).length > 0) {
      focusFirstInvalid(formRef.current);
      return;
    }
    setSaving(true);
    const result = await onSubmit(name, kind);
    setSaving(false);
    if (!result.ok) {
      setServerErrors(result.errors ?? {});
      setProblem(result.reason);
      focusFirstInvalid(formRef.current);
    }
  };

  return (
    <Dialog
      title={category ? "Rename category" : "Add a category"}
      description="A category is a heading on the app's Meet our people page."
      onClose={onClose}
      size="md"
      testId="showcase-category-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={Save} onClick={() => void submit()} loading={saving} data-testid="showcase-category-save">
            {category ? "Save" : "Add category"}
          </Button>
        </>
      }
    >
      <form ref={formRef} onSubmit={(event) => void submit(event)} noValidate className="space-y-4" aria-label={category ? "Rename category" : "Add a category"}>
        {problem && (
          <p role="alert" className="caption text-danger" data-testid="showcase-category-problem">
            <span className="font-semibold">Could not save.</span> {problem}
          </p>
        )}
        <Field label="Name" error={show("name") ? errors.name : undefined} helper={`${name.trim().length} of ${CATEGORY_NAME_MAX} characters.`}>
          <Input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setServerErrors({});
            }}
            onBlur={() => touch("name")}
            autoComplete="off"
            placeholder="e.g. Developers"
          />
        </Field>
        <Field label="Shown as" error={show("kind") ? errors.kind : undefined} helper={builtIn ? "The kind of a built-in category cannot change." : "People get a round photo, organisations a square logo."}>
          {builtIn ? (
            <p className="body-sm" data-testid="showcase-category-kind">
              {KIND_LABEL[kind]}
            </p>
          ) : (
            <SegmentedControl
              options={[
                { value: "person" as ShowcaseKind, label: "People" },
                { value: "organisation" as ShowcaseKind, label: "Organisations" },
              ]}
              value={kind}
              onChange={setKind}
              ariaLabel="Shown as"
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}
