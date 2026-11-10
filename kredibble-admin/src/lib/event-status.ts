/**
 * An event's status from its date (GOD-T7).
 *
 * The admin review saw events dated 2 and 20 August 2026 still labelled "Upcoming" in November: the status was a stored word
 * that nothing ever changed. Now the label is worked out when it is shown:
 * - "cancelled" stays cancelled (a decision, not a date);
 * - otherwise the event is "upcoming" until the END of its day in its own time zone, then "past". An event has a start time
 *   only, so an event running this evening is still upcoming this afternoon and still listed as on today until midnight.
 * - a date that cannot be read keeps the stored status (never a guess).
 *
 * Accepted dates: the desk's format "2 Aug 2026, 6:00 PM GMT" (GMT, UTC or an offset such as "GMT+1" / "+01:00"; no zone =
 * GMT, the desk's time zone) and ISO strings from the API ("2026-11-01T10:00", with or without a zone; no zone = UTC).
 */
import type { EventStatus } from "@/lib/mock-events";

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** The zone offset in minutes from "GMT", "UTC", "GMT+1", "UTC-05:30", "+01:00" or "" (GMT). Null when it is not one of those. */
function zoneOffsetMinutes(zone: string): number | null {
  const text = zone.trim().toUpperCase();
  if (text === "" || text === "GMT" || text === "UTC" || text === "Z") return 0;
  const match = /^(?:GMT|UTC)?\s*([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(text);
  if (!match) return null;
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return match[1] === "-" ? -minutes : minutes;
}

/**
 * When the event's day ends, as a UTC timestamp (milliseconds), or null when the date cannot be read.
 * @param dateTime the event's date and time as stored ("2 Aug 2026, 6:00 PM GMT" or an ISO string)
 */
export function eventDayEndsAt(dateTime: string): number | null {
  const text = dateTime.trim();
  // ISO from the API: the calendar day as written, in its zone (none = UTC)
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i.exec(text);
  if (iso) {
    const offset = zoneOffsetMinutes(iso[6] ?? "");
    if (offset === null) return null;
    return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]) + 1) - offset * 60_000;
  }
  // The desk's format: "2 Aug 2026, 6:00 PM GMT" (the time and the zone are optional)
  const desk = /^(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\s+(\d{4})(?:,?\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?\s*(.*)$/i.exec(text);
  if (desk) {
    const month = MONTHS[desk[2].toLowerCase()];
    const offset = zoneOffsetMinutes(desk[4]);
    if (month === undefined || offset === null) return null;
    return Date.UTC(Number(desk[3]), month, Number(desk[1]) + 1) - offset * 60_000;
  }
  return null;
}

/**
 * The status to show for an event: "cancelled" as stored; otherwise "past" once its day is over, else "upcoming".
 * @param event the stored status and date
 * @param now the moment to judge at (defaults to now)
 */
export function eventStatus(event: { status: EventStatus; dateTime: string }, now: Date = new Date()): EventStatus {
  if (event.status === "cancelled") return "cancelled";
  const endsAt = eventDayEndsAt(event.dateTime);
  if (endsAt === null) return event.status;
  return now.getTime() >= endsAt ? "past" : "upcoming";
}
