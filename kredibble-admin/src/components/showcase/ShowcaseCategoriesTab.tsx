"use client";

/**
 * ShowcaseCategoriesTab: the categories of the app's Meet our people page (Ambassadors, Team, Partners, Stakeholders and any the
 * admin adds, such as Developers). Needs the showcase.manage permission (Super Admin and Desk Lead); the page only renders it for them.
 *
 * Columns: Category (name, and what it shows: people or organisations), Entries (how many), Status (Visible or Hidden), Order
 * (up and down buttons) and a menu: Rename, Show / Hide, Delete (disabled with a reason for the four built-in categories and for any
 * category that still has entries). A hidden category hides everything in it from the app.
 *
 * Props: manager (the object from useShowcaseManager).
 */
import { Eye, EyeOff, Layers, Pencil, Trash2 } from "lucide-react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { ShowcaseCategory } from "@/lib/mock-entities";
import { KIND_LABEL } from "@/lib/showcase";
import { DataTable } from "@/components/list/DataTable";
import type { Column } from "@/components/list/types";
import { IconButton } from "@/components/ui/IconButton";
import { Kebab } from "@/components/ui/Kebab";
import type { useShowcaseManager } from "./use-showcase-manager";

type Manager = ReturnType<typeof useShowcaseManager>;

export function ShowcaseCategoriesTab({ manager }: { manager: Manager }) {
  const { categories, entries } = manager;
  const count = (category: ShowcaseCategory) => entries.filter((entry) => entry.categoryId === category.id).length;

  const columns: Column<ShowcaseCategory>[] = [
    { key: "name", header: "Category", type: "primary", width: "34%", title: (row) => row.name, subtitle: (row) => KIND_LABEL[row.kind] },
    { key: "entries", header: "Entries", type: "number", width: "12%", value: (row) => count(row) },
    { key: "status", header: "Status", type: "status", width: "16%", status: (row) => (row.visible ? "visible" : "hidden") },
    {
      key: "order",
      header: "Order",
      type: "custom",
      width: "16%",
      render: (row) => (
        <div className="relative z-10 flex gap-1 focus-within:z-20" role="group" aria-label={`Order of ${row.name}`}>
          <IconButton label={`Move ${row.name} up`} icon={ArrowUp} disabled={row.order === categories[0]?.order} onClick={() => manager.moveCategoryUpDown(row, "up")} />
          <IconButton label={`Move ${row.name} down`} icon={ArrowDown} disabled={row.order === categories[categories.length - 1]?.order} onClick={() => manager.moveCategoryUpDown(row, "down")} />
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      type: "custom",
      width: "56px",
      render: (row) => {
        const verdict = manager.categoryDeleteVerdict(row);
        return (
          <div className="relative z-10 flex justify-end focus-within:z-20 max-sm:justify-start">
            <span className="sr-only" aria-hidden="true">
              Category actions
            </span>
            <Kebab
              label={`Category actions for ${row.name}`}
              items={[
                { label: "Rename", icon: Pencil, onSelect: () => manager.openEditCategory(row) },
                { label: row.visible ? "Hide from the app" : "Show on the app", icon: row.visible ? EyeOff : Eye, onSelect: () => manager.toggleCategoryVisible(row) },
                { label: "Delete", icon: Trash2, danger: true, onSelect: () => manager.removeCategory(row), disabled: !verdict.allowed, hint: verdict.allowed ? undefined : verdict.reason },
              ]}
            />
          </div>
        );
      },
    },
  ];

  return (
    <DataTable
      label="Showcase categories"
      columns={columns}
      rows={categories}
      getRowKey={(row) => row.id}
      pageSize={25}
      emptyNoData={{ icon: Layers, title: "No categories yet", description: "Add a category to start featuring people on the app." }}
      emptyNoResults={{ icon: Layers, title: "No categories match" }}
    />
  );
}
