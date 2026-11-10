"use client";

/**
 * Notifications: this one page replaces the Composer and History pages (their old URLs redirect here:
 * see src/config/redirects.ts).
 *
 * - 1024px and up: the composer and its live preview side by side, history in its own full-width section below
 *   (GOD-T45: the preview belongs next to what it previews; history is a separate concern).
 * - Below 1024px: tabs Compose | History (kept in the URL as /notifications and /notifications?tab=history).
 *   Both panels are always rendered; CSS hides the inactive one below 1024px, so a half-written message
 *   survives a switch of tab and nothing depends on a JS breakpoint.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { NotificationComposer } from "@/components/notifications/NotificationComposer";
import { NotificationHistory } from "@/components/notifications/NotificationHistory";
import { Tabs, tabId, tabPanelId } from "@/components/ui/Tabs";
import { cn } from "@/lib/cn";

type NotificationsTab = "compose" | "history";
const ID_PREFIX = "notifications";

export default function NotificationsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const tab: NotificationsTab = useSearchParams().get("tab") === "history" ? "history" : "compose";

  const select = (next: NotificationsTab) => router.replace(next === "compose" ? pathname : `${pathname}?tab=${next}`, { scroll: false });

  return (
    <div className="space-y-4">
      <header>
        <h1 data-testid="page-title" className="page-title">Notifications</h1>
        <p className="page-subtitle mt-1">Send a broadcast message into the recipients&apos; in-app notification feed.</p>
      </header>

      {/* Below 1024px only: the two panels become tabs. */}
      <Tabs
        className="lg:hidden"
        ariaLabel="Notifications sections"
        idPrefix={ID_PREFIX}
        value={tab}
        onChange={select}
        tabs={[
          { value: "compose", label: "Compose" },
          { value: "history", label: "History" },
        ]}
      />

      <div className="space-y-4">
        <div
          role="tabpanel"
          id={tabPanelId(ID_PREFIX, "compose")}
          aria-labelledby={tabId(ID_PREFIX, "compose")}
          className={cn(tab !== "compose" && "max-lg:hidden")}
        >
          <NotificationComposer />
        </div>
        <div
          role="tabpanel"
          id={tabPanelId(ID_PREFIX, "history")}
          aria-labelledby={tabId(ID_PREFIX, "history")}
          className={cn(tab !== "history" && "max-lg:hidden")}
        >
          <NotificationHistory />
        </div>
      </div>
    </div>
  );
}
