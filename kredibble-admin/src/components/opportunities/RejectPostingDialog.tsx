"use client";

/**
 * RejectPostingDialog (SEC-151): turning down a hirer's posting asks WHY, because the hirer is told.
 *
 * - Reason: one of REJECTION_REASONS (required). Each option's label is the sentence the hirer reads.
 * - Note to the hirer: optional, except for "Another reason", where it is the explanation. At most 500 characters.
 * - The description says what happens: the posting moves to Rejected, the hirer is told in the app with the reason
 *   and note, and an edit from the hirer sends it back for review.
 *
 * Validation shows as text under the field (never colour alone), after a blur or a submit attempt.
 * onReject(values) resolves { ok: true } (the dialog closes) or { ok: false, reason } (it stays open and says why).
 */
import { useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/form/Field";
import { Select } from "@/components/ui/form/Select";
import { Textarea } from "@/components/ui/form/Textarea";
import { focusFirstInvalid, useTouched } from "@/components/ui/form/use-touched";
import { REJECTION_NOTE_MAX, REJECTION_REASONS, type RejectionReasonCode } from "@/lib/rejection-reasons";

export interface RejectPostingValues {
  reason: RejectionReasonCode | "";
  note: string;
}

type Result = { ok: true } | { ok: false; reason: string };

interface RejectPostingDialogProps {
  posting: { title: string; company: string };
  onClose: () => void;
  onReject: (values: { reason: RejectionReasonCode; note?: string }) => Result | Promise<Result>;
}

/** Field errors for the dialog's values (an empty object when they can be sent). */
export function validateRejection(values: RejectPostingValues): Partial<Record<"reason" | "note", string>> {
  const errors: Partial<Record<"reason" | "note", string>> = {};
  const note = values.note.trim();
  if (!values.reason) errors.reason = "Choose why this posting is rejected.";
  if (values.reason === "other" && !note) errors.note = "Explain the reason: the hirer reads this note.";
  if (note.length > REJECTION_NOTE_MAX) errors.note = `Keep the note to ${REJECTION_NOTE_MAX} characters.`;
  return errors;
}

export function RejectPostingDialog({ posting, onClose, onReject }: RejectPostingDialogProps) {
  const [values, setValues] = useState<RejectPostingValues>({ reason: "", note: "" });
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const { show, touch, touchAll } = useTouched();
  const errors = validateRejection(values);
  const noteRequired = values.reason === "other";

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (saving) return;
    touchAll();
    setProblem(null);
    if (Object.keys(errors).length > 0 || !values.reason) {
      focusFirstInvalid(formRef.current);
      return;
    }
    setSaving(true);
    const note = values.note.trim();
    const result = await onReject({ reason: values.reason, ...(note ? { note } : {}) });
    setSaving(false);
    if (!result.ok) setProblem(result.reason);
  };

  return (
    <Dialog
      title="Reject this posting?"
      description={
        <>
          <strong className="text-ink">{posting.title}</strong> from <strong className="text-ink">{posting.company}</strong> moves to Rejected.
          The hirer is told in the app, with the reason and your note. If they edit the posting, it comes back here for review.
        </>
      }
      onClose={onClose}
      size="md"
      testId="reject-posting-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger-solid" icon={X} onClick={() => void submit()} loading={saving} data-testid="reject-posting-confirm">
            Reject posting
          </Button>
        </>
      }
    >
      <form ref={formRef} onSubmit={(event) => void submit(event)} noValidate className="space-y-4" aria-label="Reject posting">
        {problem && (
          <p role="alert" className="caption text-danger" data-testid="reject-posting-problem">
            <span className="font-semibold">Could not reject.</span> {problem}
          </p>
        )}
        <Field label="Reason" helper="The hirer reads this sentence." error={show("reason") ? errors.reason : undefined}>
          <Select
            value={values.reason}
            onChange={(reason) => {
              setValues((current) => ({ ...current, reason }));
              touch("reason");
            }}
            onBlur={() => touch("reason")}
            options={REJECTION_REASONS.map((reason) => ({ value: reason.code, label: reason.label }))}
            placeholder="Choose a reason"
            ariaLabel="Reason"
            sheetTitle="Reason"
          />
        </Field>
        <Field
          label="Note to the hirer"
          optional={!noteRequired}
          helper={`${values.note.trim().length} of ${REJECTION_NOTE_MAX} characters. Say what to change, for example the missing salary.`}
          error={show("note") ? errors.note : undefined}
        >
          <Textarea
            value={values.note}
            onChange={(event) => setValues((current) => ({ ...current, note: event.target.value }))}
            onBlur={() => touch("note")}
            rows={3}
            data-testid="reject-posting-note"
          />
        </Field>
      </form>
    </Dialog>
  );
}
