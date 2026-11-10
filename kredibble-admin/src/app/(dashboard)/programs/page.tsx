"use client";

/**
 * Programs (/programs): GOD's own activities, a separate entity from Opportunities (orange accent). Built on the shared
 * list template.
 *
 * - Summary strip (ProgramSummary): ONE MiniStat, "Active" (planned + running). Delivered is only in the status filter below.
 *   It counts ALL programs, so it does not move when a filter is used.
 * - Columns: Program (orange icon tile, the type underneath), Status, Partner, Participants ("42 of 60" with a 6px purple
 *   bar), Start date, Country.
 * - Filters (they combine): Status (SegmentedControl with counts), Type and Country (the custom Select). The status counts
 *   follow the Type and Country filters.
 * - "New program" (primary) needs edit access on programs: Training Officer, Desk Lead, Super Admin. Country Lead can open
 *   the page and read it (view) and sees no such button.
 * Real mode reads /admin/programs (services/programs.ts); mock mode shows the sample data.
 * Data: services/programs.ts (shared mock store, live). Loading, empty and error states come from useListData; the dev
 * ?state=loading|empty|error switch works here.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { GraduationCap, Plus } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { useRoles } from "@/components/access/RoleProvider";
import { formatDate } from "@/lib/format";
import { PROGRAM_STATUSES, PROGRAM_TYPES, type ProgramStatus, type ProgramType } from "@/lib/mock-entities";
import { loadProgramRows, subscribeProgramStore, type ProgramRow } from "@/lib/services/programs";
import { useListData } from "@/lib/use-list-data";
import { DataTable } from "@/components/list/DataTable";
import { ListPage } from "@/components/list/ListPage";
import { FilterSelect, TableToolbar } from "@/components/list/TableToolbar";
import type { Column } from "@/components/list/types";
import { PROGRAM_STATUS_LABELS, PROGRAM_TYPE_META } from "@/components/programs/program-meta";
import { ProgramSummary } from "@/components/programs/ProgramSummary";
import { type SelectOption } from "@/components/ui/form/Select";

const ALL = "all";
type StatusFilter = "all" | ProgramStatus;

const typeOf = (row: ProgramRow) => PROGRAM_TYPE_META[row.type];

const COLUMNS: Column<ProgramRow>[] = [
  {
    key: "program",
    header: "Program",
    type: "primary",
    width: "28%",
    title: (r) => r.name,
    subtitle: (r) => typeOf(r).label,
    leading: (r) => ({ icon: typeOf(r).icon, tone: "brand" }),
  },
  { key: "status", header: "Status", type: "status", width: "12%", status: (r) => r.status },
  { key: "partner", header: "Partner", type: "text", width: "16%", value: (r) => r.partnerName ?? "—" },
  {
    key: "participants",
    header: "Participants",
    type: "progress",
    width: "20%",
    label: (r) => `${r.participants} of ${r.target}`,
    percent: (r) => Math.round((r.participants / Math.max(1, r.target)) * 100),
  },
  { key: "start", header: "Start date", type: "text", width: "12%", value: (r) => formatDate(r.startAt) },
  { key: "country", header: "Country", type: "text", width: "12%", value: (r) => r.country },
];

export default function ProgramsPage() {
  const { rows, isLoading, error, retry } = useListData(loadProgramRows, { subscribe: subscribeProgramStore });
  const { can } = useRoles();
  const [status, setStatus] = useState<StatusFilter>(ALL);
  const [type, setType] = useState<string>(ALL);
  const [country, setCountry] = useState<string>(ALL);

  const all = useMemo(() => rows ?? [], [rows]);
  const typeOptions: SelectOption<string>[] = [{ value: ALL, label: "All types" }, ...PROGRAM_TYPES.map((value) => ({ value, label: PROGRAM_TYPE_META[value].label }))];
  const countryOptions: SelectOption<string>[] = useMemo(
    () => [{ value: ALL, label: "All countries" }, ...[...new Set(all.map((row) => row.country))].sort().map((name) => ({ value: name, label: name }))],
    [all],
  );

  // Type and Country first; the status tabs and their counts then work on what is left.
  const scoped = all.filter((row) => (type === ALL || row.type === (type as ProgramType)) && (country === ALL || row.country === country));
  const visible = status === ALL ? scoped : scoped.filter((row) => row.status === status);
  const options = [
    { value: ALL as StatusFilter, label: "All", count: rows ? scoped.length : undefined },
    ...PROGRAM_STATUSES.map((value) => ({
      value: value as StatusFilter,
      label: PROGRAM_STATUS_LABELS[value],
      count: rows ? scoped.filter((row) => row.status === value).length : undefined,
    })),
  ];
  const filtered = status !== ALL || type !== ALL || country !== ALL;

  return (
    <ListPage
      title="Programs"
      subtitle="The desk's own activities: trainings, bootcamps, webinars and more."
      action={can("programs", "edit") ? { label: "New program", href: "/programs/new", icon: Plus } : undefined}
      toolbar={
        <div className="space-y-4">
          <ProgramSummary programs={rows} />
          <TableToolbar filters={{ options, value: status, onChange: setStatus, label: "Filter by status" }}>
            <FilterSelect options={typeOptions} value={type} onChange={setType} ariaLabel="Filter by type" sheetTitle="Type" />
            <FilterSelect options={countryOptions} value={country} onChange={setCountry} ariaLabel="Filter by country" sheetTitle="Country" />
          </TableToolbar>
        </div>
      }
    >
      <DataTable
        onClearFilters={() => { setStatus(ALL); setType(ALL); setCountry(ALL); }}
        label="Programs"
        columns={COLUMNS}
        rows={visible}
        getRowKey={(r) => r.id}
        getRowHref={(r) => `/programs/${r.id}`}
        loading={isLoading}
        error={error}
        onRetry={retry}
        isFiltered={filtered}
        resetKey={`${status}|${type}|${country}`}
        emptyNoData={{
          icon: GraduationCap,
          title: "No programs yet",
          description: "Trainings, bootcamps and webinars the desk runs appear here.",
          // The first-program action (only for a role that may add programs).
          action: can("programs", "edit") ? (
            <Link href="/programs/new" className={buttonClasses("primary")}>
              <Plus size={16} strokeWidth={2} aria-hidden="true" />
              Add your first program
            </Link>
          ) : undefined,
        }}
        emptyNoResults={{ icon: GraduationCap, title: "No programs match these filters", description: "Try another status, type or country." }}
      />
    </ListPage>
  );
}
