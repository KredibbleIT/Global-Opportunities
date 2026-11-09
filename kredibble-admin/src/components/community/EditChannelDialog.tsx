"use client";

/**
 * EditChannelDialog: change what an admin may change on a channel: its name, description, category and (where the image can be
 * stored) its profile image. The owner, platform, handle and follower figures are NOT editable here: they are read-only facts
 * about the channel, shown on the detail page.
 *
 * Validation (shown as text under the field, never colour alone): the name is required (2 to 80 characters), the category is
 * required, the description is at most 500 characters.
 * Saving calls onSave(values) -> a promise of { ok: true } (the dialog closes) or { ok: false, reason } (it stays open and says why).
 * The caller updates the list at once (the mock store, or a reload after the PATCH), so the new details show in the list right away.
 *
 * Props: channel { name, bio?, category, avatar? }, categories (the choices; the channel's own is always included), allowImage
 *        (false in real mode until channel images can be uploaded: TODO(backend)), onClose, onSave.
 */
import { useRef, useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/form/Field";
import { FileDrop } from "@/components/ui/form/FileDrop";
import { Input } from "@/components/ui/form/Input";
import { Select } from "@/components/ui/form/Select";
import { Textarea } from "@/components/ui/form/Textarea";
import { focusFirstInvalid, useTouched } from "@/components/ui/form/use-touched";

export interface ChannelEditValues {
  name: string;
  bio: string;
  category: string;
  avatar?: string;
}

type Result = { ok: true } | { ok: false; reason: string };

interface EditChannelDialogProps {
  channel: { name: string; bio?: string; category: string; avatar?: string };
  categories: readonly string[];
  allowImage: boolean;
  onClose: () => void;
  onSave: (values: ChannelEditValues) => Result | Promise<Result>;
}

const NAME_MAX = 80;
const BIO_MAX = 500;

export function validateChannel(values: ChannelEditValues): Partial<Record<"name" | "category" | "bio", string>> {
  const errors: Partial<Record<"name" | "category" | "bio", string>> = {};
  const name = values.name.trim();
  if (!name) errors.name = "Enter a channel name.";
  else if (name.length < 2) errors.name = "The name needs at least 2 characters.";
  else if (name.length > NAME_MAX) errors.name = `The name can be at most ${NAME_MAX} characters.`;
  if (!values.category.trim()) errors.category = "Choose a category.";
  if (values.bio.length > BIO_MAX) errors.bio = `The description can be at most ${BIO_MAX} characters.`;
  return errors;
}

export function EditChannelDialog({ channel, categories, allowImage, onClose, onSave }: EditChannelDialogProps) {
  const [values, setValues] = useState<ChannelEditValues>({ name: channel.name, bio: channel.bio ?? "", category: channel.category, avatar: channel.avatar });
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const { show, touch, touchAll } = useTouched();
  const errors = validateChannel(values);
  const set = <K extends keyof ChannelEditValues>(key: K, value: ChannelEditValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const choices = Array.from(new Set([channel.category, ...categories])).filter(Boolean);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (saving) return;
    touchAll();
    setProblem(null);
    if (Object.keys(errors).length > 0) {
      focusFirstInvalid(formRef.current);
      return;
    }
    setSaving(true);
    const result = await onSave({ ...values, name: values.name.trim(), bio: values.bio.trim() });
    setSaving(false);
    if (!result.ok) setProblem(result.reason);
  };

  return (
    <Dialog
      title="Edit channel"
      description="Change the name, description, category or profile image. The owner, platform, handle and followers cannot be edited."
      onClose={onClose}
      size="md"
      testId="edit-channel-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={Save} onClick={() => void submit()} loading={saving} data-testid="edit-channel-save">
            Save changes
          </Button>
        </>
      }
    >
      <form ref={formRef} onSubmit={(event) => void submit(event)} noValidate className="space-y-4" aria-label="Edit channel">
        {problem && (
          <p role="alert" className="caption text-danger" data-testid="edit-channel-problem">
            <span className="font-semibold">Could not save.</span> {problem}
          </p>
        )}
        <Field label="Name" error={show("name") ? errors.name : undefined} helper={`${values.name.trim().length} of ${NAME_MAX} characters.`}>
          <Input value={values.name} onChange={(event) => set("name", event.target.value)} onBlur={() => touch("name")} autoComplete="off" maxLength={NAME_MAX + 20} />
        </Field>
        <Field label="Description" optional error={show("bio") ? errors.bio : undefined} helper={`${values.bio.length} of ${BIO_MAX} characters.`}>
          <Textarea value={values.bio} onChange={(event) => set("bio", event.target.value)} onBlur={() => touch("bio")} rows={3} />
        </Field>
        <Field label="Category" error={show("category") ? errors.category : undefined}>
          <Select
            value={values.category}
            onChange={(value) => set("category", value)}
            options={choices.map((value) => ({ value, label: value }))}
            ariaLabel="Category"
            sheetTitle="Category"
          />
        </Field>
        {allowImage && (
          <Field label="Profile image" optional helper="A square picture works best. Without one the list shows initials.">
            <FileDrop value={values.avatar} onChange={(url) => set("avatar", url)} alt={`Profile image of ${values.name || "this channel"}`} emptyLabel="Click to upload or drag an image here" />
          </Field>
        )}
      </form>
    </Dialog>
  );
}
