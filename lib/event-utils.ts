import { calendar_v3 } from "googleapis";

export type CalendarEventPayload = {
  id: string;
  calendarId: string;
  calendarName?: string;
  title: string;
  startMs: number;
  endMs: number;
  isAllDay: boolean;
  location?: string;
  description?: string;
  hangoutLink?: string;
  htmlLink?: string;
  timeZone?: string;
  canEdit?: boolean;
  isHoliday?: boolean;
};

export type WritableCalendar = {
  id: string;
  name: string;
  isPrimary: boolean;
  timeZone?: string;
};

export type EventsResponse = {
  current: CalendarEventPayload | null;
  next: CalendarEventPayload | null;
  past: CalendarEventPayload[];
  upcoming: CalendarEventPayload[];
};

function parseEventTime(
  time: calendar_v3.Schema$EventDateTime | undefined,
  fallbackTz: string | undefined,
  endOfDay: boolean,
): number {
  if (!time) return Number.NaN;
  if (time.dateTime) return new Date(time.dateTime).getTime();

  if (time.date) {
    const tz = time.timeZone ?? fallbackTz ?? "UTC";
    const [y, m, d] = time.date.split("-").map(Number);
    const dayMs = 24 * 60 * 60 * 1000;
    const baseUtc = Date.UTC(y, (m ?? 1) - 1, d ?? 1);
    const offsetMin = tzOffsetMinutes(tz, baseUtc);
    return baseUtc - offsetMin * 60_000 + (endOfDay ? dayMs : 0);
  }
  return Number.NaN;
}

function tzOffsetMinutes(tz: string, utcMs: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") === 24 ? 0 : get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - utcMs) / 60_000);
}

function isDeclinedBySelf(ev: calendar_v3.Schema$Event): boolean {
  const attendees = ev.attendees ?? [];
  const me = attendees.find((a) => a.self === true);
  return me?.responseStatus === "declined";
}

export function isHolidayCalendar(cal: {
  id?: string | null;
  summary?: string | null;
}): boolean {
  const id = (cal.id ?? "").toLowerCase();
  const summary = (cal.summary ?? "").toLowerCase();
  // Google's public holiday calendars look like
  // "en.dominican#holiday@group.v.calendar.google.com".
  if (id.includes("#holiday@")) return true;
  if (id.endsWith("holiday@group.v.calendar.google.com")) return true;
  if (summary.includes("holiday")) return true;
  if (summary.includes("festivo")) return true;
  if (summary.includes("feriado")) return true;
  return false;
}

export function normalizeEvent(
  ev: calendar_v3.Schema$Event,
  calendarId: string,
  calendarTz: string | undefined,
  calendarName: string | undefined,
  canEdit: boolean,
  isHoliday: boolean = false,
): CalendarEventPayload | null {
  if (!ev.id) return null;
  const isAllDay = Boolean(ev.start?.date);
  const startMs = parseEventTime(ev.start, calendarTz, false);
  const endMs = parseEventTime(ev.end, calendarTz, isAllDay);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;

  return {
    id: ev.id,
    calendarId,
    calendarName,
    title: ev.summary ?? "(no title)",
    startMs,
    endMs,
    isAllDay,
    location: ev.location ?? undefined,
    description: ev.description ?? undefined,
    hangoutLink: ev.hangoutLink ?? undefined,
    htmlLink: ev.htmlLink ?? undefined,
    timeZone: ev.start?.timeZone ?? calendarTz ?? undefined,
    canEdit,
    isHoliday,
  };
}

export function filterEvent(ev: calendar_v3.Schema$Event): boolean {
  if (ev.status === "cancelled") return false;
  if (isDeclinedBySelf(ev)) return false;
  return true;
}

/**
 * Split events into current, next, past (within linger window) and upcoming.
 *
 * @param lingerMs  How long an event remains visible past its end. 0 disables
 *                  the past bucket entirely.
 */
export function pickCurrentAndNext(
  events: CalendarEventPayload[],
  nowMs: number,
  lingerMs: number = 0,
): EventsResponse {
  const sorted = [...events].sort((a, b) => a.startMs - b.startMs);
  const current =
    sorted.find((e) => e.startMs <= nowMs && nowMs < e.endMs) ?? null;
  const future = sorted.filter((e) => e.startMs > nowMs);
  const next = future[0] ?? null;
  const upcoming = future.slice(0, 12);

  // Past events whose end time is still within the linger window. We exclude
  // the `current` event (it's still ongoing) and holidays (they'd flood the
  // strip on a Tuesday).
  const past =
    lingerMs > 0
      ? sorted
          .filter(
            (e) =>
              e.endMs <= nowMs &&
              nowMs - e.endMs <= lingerMs &&
              !e.isHoliday,
          )
          .sort((a, b) => b.endMs - a.endMs)
      : [];

  return { current, next, past, upcoming };
}
