"use client";

/**
 * Database (/database): the beneficiary records kept by the desk. Built on the shared list template.
 *
 * - Top: RecordsPaceCard. "Verified this month" against the Beneficiaries verified target with a pro-rated pace tick and a
 *   status in words (all from recordsPace() in services/database.ts), and a mini bar of the records by source with a legend.
 * - Columns: Record (avatar, name, email), Country, Institution (two lines, full text in the tooltip), Source pill, Linked
 *   (the referring ambassador and the opportunity; links only for roles that can view those pages), Verified (a badge, and a
 *   Verify button on a pending row), Added by and on (24px avatar, name, date; "App registration" for a record the person
 *   created by registering in the app, and "Manual entry" under a staff record: GOD-T3).
 * - Filters (they combine): Source (Select), Entry (Select: app registrations or manual entries), Verification (SegmentedControl: All, Verified, Pending, with counts) and a search by
 *   name, email or institution. The counts follow the other filters; the pace card and the sidebar pill count ALL records.
 * - Verify (edit access on database: Database Officer, Desk Lead, Super Admin): a 40px icon button (the word on phones) that
 *   sits above the row link, so it never opens the record. It verifies at once and a toast offers Undo for 5 seconds. A role that
 *   can only view sees no Verify button and no "Add record".
 * Real mode: the rows and the pace card come from the API (services/database.ts) and reload after every change. Mock mode:
 * rows come from the live store, so a verification shows in the same render everywhere, and the dev ?state=
 * loading|empty|error switch works.
 */
import { useCallback, useMemo, useState } from "react";
import { Database as DatabaseIcon, Plus } from "lucide-react";
import { useRoles } from "@/components/access/RoleProvider";
import { LinkedCell } from "@/components/database/LinkedCell";
import { RecordCard } from "@/components/database/RecordCard";
import { RecordsPaceCard } from "@/components/database/RecordsPaceCard";
import { useVerifyRecord } from "@/components/database/use-verify-record";
import { VerifyButton } from "@/components/database/VerifyButton";
import { DataTable } from "@/components/list/DataTable";
import { ListPage } from "@/components/list/ListPage";
import { TableToolbar } from "@/components/list/TableToolbar";
import type { Column } from "@/components/list/types";
import { Avatar } from "@/components/ui/Avatar";
import { Select, type SelectOption } from "@/components/ui/form/Select";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TruncatedText } from "@/components/ui/TruncatedText";
import { formatDate } from "@/lib/format";
import { RECORD_ORIGINS, RECORD_ORIGIN_FILTER_LABELS, RECORD_ORIGIN_LABELS, RECORD_SOURCES, RECORD_SOURCE_LABELS, recordOrigin, type RecordOrigin, type RecordSource } from "@/lib/mock-entities";
import { useMockCollection, useMockStoreVersion } from "@/lib/mock-store";
import { loadRecordRows, loadRecordsPace, recordLinkAccess, recordsPace, sourceBreakdown, subscribeDatabase, toRecordRows, type RecordRow, type RecordsPace } from "@/lib/services/database";
import { isMockMode } from "@/lib/services/mock-mode";
import { useAsync } from "@/lib/use-async";
import { useListData } from "@/lib/use-list-data";

const ALL = "all";
type VerificationFilter = "all" | "verified" | "pending";

export default function DatabasePage() {
  const { rows: loaded, isLoading, error, retry } = useListData(loadRecordRows, { subscribe: subscribeDatabase });
  const records = useMockCollection("databaseRecords");
  const storeVersion = useMockStoreVersion();
  const { can } = useRoles();
  const verify = useVerifyRecord();
  const [verification, setVerification] = useState<VerificationFilter>(ALL);
  const [source, setSource] = useState<string>(ALL);
  const [origin, setOrigin] = useState<string>(ALL);
  const [search, setSearch] = useState("");

  const canEdit = can("database", "edit");
  const access = recordLinkAccess(can);
  // Real mode shows what the server sent, and its pace (asked again each time the list loads). Mock mode works on the live
  // store, once the first load is done (a forced ?state=empty keeps the list empty).
  const live = !isMockMode();
  const all = useMemo(() => (live ? loaded : loaded === null ? null : loaded.length === 0 ? [] : toRecordRows(records)), [live, loaded, records]);
  const loadPace = useCallback((): Promise<RecordsPace | null> => (live && loaded !== null ? loadRecordsPace() : Promise.resolve(null)), [live, loaded]);
  const { data: livePace } = useAsync(loadPace);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mockPace = useMemo(() => (live || all === null ? null : recordsPace()), [live, all, storeVersion]);
  const pace = live ? livePace : mockPace;
  const sources = useMemo(() => (all === null ? null : sourceBreakdown(all)), [all]);

  const columns: Column<RecordRow>[] = [
    {
      key: "record",
      header: "Record",
      type: "primary",
      width: "18%",
      title: (r) => r.name,
      subtitle: (r) => r.email,
      leading: (r) => ({ avatarName: r.name }),
    },
    { key: "country", header: "Country", type: "text", width: "9%", value: (r) => r.country },
    {
      key: "institution",
      header: "Institution",
      type: "custom",
      width: "12%",
      render: (r) => <TruncatedText text={r.institution} lines={2} className="table-text" />,
    },
    { key: "source", header: "Source", type: "pill", width: "14%", label: (r) => RECORD_SOURCE_LABELS[r.source] },
    { key: "linked", header: "Linked", type: "custom", width: "15%", render: (r) => <LinkedCell record={r} access={access} /> },
    {
      key: "verified",
      header: "Verified",
      type: "custom",
      width: "17%",
      render: (r) => (
        <div className="flex items-center gap-2 max-sm:justify-end">
          {/* The badge (the shared StatusBadge) on every row; a pending row (for a role that can edit) also has the Verify button.
              The table's column widths are fixed, so the column is the same width on every row. */}
          <StatusBadge status={r.verified ? "verified" : "pending"} />
          {!r.verified && canEdit && <VerifyButton name={r.name} onVerify={() => verify(r)} />}
        </div>
      ),
    },
    {
      key: "added",
      header: "Added by and on",
      type: "custom",
      width: "15%",
      render: (r) => {
        // An app registration was added by the person, not by staff: it says so instead of a staff name.
        const fromApp = recordOrigin(r) === "app";
        return (
          <div data-testid="record-origin" data-origin={recordOrigin(r)} className="flex min-w-0 items-center gap-2">
            {!fromApp && r.addedByName ? <Avatar name={r.addedByName} size="xs" /> : null}
            <div className="min-w-0">
              <TruncatedText text={fromApp ? RECORD_ORIGIN_LABELS.app : (r.addedByName ?? "—")} className="table-text" />
              <p className="caption tabular-nums">{fromApp ? formatDate(r.createdAt) : `${RECORD_ORIGIN_LABELS.manual} · ${formatDate(r.createdAt)}`}</p>
            </div>
          </div>
        );
      },
    },
  ];

  const sourceOptions: SelectOption<string>[] = [{ value: ALL, label: "All sources" }, ...RECORD_SOURCES.map((value) => ({ value, label: RECORD_SOURCE_LABELS[value] }))];
  const originOptions: SelectOption<string>[] = [{ value: ALL, label: "All entries" }, ...RECORD_ORIGINS.map((value) => ({ value, label: RECORD_ORIGIN_FILTER_LABELS[value] }))];

  // Source and the search first; the verification tabs and their counts then work on what is left.
  const term = search.trim().toLowerCase();
  const scoped = (all ?? []).filter(
    (r) =>
      (source === ALL || r.source === (source as RecordSource)) &&
      (origin === ALL || recordOrigin(r) === (origin as RecordOrigin)) &&
      (!term || r.name.toLowerCase().includes(term) || r.email.toLowerCase().includes(term) || r.institution.toLowerCase().includes(term)),
  );
  const visible = verification === ALL ? scoped : scoped.filter((r) => (verification === "verified" ? r.verified : !r.verified));
  const known = all !== null;
  const options = [
    { value: "all" as VerificationFilter, label: "All", count: known ? scoped.length : undefined },
    { value: "verified" as VerificationFilter, label: "Verified", count: known ? scoped.filter((r) => r.verified).length : undefined },
    { value: "pending" as VerificationFilter, label: "Pending", count: known ? scoped.filter((r) => !r.verified).length : undefined },
  ];
  const filtered = verification !== ALL || source !== ALL || origin !== ALL || term !== "";

  return (
    <ListPage
      title="Database"
      subtitle="Beneficiary records kept by the desk."
      action={canEdit ? { label: "Add record", href: "/database/new", icon: Plus } : undefined}
      toolbar={
        <div className="space-y-4">
          <RecordsPaceCard pace={pace} sources={sources} error={error ? "Could not load the records." : null} onRetry={retry} />
          <TableToolbar
            search={{ value: search, onChange: setSearch, placeholder: "Search by name, email or institution", label: "Search records" }}
            filters={{ options, value: verification, onChange: setVerification, label: "Filter by verification" }}
          >
            <Select options={sourceOptions} value={source} onChange={setSource} ariaLabel="Filter by source" sheetTitle="Source" className="w-fit" />
            <Select options={originOptions} value={origin} onChange={setOrigin} ariaLabel="Filter by entry" sheetTitle="Entry" className="w-fit" />
          </TableToolbar>
        </div>
      }
    >
      <DataTable
        label="Records"
        columns={columns}
        rows={visible}
        getRowKey={(r) => r.id}
        getRowHref={(r) => `/database/${r.id}`}
        renderCard={(r) => <RecordCard record={r} access={access} canEdit={canEdit} onVerify={() => verify(r)} />}
        loading={isLoading}
        error={error}
        onRetry={retry}
        isFiltered={filtered}
        resetKey={`${verification}|${source}|${origin}|${term}`}
        emptyNoData={{ icon: DatabaseIcon, title: "No records yet", description: "Beneficiaries the desk adds, or that come in through the channels, appear here." }}
        emptyNoResults={{ icon: DatabaseIcon, title: "No records match these filters", description: "Try another source, entry type, verification state or search." }}
      />
    </ListPage>
  );
}
