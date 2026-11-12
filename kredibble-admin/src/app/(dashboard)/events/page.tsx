"use client";

/**
 * Events: capacity and attendance across all hirer-posted events.
 * Built on the shared list template; this file holds the column config and the data.
 * Data: lib/services/events.ts (SEC-157): the samples in mock mode, GET /admin/events in real mode.
 */
import { CalendarDays } from "lucide-react";
import { eventStatus } from "@/lib/event-status";
import type { EventRecord } from "@/lib/mock-events";
import { subscribeMockStore } from "@/lib/mock-store";
import { loadEventRows } from "@/lib/services/events";
import { useListData } from "@/lib/use-list-data";
import { DataTable } from "@/components/list/DataTable";
import { ListPage } from "@/components/list/ListPage";
import type { Column } from "@/components/list/types";


const COLUMNS: Column<EventRecord>[] = [
  { key: "event", header: "Event", type: "primary", width: "28%", title: (r) => r.title, titleLines: 2, leading: () => ({ icon: CalendarDays }) },
  { key: "hirer", header: "Hirer", type: "text", width: "17%", value: (r) => r.hirer },
  { key: "date", header: "Date", type: "text", width: "13%", value: (r) => r.dateTime.split(",")[0] },
  {
    key: "attendance",
    header: "Attendance",
    type: "progress",
    width: "24%",
    label: (r) => `${r.attendeesCount}/${r.capacity}`,
    percent: (r) => (r.capacity > 0 ? Math.round((r.attendeesCount / r.capacity) * 100) : 0),
  },
  // GOD-T7: worked out from the date (an event whose day is over is Past), never the stored word alone
  { key: "status", header: "Status", type: "status", width: "18%", status: (r) => eventStatus(r) },
];

export default function EventsPage() {
  const { rows, isLoading, error, retry } = useListData(loadEventRows, { subscribe: subscribeMockStore });

  return (
    <ListPage title="Events" subtitle="Capacity and attendance across all hirer-posted events.">
      <DataTable
        label="Events"
        columns={COLUMNS}
        rows={rows ?? []}
        getRowKey={(r) => r.id}
        getRowHref={(r) => `/events/${r.id}`}
        loading={isLoading}
        error={error}
        onRetry={retry}
        emptyNoData={{ icon: CalendarDays, title: "No events yet", description: "Events posted by hirers appear here." }}
        emptyNoResults={{ icon: CalendarDays, title: "No events match" }}
      />
    </ListPage>
  );
}
