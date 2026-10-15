"use client";

/**
 * Showcase (/showcase): the people and organisations featured on the app's "Meet our people" page (reached from the Profile tab).
 * Built on the shared list template parts (TableToolbar + DataTable, with the Team page's header layout) and the dialog / form system.
 *
 * - People and organisations: every entry with its category, country and a Visible / Hidden chip (a word, not only a colour).
 *   Filter by category (with counts) and search by name or title. Order buttons move an entry up or down inside its category.
 *   A row menu: Edit, Hide / Show, Delete. "Add entry" opens the form (photo upload, short bio, "Provided by" note, a Show-on-the-app
 *   switch). Publishing is direct: Visible means it is on the app as soon as it is saved. "Preview on the app" shows what the app shows.
 * - Categories (Super Admin and Desk Lead only, permission showcase.manage): add a category such as "Developers", rename, reorder,
 *   hide, delete (only a custom, empty one).
 * - Access: the Super Admin, Desk Lead and Communications Officer edit everything; the Country Lead edits Ambassadors only; the
 *   Partnerships Officer edits Partners only (see lib/showcase.ts canEditCategory). Anyone else cannot open the page. Controls are not
 *   rendered without permission and every handler checks again.
 * - Every change writes an audit entry, shown in "History".
 * Data: services/showcase.ts (in-memory mock store). TODO(backend): persist this change (see task.md).
 */
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, History, Pencil, Plus, Smartphone, Star, Trash2 } from "lucide-react";
import type { ShowcaseEntry } from "@/lib/mock-entities";
import { entriesOf } from "@/lib/showcase";
import { loadShowcaseEntries, subscribeShowcase } from "@/lib/services/showcase";
import { useListData } from "@/lib/use-list-data";
import { DataTable } from "@/components/list/DataTable";
import { TableToolbar } from "@/components/list/TableToolbar";
import type { Column } from "@/components/list/types";
import { ShowcaseCategoriesTab } from "@/components/showcase/ShowcaseCategoriesTab";
import { useShowcaseManager } from "@/components/showcase/use-showcase-manager";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Kebab } from "@/components/ui/Kebab";
import { NotConnectedNotice } from "@/components/ui/NotConnectedNotice";
import { Tabs, tabId, tabPanelId } from "@/components/ui/Tabs";

type PageTab = "entries" | "categories";
const ID_PREFIX = "showcase";
const ALL = "all";

export default function ShowcasePage() {
  const manager = useShowcaseManager();
  const { rows, isLoading, error, retry } = useListData(loadShowcaseEntries, { subscribe: subscribeShowcase });
  const [tab, setTab] = useState<PageTab>("entries");
  const [category, setCategory] = useState<string>(ALL);
  const [term, setTerm] = useState("");

  const categories = manager.categories;
  const all = useMemo(() => rows ?? [], [rows]);
  const categoryName = (id: string) => categories.find((item) => item.id === id)?.name ?? "—";

  const visible = useMemo(() => {
    const needle = term.trim().toLowerCase();
    const inCategory = category === ALL ? all : all.filter((entry) => entry.categoryId === category);
    return categories
      .flatMap((item) => entriesOf(inCategory, item.id))
      .filter((entry) => needle === "" || `${entry.name} ${entry.title}`.toLowerCase().includes(needle));
  }, [all, categories, category, term]);

  const filterOptions = [
    { value: ALL, label: "All", count: all.length },
    ...categories.map((item) => ({ value: item.id, label: item.name, count: all.filter((entry) => entry.categoryId === item.id).length })),
  ];

  const columns: Column<ShowcaseEntry>[] = [
    {
      key: "person",
      header: "Name",
      type: "primary",
      width: "28%",
      title: (row) => row.name,
      subtitle: (row) => row.title,
      leading: (row) => ({ avatarName: row.name, imageSrc: row.photoUrl }),
    },
    { key: "category", header: "Category", type: "pill", width: "14%", label: (row) => categoryName(row.categoryId) },
    { key: "country", header: "Country", type: "text", width: "12%", value: (row) => row.country ?? "—" },
    { key: "status", header: "Status", type: "status", width: "12%", status: (row) => (row.visible ? "visible" : "hidden") },
    {
      key: "order",
      header: "Order",
      type: "custom",
      width: "14%",
      render: (row) => {
        const editable = manager.canEdit(categories.find((item) => item.id === row.categoryId));
        if (!editable) return <span className="caption">—</span>;
        const siblings = entriesOf(all, row.categoryId);
        return (
          <div className="relative z-10 flex gap-1 focus-within:z-20" role="group" aria-label={`Order of ${row.name}`}>
            <IconButton label={`Move ${row.name} up`} icon={ArrowUp} disabled={siblings[0]?.id === row.id} onClick={() => manager.moveEntryUpDown(row, "up")} />
            <IconButton label={`Move ${row.name} down`} icon={ArrowDown} disabled={siblings[siblings.length - 1]?.id === row.id} onClick={() => manager.moveEntryUpDown(row, "down")} />
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "Actions",
      type: "custom",
      width: "56px",
      render: (row) => {
        if (!manager.canEdit(categories.find((item) => item.id === row.categoryId))) return <span className="caption">—</span>;
        return (
          <div className="relative z-10 flex justify-end focus-within:z-20 max-sm:justify-start">
            <span className="sr-only" aria-hidden="true">
              Entry actions
            </span>
            <Kebab
              label={`Entry actions for ${row.name}`}
              items={[
                { label: "Edit", icon: Pencil, onSelect: () => manager.openEdit(row) },
                { label: row.visible ? "Hide from the app" : "Show on the app", icon: row.visible ? EyeOff : Eye, onSelect: () => manager.toggleVisible(row) },
                { label: "Delete", icon: Trash2, danger: true, onSelect: () => manager.removeEntry(row) },
              ]}
            />
          </div>
        );
      },
    },
  ];

  const action = (
    <div className="flex flex-wrap items-center gap-3">
      {manager.canAddEntries && (
        <Button variant="ghost" icon={History} onClick={manager.openHistory} data-testid="showcase-history-open">
          History
        </Button>
      )}
      <Button variant="secondary" icon={Smartphone} onClick={manager.openPreview} data-testid="showcase-preview-open">
        Preview on the app
      </Button>
      {tab === "entries" && manager.canAddEntries && (
        <Button icon={Plus} onClick={manager.openAdd} data-testid="showcase-add">
          Add entry
        </Button>
      )}
      {tab === "categories" && manager.canManageCategories && (
        <Button icon={Plus} onClick={manager.openAddCategory} data-testid="showcase-add-category">
          Add category
        </Button>
      )}
    </div>
  );

  return (
    <>
      <div className="flex flex-1 flex-col gap-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 data-testid="page-title" className="page-title">
              Showcase
            </h1>
            <p className="page-subtitle mt-1">The people and partners featured on the app&apos;s Meet our people page. Visible means live as soon as it is saved.</p>
          </div>
          {action}
        </header>
        <NotConnectedNotice />
        {manager.canManageCategories && (
          <Tabs
            ariaLabel="Showcase sections"
            idPrefix={ID_PREFIX}
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "entries", label: "People and organisations" },
              { value: "categories", label: "Categories" },
            ]}
          />
        )}
        {tab === "entries" && (
          <TableToolbar
            search={{ value: term, onChange: setTerm, placeholder: "Search by name or role", label: "Search the showcase" }}
            filters={{ options: filterOptions, value: category, onChange: setCategory, label: "Filter by category" }}
          />
        )}
        <div role="tabpanel" id={tabPanelId(ID_PREFIX, "entries")} aria-labelledby={tabId(ID_PREFIX, "entries")} hidden={tab !== "entries"}>
          <DataTable
            label="Showcase entries"
            columns={columns}
            rows={visible}
            getRowKey={(row) => row.id}
            loading={isLoading}
            error={error}
            onRetry={retry}
            isFiltered={category !== ALL || term.trim() !== ""}
            resetKey={`${category}|${term}`}
            pageSize={10}
            emptyNoData={{ icon: Star, title: "Nobody is featured yet", description: "Add the first person or partner to show on the app." }}
            emptyNoResults={{ icon: Star, title: "No entries match", description: "Try another category or clear the search." }}
          />
        </div>
        {manager.canManageCategories && (
          <div role="tabpanel" id={tabPanelId(ID_PREFIX, "categories")} aria-labelledby={tabId(ID_PREFIX, "categories")} hidden={tab !== "categories"}>
            <ShowcaseCategoriesTab manager={manager} />
          </div>
        )}
      </div>
      {manager.dialogs}
    </>
  );
}
