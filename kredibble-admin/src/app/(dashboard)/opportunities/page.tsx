"use client";

/**
 * Opportunities queue: ONE list for everything that can become an opportunity on the platform.
 *   - Hirer-submitted postings (Jobs, Internships, Events, Grants), moderated here: pending, approved, rejected.
 *   - Staff-curated listings (also scholarships and fellowships), made by the desk: draft or published, and gated by
 *     vetting ("Listings must be vetted before they can be published").
 * Built on the shared list template; this file holds the column config, the filters and the data loader.
 *
 * Filters (all combine; counts on the type tabs follow the other filters):
 *   - Type tabs: All and the eight opportunity categories (Events & Competitions, Volunteerism & Community Service, Awards, Grants & Funding,
 *     Jobs & Internships, Scholarships, Fellowships & Exchange Programmes, Training & Workshops, Mentorship & Career Development)
 *   - Source: All, Hirer-submitted, Staff-curated (SegmentedControl)
 *   - Country and Status (the custom Select; Status lists the moderation and the listing statuses)
 * Columns: Title, Company, Type, Source (pill), Vetting (curated rows only, "—" for hirer postings), Posted, Status.
 * "New listing" (primary) needs EDIT access on listings_curate: Opportunities Officer, Desk Lead, Super Admin. Everyone
 * else who can open the page (a Moderator, for instance) reviews hirer postings and sees no such button.
 *
 * Curated listings are saved on the server in real-API mode (GOD-T31), so the old "kept in memory" note is gone (mock mode
 * shows nothing).
 *
 * Bulk delete (GOD-T103), for roles with EDIT on listings_curate (the same rule as the API): a checkbox on each row and "select this
 * page" in the header; with anything ticked, a bar says how many and offers "Delete selected", which asks first (naming the count and
 * that it also leaves the website) and then reports what was deleted and anything that could not be, with the reason. Ticks stay while
 * the filters change, and the bar counts only what is still in the list.
 *
 * Data: loadOpportunityRows() (services/opportunities.ts) merges the hirer postings (mock, or every page of
 * GET /admin/opportunities) with the curated listings of the shared store. Everything loads once; filtering is done here. A failed request shows inline with "Try again".
 */
import { useMemo, useState } from "react";
import { Briefcase, Plus, Trash2 } from "lucide-react";
import { useRoles } from "@/components/access/RoleProvider";
import { formatDate } from "@/lib/format";
import { OPPORTUNITY_CATEGORIES, categoryOfTypeKey, opportunityTypeMeta } from "@/lib/opportunity-types";
import { deleteOpportunities, loadOpportunityRows, type OpportunityRow, type OpportunitySource } from "@/lib/services/opportunities";
import { subscribeMockStore } from "@/lib/mock-store";
import { useListData } from "@/lib/use-list-data";
import { DataTable } from "@/components/list/DataTable";
import { ListPage } from "@/components/list/ListPage";
import { EmptyAction } from "@/components/list/EmptyAction";
import { FilterSelect, TableToolbar } from "@/components/list/TableToolbar";
import type { Column } from "@/components/list/types";
import { type SelectOption } from "@/components/ui/form/Select";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Button } from "@/components/ui/Button";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { pluralize } from "@/lib/plural";

/** The tabs: All, then the eight opportunity categories (lib/opportunity-types.ts). A row is in the category its type belongs to. */
type TypeTab = "all" | string;
const TABS: { value: TypeTab; label: string }[] = [{ value: "all", label: "All" }, ...OPPORTUNITY_CATEGORIES.map((category) => ({ value: category.key, label: category.label }))];
const inTab = (row: OpportunityRow, tab: TypeTab) => (tab === "all" ? true : categoryOfTypeKey(row.type)?.key === tab);

type SourceFilter = "all" | OpportunitySource;
const SOURCES: { value: SourceFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "hirer", label: "Hirer-submitted" },
  { value: "curated", label: "Staff-curated" },
];

const ALL = "all";
const STATUS_OPTIONS: SelectOption<string>[] = [
  { value: ALL, label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
];

const typeOf = (row: OpportunityRow) => opportunityTypeMeta(row.type);

const COLUMNS: Column<OpportunityRow>[] = [
  {
    key: "title",
    header: "Title",
    type: "primary",
    width: "22%",
    title: (r) => r.title,
    subtitle: (r) => (r.applicantsCount === undefined ? undefined : `${r.applicantsCount} applied`),
  },
  { key: "company", header: "Company", type: "text", width: "14%", value: (r) => r.company },
  { key: "type", header: "Type", type: "text", width: "12%", value: (r) => typeOf(r).label, icon: (r) => typeOf(r).icon },
  // Unslop pass: plain text. The same lavender pill on every row was noise; Vetting and Status keep their chips because they vary.
  { key: "source", header: "Source", type: "text", width: "11%", value: (r) => (r.source === "curated" ? "Staff-curated" : "Hirer") },
  { key: "vetting", header: "Vetting", type: "status", width: "14%", status: (r) => r.vetting },
  { key: "posted", header: "Posted", type: "text", width: "12%", value: (r) => formatDate(r.date) },
  { key: "status", header: "Status", type: "status", width: "15%", status: (r) => r.moderationStatus },
];

export default function OpportunitiesQueuePage() {
  const { rows, isLoading, error, retry } = useListData(loadOpportunityRows, { subscribe: subscribeMockStore });
  const { can } = useRoles();
  const [tab, setTab] = useState<TypeTab>("all");
  const [source, setSource] = useState<SourceFilter>("all");
  const [country, setCountry] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const { confirm, dialog } = useConfirmDialog();
  const toast = useToast();
  const canDelete = can("listings_curate", "edit");

  const all = useMemo(() => rows ?? [], [rows]);
  // Only ticks on rows that still exist count (a row deleted elsewhere drops out).
  const selectedRows = all.filter((row) => selected.has(row.id));
  const countryOptions: SelectOption<string>[] = useMemo(
    () => [
      { value: ALL, label: "All countries" },
      ...[...new Set(all.map((row) => row.country).filter((name): name is string => !!name))].sort().map((name) => ({ value: name, label: name })),
    ],
    [all],
  );

  // Source, Country and Status first; the type tabs and their counts then work on what is left.
  const scoped = all.filter(
    (row) => (source === "all" || row.source === source) && (country === ALL || row.country === country) && (status === ALL || row.moderationStatus === status),
  );
  const visible = scoped.filter((row) => inTab(row, tab));
  const options = TABS.map((entry) => ({
    value: entry.value,
    label: entry.label,
    count: rows ? scoped.filter((row) => inTab(row, entry.value)).length : undefined,
  }));
  const pendingCount = all.filter((row) => row.source === "hirer" && row.moderationStatus === "pending").length;
  const filtered = tab !== "all" || source !== "all" || country !== ALL || status !== ALL;

  const deleteSelected = () => {
    const targets = selectedRows;
    if (!canDelete || targets.length === 0) return;
    const count = pluralize(targets.length, "opportunity", "opportunities");
    confirm({
      title: `Delete ${count}?`,
      description: `${targets.length === 1 ? `"${targets[0]!.title}" is` : `These ${count} are`} removed from the admin, the app and the website. This can't be undone.`,
      confirmLabel: `Delete ${count}`,
      onConfirm: async () => {
        setDeleting(true);
        try {
          const result = await deleteOpportunities(targets.map((row) => row.id));
          setSelected((current) => new Set([...current].filter((id) => !result.deleted.includes(id))));
          if (result.deleted.length > 0) toast.success(`${pluralize(result.deleted.length, "opportunity", "opportunities")} deleted.`);
          if (result.failed.length > 0) {
            const first = result.failed[0]!;
            const name = first.title ?? targets.find((row) => row.id === first.id)?.title ?? "One";
            toast.error(`${pluralize(result.failed.length, "opportunity", "opportunities")} could not be deleted. ${name}: ${first.reason}`);
          }
        } catch (error) {
          toast.error(error instanceof Error ? `Nothing was deleted: ${error.message}` : "Nothing was deleted.");
        } finally {
          setDeleting(false);
          retry();
        }
      },
    });
  };

  return (
    <ListPage
      title="Opportunities queue"
      subtitle={`Review postings from hirers and manage the listings the desk curates.${rows ? ` ${pendingCount} awaiting review.` : ""}`}
      action={can("listings_curate", "edit") ? { label: "New listing", href: "/opportunities/new", icon: Plus } : undefined}
      toolbar={
        <div className="space-y-3">
          <TableToolbar filters={{ options, value: tab, onChange: setTab, label: "Filter by type" }}>
            <SegmentedControl options={SOURCES} value={source} onChange={setSource} ariaLabel="Filter by source" />
            <FilterSelect options={countryOptions} value={country} onChange={setCountry} ariaLabel="Filter by country" sheetTitle="Country" />
            <FilterSelect options={STATUS_OPTIONS} value={status} onChange={setStatus} ariaLabel="Filter by status" sheetTitle="Status" />
          </TableToolbar>
          {canDelete && selectedRows.length > 0 && (
            <div data-testid="bulk-bar" className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line bg-surface-2 px-4 py-2">
              <p className="caption font-semibold text-ink" role="status">{pluralize(selectedRows.length, "opportunity", "opportunities")} selected</p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setSelected(new Set())} disabled={deleting}>Clear selection</Button>
                <Button variant="danger" size="sm" icon={Trash2} onClick={deleteSelected} loading={deleting}>Delete selected</Button>
              </div>
            </div>
          )}
        </div>
      }
    >
      <DataTable
        onClearFilters={() => { setTab("all"); setSource("all"); setCountry(ALL); setStatus(ALL); }}
        label="Opportunities"
        columns={COLUMNS}
        rows={visible}
        getRowKey={(r) => r.id}
        getRowHref={(r) => `/opportunities/${r.id}`}
        loading={isLoading}
        error={error}
        onRetry={retry}
        isFiltered={filtered}
        resetKey={`${tab}|${source}|${country}|${status}`}
        selection={canDelete ? { selected, onChange: (next) => setSelected(next), itemLabel: (row) => `Select ${row.title}` } : undefined}
        emptyNoData={{ icon: Briefcase, title: "No opportunities yet", description: "Postings from hirers and the desk's own listings appear here.", action: can("listings_curate", "edit") ? <EmptyAction href="/opportunities/new" label="Add your first listing" /> : undefined }}
        emptyNoResults={{ icon: Briefcase, title: "No opportunities match these filters", description: "Try another type, source, country or status." }}
      />
      {dialog}
    </ListPage>
  );
}
