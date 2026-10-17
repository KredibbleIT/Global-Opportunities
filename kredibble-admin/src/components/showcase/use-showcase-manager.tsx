"use client";

/**
 * useShowcaseManager: everything the Showcase page needs for adding, editing, showing, hiding, ordering and deleting entries and
 * categories, in one place. Returns:
 *  - categories, entries (live), editableCategories (the ones this person may change), canAddEntries, canManageCategories
 *  - canEdit(category): may this person change entries in that category?
 *  - openAdd(), openEdit(entry), openAddCategory(), openEditCategory(category), openPreview(), openHistory()
 *  - toggleVisible(entry), moveEntryUpDown(entry, direction), removeEntry(entry); the same for categories
 *  - dialogs: render this once; it holds the forms, the preview, the history and the confirm dialog.
 *
 * Two layers of access, both required (the same pattern as Create account):
 *  1. controls are only rendered when the person may use them, and
 *  2. every handler asks can(...) again (lib/showcase canEditCategory, and showcase.manage for categories) and refuses with a message,
 *     so the action cannot be reached any other way (for example a form that was open when the role changed).
 * The server enforces the same rules in real mode (BE-030: roles from the session, per category); this layer is for the experience.
 * Every change waits for the server; a refusal shows the server's message (a toast, or the open form's message) and changes nothing.
 */
import { useState, type ReactNode } from "react";
import { ROLES } from "@/config/roles";
import { getAdminUser } from "@/lib/api";
import type { ShowcaseCategory, ShowcaseEntry } from "@/lib/mock-entities";
import { canDeleteCategory, canEditCategory, type EntryForm } from "@/lib/showcase";
import {
  loadShowcaseHistory,
  saveCategory,
  saveCategoryDeletion,
  saveCategoryMove,
  saveCategoryVisible,
  saveEntry,
  saveEntryDeletion,
  saveEntryMove,
  saveEntryVisible,
  useShowcase,
} from "@/lib/services/showcase";
import { isMockMode } from "@/lib/services/mock-mode";
import { currentStaffMember } from "@/lib/services/listings";
import { useRoles } from "@/components/access/RoleProvider";
import { AmbassadorHistoryDialog } from "@/components/network/AmbassadorHistoryDialog";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { ShowcaseCategoryDialog } from "./ShowcaseCategoryDialog";
import { ShowcaseEntryDialog } from "./ShowcaseEntryDialog";
import { ShowcasePreviewDialog } from "./ShowcasePreviewDialog";

/** `categories` is what the person could use WHEN the form opened; every save is still checked against their role at the moment of saving. */
type EntryDialog = { mode: "add"; categories: ShowcaseCategory[] } | { mode: "edit"; entry: ShowcaseEntry; categories: ShowcaseCategory[] };
type CategoryDialog = { mode: "add" } | { mode: "edit"; category: ShowcaseCategory };

export function useShowcaseManager() {
  const { can, roles } = useRoles();
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { categories, entries } = useShowcase();
  const [entryDialog, setEntryDialog] = useState<EntryDialog | null>(null);
  const [categoryDialog, setCategoryDialog] = useState<CategoryDialog | null>(null);
  const [preview, setPreview] = useState(false);
  const [history, setHistory] = useState(false);

  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);
  const editableCategories = sortedCategories.filter((category) => canEditCategory(can, category));
  const canAddEntries = editableCategories.length > 0;
  const canManageCategories = can("showcase.manage", "edit");

  // Who: the signed-in person's name and the role(s) they are using (the audit entry's "who").
  const actor = `${getAdminUser()?.name ?? currentStaffMember()?.name ?? "Unknown user"} (${roles.map((role) => ROLES[role].label).join(" + ")})`;

  const canEdit = (category: Pick<ShowcaseCategory, "key"> | undefined) => !!category && canEditCategory(can, category);
  const categoryOf = (id: string) => categories.find((category) => category.id === id);

  /** The second layer: false (with a message) when the role may not change this category. */
  const permittedFor = (categoryId: string | undefined): boolean => {
    if (categoryId && canEdit(categoryOf(categoryId))) return true;
    toast.error("Your role cannot change this part of the showcase.");
    return false;
  };
  const permittedToManage = (): boolean => {
    if (can("showcase.manage", "edit")) return true;
    toast.error("Your role cannot create or change categories.");
    return false;
  };

  // ---- entries ----
  const openAdd = () => {
    if (canAddEntries) setEntryDialog({ mode: "add", categories: editableCategories });
    else toast.error("Your role cannot add to the showcase.");
  };
  const openEdit = (entry: ShowcaseEntry) => {
    if (permittedFor(entry.categoryId)) setEntryDialog({ mode: "edit", entry, categories: editableCategories });
  };

  const submitEntry = async (form: EntryForm, links: { ambassadorId?: string; partnerId?: string }) => {
    const editing = entryDialog?.mode === "edit" ? entryDialog.entry : undefined;
    // Both the category it is in and the category it is going to must be allowed.
    if (editing && !permittedFor(editing.categoryId)) return { ok: false as const, reason: "Your role cannot change this part of the showcase." };
    if (!permittedFor(form.categoryId)) return { ok: false as const, reason: "Your role cannot change this part of the showcase." };
    const result = await saveEntry(form, links, actor, editing?.id);
    if (!result.ok) return result;
    setEntryDialog(null);
    toast.success(editing ? `${result.entry.name} was updated.` : `${result.entry.name} was added${result.entry.visible ? " and is on the app." : " (hidden)."}`);
    return { ok: true as const };
  };

  const toggleVisible = (entry: ShowcaseEntry) => {
    if (!permittedFor(entry.categoryId)) return;
    void saveEntryVisible(entry, !entry.visible, actor).then((result) => {
      if (result.ok) toast.success(entry.visible ? `${entry.name} is hidden from the app.` : `${entry.name} is on the app.`);
      else toast.error(result.reason);
    });
  };

  const moveEntryUpDown = (entry: ShowcaseEntry, direction: "up" | "down") => {
    if (!permittedFor(entry.categoryId)) return;
    void saveEntryMove(entry, direction, actor).then((result) => {
      if (!result.ok) toast.error(result.reason);
    });
  };

  const removeEntry = (entry: ShowcaseEntry) =>
    confirm({
      title: "Delete this entry?",
      description: (
        <>
          <strong className="text-ink">{entry.name}</strong> will be removed from the showcase and from the app. To keep the entry and only take it off the app, hide it instead.
        </>
      ),
      confirmLabel: "Delete entry",
      onConfirm: () => {
        if (!permittedFor(entry.categoryId)) return;
        void saveEntryDeletion(entry, actor).then((result) => {
          if (result.ok) toast.success(`${entry.name} was deleted.`);
          else toast.error(result.reason);
        });
      },
    });

  // ---- categories ----
  const openAddCategory = () => {
    if (permittedToManage()) setCategoryDialog({ mode: "add" });
  };
  const openEditCategory = (category: ShowcaseCategory) => {
    if (permittedToManage()) setCategoryDialog({ mode: "edit", category });
  };

  const submitCategory = async (name: string, kind: ShowcaseCategory["kind"]) => {
    if (!permittedToManage()) return { ok: false as const, reason: "Your role cannot create or change categories." };
    const editing = categoryDialog?.mode === "edit" ? categoryDialog.category : undefined;
    const result = await saveCategory(name, kind, actor, editing?.id);
    if (!result.ok) return result;
    setCategoryDialog(null);
    toast.success(editing ? "The category was updated." : `${name.trim()} was added as a category.`);
    return { ok: true as const };
  };

  const toggleCategoryVisible = (category: ShowcaseCategory) => {
    if (!permittedToManage()) return;
    void saveCategoryVisible(category, !category.visible, actor).then((result) => {
      if (result.ok) toast.success(category.visible ? `${category.name} is hidden from the app.` : `${category.name} is on the app.`);
      else toast.error(result.reason);
    });
  };

  const moveCategoryUpDown = (category: ShowcaseCategory, direction: "up" | "down") => {
    if (!permittedToManage()) return;
    void saveCategoryMove(category, direction, actor).then((result) => {
      if (!result.ok) toast.error(result.reason);
    });
  };

  const removeCategory = (category: ShowcaseCategory) =>
    confirm({
      title: "Delete this category?",
      description: (
        <>
          <strong className="text-ink">{category.name}</strong> will be removed from the app&apos;s Meet our people page.
        </>
      ),
      confirmLabel: "Delete category",
      onConfirm: () => {
        if (!permittedToManage()) return;
        void saveCategoryDeletion(category, actor).then((result) => {
          if (result.ok) toast.success(`${category.name} was deleted.`);
          else toast.error(result.reason);
        });
      },
    });

  const categoryDeleteVerdict = (category: ShowcaseCategory) => canDeleteCategory(category, entries);

  const dialogs: ReactNode = (
    <>
      {entryDialog && (
        <ShowcaseEntryDialog
          categories={entryDialog.categories}
          entry={entryDialog.mode === "edit" ? entryDialog.entry : undefined}
          onClose={() => setEntryDialog(null)}
          onSubmit={submitEntry}
        />
      )}
      {categoryDialog && (
        <ShowcaseCategoryDialog
          category={categoryDialog.mode === "edit" ? categoryDialog.category : undefined}
          existing={categories}
          onClose={() => setCategoryDialog(null)}
          onSubmit={submitCategory}
        />
      )}
      {preview && <ShowcasePreviewDialog categories={categories} entries={entries} onClose={() => setPreview(false)} />}
      {history && (
        <AmbassadorHistoryDialog
          onClose={() => setHistory(false)}
          prefix="showcase."
          title="Showcase history"
          description="Every entry added, edited, shown, hidden, moved or deleted, and every category change, is recorded here."
          emptyText="Showcase changes appear here with who made them, what changed, and when."
          load={isMockMode() ? undefined : loadShowcaseHistory}
        />
      )}
      {confirmDialog}
    </>
  );

  return {
    categories: sortedCategories,
    entries,
    editableCategories,
    canAddEntries,
    canManageCategories,
    canEdit,
    openAdd,
    openEdit,
    openAddCategory,
    openEditCategory,
    openPreview: () => setPreview(true),
    openHistory: () => setHistory(true),
    toggleVisible,
    moveEntryUpDown,
    removeEntry,
    toggleCategoryVisible,
    moveCategoryUpDown,
    removeCategory,
    categoryDeleteVerdict,
    dialogs,
  };
}
