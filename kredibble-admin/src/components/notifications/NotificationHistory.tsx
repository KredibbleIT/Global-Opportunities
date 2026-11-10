"use client";

/**
 * Notification history: every broadcast sent, newest first, with its audience and time.
 * Data: the notification store (src/lib/notification-store.ts): the server's broadcasts in live mode, the sample ones in mock
 * mode. A notification sent from the composer appears at the top straight away (the store's subscription).
 * States: a skeleton while the live history loads, an error with Try again, an empty state for no broadcasts.
 */
import { useSyncExternalStore } from "react";
import { BellOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { AUDIENCE_ICON, AUDIENCE_LABEL } from "@/components/notifications/audience";
import { formatDateTime } from "@/lib/format";
import { notificationBroadcastStore } from "@/lib/notification-store";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { TagPill } from "@/components/ui/TagPill";

// The store replaces its snapshot object on every change, so the object itself is a valid snapshot.
const subscribe = (notify: () => void) => notificationBroadcastStore.subscribe(notify);
const getSnapshot = () => notificationBroadcastStore.snapshot;

export function NotificationHistory() {
  const { history, status } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  if (status === "loading") {
    return (
      <Card as="section" ariaLabel="History">
        <CardHeader title="History" />
        <div data-testid="history-loading" aria-busy="true" className="space-y-3">
          <Skeleton className="h-20 w-full rounded-control" />
          <Skeleton className="h-20 w-full rounded-control" />
        </div>
      </Card>
    );
  }
  if (status === "error") {
    return (
      <Card as="section" ariaLabel="History">
        <CardHeader title="History" />
        <EmptyState
          icon={BellOff}
          tone="danger"
          title="Could not load the history"
          description="Please try again."
          action={<Button variant="secondary" onClick={() => void notificationBroadcastStore.load()}>Try again</Button>}
        />
      </Card>
    );
  }

  return (
    <Card as="section" ariaLabel="History">
      <CardHeader
        title="History"
        subtitle={`${history.length} ${history.length === 1 ? "broadcast" : "broadcasts"} sent.`}
      />
      {history.length === 0 ? (
        <EmptyState icon={BellOff} title="No broadcasts sent yet" description="Notifications you send appear here." />
      ) : (
        <ul className="space-y-3">
          {history.map((item) => {
            const Icon = AUDIENCE_ICON[item.audience];
            return (
              <li key={item.id} className="rounded-control border border-line p-4">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <p className="body-sm min-w-0 break-words font-semibold text-ink">{item.title}</p>
                  <TagPill icon={Icon}>{AUDIENCE_LABEL[item.audience]}</TagPill>
                </div>
                <p className="body-sm mb-2 break-words text-muted">{item.message}</p>
                <p className="caption">{formatDateTime(item.sentAt)}</p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
