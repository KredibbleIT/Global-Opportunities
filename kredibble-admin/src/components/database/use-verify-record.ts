"use client";

/**
 * useVerifyRecord: the one-click Verify of a database record, shared by the list and the detail page.
 *
 * verify({ id, name, verified }) marks the record verified today (services/database.ts verifyRecordSaved: the API in real
 * mode, the one store in mock mode), which moves the pace gauge, the counts, the sidebar pill and the "Beneficiaries
 * verified" KPI, then shows a toast with an Undo action. The toast lasts 5 seconds; Undo puts the record back exactly as it
 * was and says so. A refused save shows an error toast and changes nothing.
 * Only a role with edit access on "database" is given a Verify button, so there is nothing to undo for anyone else.
 */
import { useToast } from "@/components/ui/Toast";
import { undoVerifySaved, verifyRecordSaved } from "@/lib/services/database";

export function useVerifyRecord() {
  const toast = useToast();
  return async (record: { id: string; name: string; verified: boolean }) => {
    let undo;
    try {
      undo = await verifyRecordSaved(record);
    } catch (problem) {
      toast.error(problem instanceof Error ? problem.message : `${record.name} could not be verified. Try again.`);
      return;
    }
    if (!undo) return;
    const done = undo;
    toast.success(`${record.name} was verified.`, {
      action: {
        label: "Undo",
        onClick: () => {
          void undoVerifySaved(done).then(
            () => toast.info(`Verification of ${record.name} was undone.`),
            (problem: unknown) => toast.error(problem instanceof Error ? problem.message : `The verification of ${record.name} could not be undone.`),
          );
        },
      },
    });
  };
}
