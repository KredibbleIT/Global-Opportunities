"use client";

/**
 * ProgramSummary: the one number the Programs page summarises: Active (planned + running: still to happen or happening now).
 * "Delivered" is NOT repeated here: it is a status in the filter right below, with its own count, so one place says it.
 * The count comes from programSummary() in services/programs.ts.
 *
 * Props:
 * - programs: the programs to count, or null while they load (the stat then shows "—", never 0)
 * - className?: layout classes for the strip
 * Test ids: program-summary, program-summary-active.
 */
import { MiniStat } from "@/components/ui/MiniStat";
import { programSummary } from "@/lib/services/programs";
import type { Program } from "@/lib/mock-entities";

export function ProgramSummary({ programs, className = "" }: { programs: readonly Pick<Program, "status">[] | null; className?: string }) {
  const summary = programs ? programSummary(programs) : null;
  return (
    <section aria-label="Programs summary" data-testid="program-summary" className={`grid grid-cols-1 gap-3 sm:max-w-xs ${className}`}>
      <div data-testid="program-summary-active">
        <MiniStat value={summary ? summary.active : "—"} label="Active" />
      </div>
    </section>
  );
}
