import { NextResponse } from "next/server";
import { google, type calendar_v3 } from "googleapis";
import { auth } from "@/auth";
import {
  filterEvent,
  isHolidayCalendar,
  normalizeEvent,
  pickCurrentAndNext,
  type CalendarEventPayload,
  type WritableCalendar,
} from "@/lib/event-utils";

export const dynamic = "force-dynamic";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LINGER_MIN = 120;

function googleClient(accessToken: string) {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  return google.calendar({ version: "v3", auth: oauth2 });
}

function isWritable(accessRole?: string | null): boolean {
  return accessRole === "owner" || accessRole === "writer";
}

export async function GET(request: Request) {
  const session = await auth();

  if (!session || session.error || !session.accessToken) {
    return NextResponse.json(
      { error: session?.error ?? "Not authenticated" },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const rawLinger = Number(url.searchParams.get("lingerMinutes") ?? "0");
  const lingerMinutes = Number.isFinite(rawLinger)
    ? Math.min(MAX_LINGER_MIN, Math.max(0, Math.round(rawLinger)))
    : 0;
  const lingerMs = lingerMinutes * 60_000;

  const calendar = googleClient(session.accessToken);

  try {
    const calendarList = await calendar.calendarList.list({ maxResults: 250 });
    const calendars = (calendarList.data.items ?? []).filter((c) => {
      if (!c.id) return false;
      if (c.selected === false) return false;
      if (c.accessRole === "freeBusyReader") return false;
      return true;
    });

    const writableCalendars: WritableCalendar[] = (
      calendarList.data.items ?? []
    )
      .filter((c) => c.id && isWritable(c.accessRole))
      .map((c) => ({
        id: c.id!,
        name: c.summary ?? c.id!,
        isPrimary: c.primary === true,
        timeZone: c.timeZone ?? undefined,
      }))
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));

    const now = Date.now();
    // Pull a bit into the past so the linger window has events to show.
    const timeMin = new Date(now - lingerMs).toISOString();
    const timeMax = new Date(now + SEVEN_DAYS_MS).toISOString();

    const results = await Promise.all(
      calendars.map(async (cal) => {
        try {
          const res = await calendar.events.list({
            calendarId: cal.id!,
            timeMin,
            timeMax,
            singleEvents: true,
            orderBy: "startTime",
            maxResults: 30,
          });
          const canEdit = isWritable(cal.accessRole);
          const isHoliday = isHolidayCalendar({
            id: cal.id,
            summary: cal.summary,
          });
          const events: CalendarEventPayload[] = [];
          for (const ev of res.data.items ?? []) {
            if (!filterEvent(ev)) continue;
            const normalized = normalizeEvent(
              ev,
              cal.id!,
              cal.timeZone ?? undefined,
              cal.summary ?? undefined,
              canEdit,
              isHoliday,
            );
            // Keep events that haven't ended OR that ended within the linger
            // window — pickCurrentAndNext does the final split.
            if (normalized && normalized.endMs > now - lingerMs)
              events.push(normalized);
          }
          return events;
        } catch {
          return [];
        }
      }),
    );

    const merged = results.flat();
    const { current, next, past, upcoming } = pickCurrentAndNext(
      merged,
      now,
      lingerMs,
    );

    return NextResponse.json(
      { current, next, past, upcoming, writableCalendars, nowMs: now },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// --------- Create event ---------

type CreateEventBody = {
  calendarId: string;
  title: string;
  description?: string;
  location?: string;
  isAllDay: boolean;
  startISO: string; // for timed events: full ISO with TZ; for all-day: YYYY-MM-DD
  endISO: string;
  timeZone?: string;
};

function buildEventResource(body: CreateEventBody): calendar_v3.Schema$Event {
  const event: calendar_v3.Schema$Event = {
    summary: body.title,
    description: body.description || undefined,
    location: body.location || undefined,
  };
  if (body.isAllDay) {
    event.start = { date: body.startISO };
    event.end = { date: body.endISO };
  } else {
    event.start = { dateTime: body.startISO, timeZone: body.timeZone };
    event.end = { dateTime: body.endISO, timeZone: body.timeZone };
  }
  return event;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.error || !session.accessToken) {
    return NextResponse.json(
      { error: session?.error ?? "Not authenticated" },
      { status: 401 },
    );
  }

  let body: CreateEventBody;
  try {
    body = (await request.json()) as CreateEventBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.calendarId || !body.title || !body.startISO || !body.endISO) {
    return NextResponse.json(
      { error: "Missing required fields: calendarId, title, startISO, endISO" },
      { status: 400 },
    );
  }

  const calendar = googleClient(session.accessToken);
  try {
    const res = await calendar.events.insert({
      calendarId: body.calendarId,
      requestBody: buildEventResource(body),
    });
    return NextResponse.json(
      { id: res.data.id, htmlLink: res.data.htmlLink },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
