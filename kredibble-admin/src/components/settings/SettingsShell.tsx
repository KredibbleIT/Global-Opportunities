"use client";

/**
 * SettingsShell: the frame of /settings, shared by its four pages.
 *
 *   Settings
 *   Your own settings and, for admins, the desk's.
 *   [ My account ] [ Targets ] [ Pipeline stages ] [ Integrations ]     <- the Tabs component; only for a Desk Lead or a Super Admin
 *   (the page of the tab)
 *
 * - Every role has "My account" (/settings). The other three tabs (/settings/targets, /settings/pipeline-stages, /settings/integrations)
 *   need EDIT access on "settings_admin" (Desk Lead and Super Admin): for any other role the tabs are NOT RENDERED at all (there is no tab strip,
 *   only the account page), and the pages themselves show the no-access state if someone opens the address directly.
 * - Each tab is its own address, so a tab can be opened (and shared) directly and the browser's Back button works.
 * - A tab with unsaved changes tells the shell (useSettingsDirty); switching away then asks first ("Discard unsaved changes?").
 * Real mode (GOD-T47): the shell reads the settings from the server first (hydrateSettings) and shows the tab only then: a skeleton while
 * loading, an error with Try again when the server cannot be reached. Every tab then saves to the server (lib/services/settings.ts).
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Settings as SettingsIcon } from "lucide-react";
import { useRoles } from "@/components/access/RoleProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { hydrateSettings } from "@/lib/services/settings";
import { isMockMode } from "@/lib/services/mock-mode";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Tabs, tabId, tabPanelId } from "@/components/ui/Tabs";

const TABS = [
  { value: "account", label: "My account", href: "/settings" },
  { value: "targets", label: "Targets", href: "/settings/targets" },
  { value: "pipeline-stages", label: "Pipeline stages", href: "/settings/pipeline-stages" },
  { value: "integrations", label: "Integrations", href: "/settings/integrations" },
] as const;
type TabValue = (typeof TABS)[number]["value"];

const ID_PREFIX = "settings";

const DirtyContext = createContext<(dirty: boolean) => void>(() => undefined);

/** A tab calls this with its dirty flag, so the shell can ask before the person switches away from unsaved changes. */
export function useSettingsDirty(dirty: boolean) {
  const setDirty = useContext(DirtyContext);
  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);
}

export function SettingsShell({ children }: { children: ReactNode }) {
  const { can } = useRoles();
  const router = useRouter();
  const pathname = usePathname();
  const { confirm, dialog } = useConfirmDialog();
  const [dirty, setDirty] = useState(false);
  const admin = can("settings_admin", "edit");
  const live = !isMockMode();
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(live ? "loading" : "ready");
  // State changes happen when the request settles, never synchronously in the effect.
  useEffect(() => {
    if (!live) return;
    hydrateSettings(admin).then(() => setLoadState("ready"), () => setLoadState("error"));
  }, [live, admin]);
  const retry = () => {
    setLoadState("loading");
    hydrateSettings(admin).then(() => setLoadState("ready"), () => setLoadState("error"));
  };

  const current: TabValue = TABS.find((tab) => tab.href !== "/settings" && pathname.startsWith(tab.href))?.value ?? "account";
  const tabs = TABS.filter((tab) => tab.value === "account" || admin).map(({ value, label }) => ({ value, label }));

  const go = (value: TabValue) => {
    const target = TABS.find((tab) => tab.value === value)!;
    if (value === current) return;
    if (!dirty) {
      router.push(target.href);
      return;
    }
    confirm({
      title: "Discard unsaved changes?",
      description: "You have changes on this tab that are not saved. If you switch tabs they will be lost.",
      confirmLabel: "Discard changes",
      onConfirm: () => {
        setDirty(false);
        router.push(target.href);
      },
    });
  };

  return (
    <DirtyContext.Provider value={setDirty}>
      <div className="flex flex-1 flex-col">
        <header className="mb-4 flex items-start gap-3">
          <span aria-hidden="true" className="inline-flex size-11 shrink-0 items-center justify-center rounded-inset bg-neutral-soft text-neutral">
            <SettingsIcon size={18} strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <h1 data-testid="page-title" className="page-title">
              Settings
            </h1>
            <p className="page-subtitle mt-1">Your own settings and, for admins, the desk&apos;s.</p>
          </div>
        </header>
        {admin && (
          <div className="mb-4">
            <Tabs tabs={tabs} value={current} onChange={go} ariaLabel="Settings sections" idPrefix={ID_PREFIX} />
          </div>
        )}
        <div role={admin ? "tabpanel" : undefined} id={admin ? tabPanelId(ID_PREFIX, current) : undefined} aria-labelledby={admin ? tabId(ID_PREFIX, current) : undefined} className="flex flex-1 flex-col">
          {loadState === "ready" ? (
            children
          ) : loadState === "loading" ? (
            <div data-testid="settings-loading" aria-busy="true" className="max-w-240 space-y-4">
              <Skeleton className="h-40 w-full rounded-control" />
              <Skeleton className="h-40 w-full rounded-control" />
            </div>
          ) : (
            <Card className="max-w-240">
              <EmptyState icon={SettingsIcon} tone="danger" title="Could not load the settings" description="Please try again." action={<Button variant="secondary" onClick={retry}>Try again</Button>} />
            </Card>
          )}
        </div>
      </div>
      {dialog}
    </DirtyContext.Provider>
  );
}
