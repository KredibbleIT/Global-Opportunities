/**
 * Data for Events (/events) and one event (/events/[id]) (SEC-157).
 *
 * The same switch as the other admin data (see mock-mode.ts):
 * - Mock mode: the sample events (mock-events.ts) with this session's changes laid over them (mock-store.ts).
 * - Real mode: the admin data API (GET /admin/events, GET/PATCH /admin/events/:id, via lib/api.ts), mapped to the shape the pages use.
 *
 * Before SEC-157 both pages read the samples in every mode and "Save capacity" and "Cancel event" only changed the page's memory.
 * Errors reject with the server's message (the pages show them; there is no fallback to the samples, as SEC-148); a missing event
 * resolves with undefined ("not found").
 */
import { getEventById, getEvents, updateEvent, type EventRecord as ApiEventRecord } from "@/lib/api";
import { eventRecords, type EventRecord, type EventStatus } from "@/lib/mock-events";
import { overlayRows } from "@/lib/mock-store";
import { MISSING, fetchAll, isRecordId, orMissing } from "./api-helpers";
import { isMockMode } from "./mock-mode";

const STATUSES: EventStatus[] = ["upcoming", "past", "cancelled"];

/** Maps one API event to the page's shape. A status the admin does not know reads as "upcoming"; the date then decides (eventStatus). */
export function toEvent(record: ApiEventRecord): EventRecord {
  return {
    id: record.id,
    title: record.title,
    hirer: record.hirer || MISSING,
    location: record.location || MISSING,
    dateTime: record.dateTime,
    capacity: Number(record.capacity) || 0,
    attendeesCount: Number(record.attendeesCount) || 0,
    status: STATUSES.find((status) => status === record.status) ?? "upcoming",
  };
}

/** Every event: the samples in mock mode, the database's in real mode. */
export async function loadEventRows(): Promise<EventRecord[]> {
  if (isMockMode()) return overlayRows("events", eventRecords);
  return (await fetchAll((page, limit) => getEvents({ page, limit }))).map(toEvent);
}

/** One event, or undefined when there is no such event. */
export async function loadEvent(id: string): Promise<EventRecord | undefined> {
  if (isMockMode()) return eventRecords.find((event) => event.id === id);
  if (!isRecordId(id)) return undefined;
  return getEventById(id).then(toEvent, orMissing<EventRecord>);
}

/** Saves a new capacity and resolves with the saved one. Mock mode has nothing to send (the page's local change is the effect). */
export async function saveEventCapacity(id: string, capacity: number): Promise<number> {
  if (isMockMode()) return capacity;
  return toEvent(await updateEvent(id, { capacity })).capacity;
}

/** Marks an event Cancelled and resolves with the saved status. */
export async function cancelEvent(id: string): Promise<EventStatus> {
  if (isMockMode()) return "cancelled";
  return toEvent(await updateEvent(id, { status: "cancelled" })).status;
}
