import { NextResponse } from "next/server";
import { google } from "googleapis";
import { auth } from "@/auth";
import {
  filterEvent,
  isHolidayCalendar,
  normalizeEvent,
  type CalendarEventPayload,
} from "@/lib/event-utils";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const session = await auth();
  if (!session || session.error || !session.accessToken) {
    return NextResponse.json(
      { error: session?.error ?? "Not authenticated" },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const dateStr = url.searchParams.get("date"); // YYYY-MM-DD
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json(
      { error: "Missing or invalid `date` query (expected YYYY-MM-DD)" },
      { status: 400 },
    );
  }

  const [y, m, d] = dateStr.split("-").map(Number);
  // We query a slightly-wider UTC window to make sure we catch events that
  // span across midnight in any reasonable TZ.
  const dayStartUtc = Date.UTC(y, m - 1, d) - 14 * 60 * 60 * 1000;
  const dayEndUtc = dayStartUtc + DAY_MS + 28 * 60 * 60 * 1000;

  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: session.accessToken });
  const calendar = google.calendar({ version: "v3", auth: oauth2 });

  try {
    const calendarList = await calendar.calendarList.list({ maxResults: 250 });
    const calendars = (calendarList.data.items ?? []).filter((c) => {
      if (!c.id) return false;
      if (c.selected === false) return false;
      if (c.accessRole === "freeBusyReader") return false;
      return true;
    });

    const results = await Promise.all(
      calendars.map(async (cal) => {
        try {
          const res = await calendar.events.list({
            calendarId: cal.id!,
            timeMin: new Date(dayStartUtc).toISOString(),
            timeMax: new Date(dayEndUtc).toISOString(),
            singleEvents: true,
            orderBy: "startTime",
            maxResults: 50,
          });
          const canEdit =
            cal.accessRole === "owner" || cal.accessRole === "writer";
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
            if (normalized) events.push(normalized);
          }
          return events;
        } catch {
          return [];
        }
      }),
    );

    // Now filter to events that actually intersect the requested local day.
    // We compute the day's UTC bounds using the user's browser timezone? No —
    // the user hits this from the mini calendar which is rendered in DR TZ.
    // To keep this consistent, treat the date in DR TZ.
    const drStart = parseLocalDate(dateStr, "America/Santo_Domingo");
    const drEnd = drStart + DAY_MS;

    const merged = results
      .flat()
      .filter((e) => e.startMs < drEnd && e.endMs > drStart)
      .sort((a, b) => a.startMs - b.startMs);

    return NextResponse.json(
      { date: dateStr, events: merged },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseLocalDate(dateStr: string, tz: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const naiveUtc = Date.UTC(y, m - 1, d);
  // Adjust by the TZ offset at that instant so the returned ms aligns with
  // midnight in `tz`.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(naiveUtc));
  const get = (t: string) =>
    Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") === 24 ? 0 : get("hour"),
    get("minute"),
    get("second"),
  );
  const offsetMin = Math.round((asUtc - naiveUtc) / 60_000);
  return naiveUtc - offsetMin * 60_000;
}
