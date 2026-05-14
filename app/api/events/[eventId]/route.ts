import { NextResponse } from "next/server";
import { google, type calendar_v3 } from "googleapis";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

function googleClient(accessToken: string) {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  return google.calendar({ version: "v3", auth: oauth2 });
}

type UpdateEventBody = {
  calendarId: string;
  title?: string;
  description?: string;
  location?: string;
  isAllDay?: boolean;
  startISO?: string;
  endISO?: string;
  timeZone?: string;
};

function buildPatchResource(body: UpdateEventBody): calendar_v3.Schema$Event {
  const patch: calendar_v3.Schema$Event = {};
  if (body.title !== undefined) patch.summary = body.title;
  if (body.description !== undefined)
    patch.description = body.description || undefined;
  if (body.location !== undefined) patch.location = body.location || undefined;

  const hasTimeChange =
    body.isAllDay !== undefined ||
    body.startISO !== undefined ||
    body.endISO !== undefined;

  if (hasTimeChange) {
    if (body.isAllDay) {
      patch.start = { date: body.startISO };
      patch.end = { date: body.endISO };
    } else {
      patch.start = { dateTime: body.startISO, timeZone: body.timeZone };
      patch.end = { dateTime: body.endISO, timeZone: body.timeZone };
    }
  }

  return patch;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const session = await auth();
  if (!session || session.error || !session.accessToken) {
    return NextResponse.json(
      { error: session?.error ?? "Not authenticated" },
      { status: 401 },
    );
  }

  const { eventId } = await context.params;
  let body: UpdateEventBody;
  try {
    body = (await request.json()) as UpdateEventBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.calendarId) {
    return NextResponse.json(
      { error: "Missing calendarId" },
      { status: 400 },
    );
  }

  const calendar = googleClient(session.accessToken);
  try {
    const res = await calendar.events.patch({
      calendarId: body.calendarId,
      eventId,
      requestBody: buildPatchResource(body),
    });
    return NextResponse.json({ id: res.data.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const session = await auth();
  if (!session || session.error || !session.accessToken) {
    return NextResponse.json(
      { error: session?.error ?? "Not authenticated" },
      { status: 401 },
    );
  }

  const { eventId } = await context.params;
  const url = new URL(request.url);
  const calendarId = url.searchParams.get("calendarId");
  if (!calendarId) {
    return NextResponse.json(
      { error: "Missing calendarId query param" },
      { status: 400 },
    );
  }

  const calendar = googleClient(session.accessToken);
  try {
    await calendar.events.delete({ calendarId, eventId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
