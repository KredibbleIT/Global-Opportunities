"use client";

/**
 * UpcomingProgramsCard ("Programs in progress and upcoming"): the next five programs that are planned or running, ordered by start date, each
 * with its status badge (Running, Planned).
 *
 *   Program            Status    Type        Starts        Participants   Partner
 *   Career Bootcamp    Running   Bootcamp    12 Nov 2026   18 of 40       Acme Capital
 *
 * A table from 640px; below that each program is a stacked card (no table to scroll sideways). The title links to the program when
 * the viewer may see Programs.
 *
 * Props:
 * - programs: the rows, or null when unavailable
 * - loading: show the skeleton with the same size
 * - notConnected: real-API mode: "Not available yet" (not an error)
 */
import { GraduationCap } from "lucide-react";
import { useRoles } from "@/components/access/RoleProvider";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TruncatedLink, TruncatedText } from "@/components/ui/TruncatedText";
import { formatDate } from "@/lib/format";
import type { UpcomingProgram } from "@/lib/services/dashboard-types";
import { NotAvailableYet } from "./NotAvailableYet";
import { UnavailableNote } from "./UnavailableNote";

const typeLabel = (type: string) => type.charAt(0).toUpperCase() + type.slice(1);
const startDay = (startAt: string) => formatDate(startAt.slice(0, 10));

export function UpcomingProgramsCard({ programs, loading, notConnected = false, className }: { programs: UpcomingProgram[] | null; loading: boolean; notConnected?: boolean; className?: string }) {
  const { can } = useRoles();
  const linked = can("programs", "view");

  return (
    <Card as="section" ariaLabel="Programs in progress and upcoming" testId="upcoming-programs" className={className}>
      <CardHeader title="Programs in progress and upcoming" subtitle="The next five that are running or planned, by start date" />
      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading programs">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-control" />
          ))}
        </div>
      ) : notConnected ? (
        <NotAvailableYet icon={GraduationCap} />
      ) : !programs ? (
        <UnavailableNote message="The programs could not be loaded." />
      ) : programs.length === 0 ? (
        <EmptyState icon={GraduationCap} title="No programs in progress or upcoming" description="Running and planned programs show here." />
      ) : (
        // The CARD decides (a container query), not the window: below 40rem of card the table cannot hold a status pill, a type, a
        // date and a count side by side, so it becomes the stacked list. Before, fixed column widths let the pill run into Type and the
        // dates wrap at medium widths (unslop pass, owner report 2026-11-11).
        <div className="@container">
          <table data-testid="upcoming-table" className="hidden w-full text-left @[40rem]:table">
            <caption className="sr-only">The next five running or planned programs, by start date</caption>
            <thead>
              <tr className="table-head">
                <th scope="col" className="w-[34%] py-2 pr-3">Program</th>
                <th scope="col" className="whitespace-nowrap px-3 py-2">Status</th>
                <th scope="col" className="whitespace-nowrap px-3 py-2">Type</th>
                <th scope="col" className="whitespace-nowrap px-3 py-2">Starts</th>
                <th scope="col" className="whitespace-nowrap px-3 py-2 text-right">Participants</th>
                <th scope="col" className="w-[20%] py-2 pl-3">Partner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {programs.map((program) => (
                <tr key={program.id} data-testid="upcoming-row" className="align-middle">
                  <td className="table-text max-w-0 py-3 pr-3 font-semibold">
                    {linked ? <TruncatedLink href={`/programs/${program.id}`} text={program.title} /> : <TruncatedText text={program.title} />}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3" data-testid="upcoming-status">
                    <StatusBadge status={program.status} />
                  </td>
                  <td className="table-text whitespace-nowrap px-3 py-3">{typeLabel(program.type)}</td>
                  <td className="table-text whitespace-nowrap px-3 py-3 tabular-nums">{startDay(program.startAt)}</td>
                  <td className="table-text whitespace-nowrap px-3 py-3 text-right tabular-nums">
                    {program.participants} of {program.target}
                  </td>
                  <td className="table-text max-w-0 py-3 pl-3">{program.partner ? <TruncatedText text={program.partner} /> : <span className="text-muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="divide-y divide-line @[40rem]:hidden">
            {programs.map((program) => (
              <li key={program.id} data-testid="upcoming-card" className="py-3 first:pt-0 last:pb-0">
                <p className="table-text font-semibold">
                  {linked ? <TruncatedLink href={`/programs/${program.id}`} text={program.title} lines={2} /> : <TruncatedText text={program.title} lines={2} />}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2">
                  <span data-testid="upcoming-status">
                    <StatusBadge status={program.status} />
                  </span>
                  <span className="caption">
                    {typeLabel(program.type)} · starts {startDay(program.startAt)}
                  </span>
                </p>
                <p className="caption">
                  {program.participants} of {program.target} participants{program.partner ? ` · ${program.partner}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
