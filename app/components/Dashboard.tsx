"use client";

import { useEffect, useMemo, useState } from "react";
import type { CalendarEventPayload } from "@/lib/event-utils";

const DR_TZ = "America/Santo_Domingo";

const drTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: DR_TZ,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const drDateFormatter = new Intl.DateTimeFormat("es-DO", {
  timeZone: DR_TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
});

export function DominicanClock({ nowMs }: { nowMs: number }) {
  const now = new Date(nowMs);
  const timeStr = drTimeFormatter.format(now);
  const dateStr = drDateFormatter.format(now);

  return (
    <div className="flex flex-col">
      <div className="uppercase tracking-[0.2em] text-[10px] text-[color:var(--muted)]">
        Santo Domingo
      </div>
      <div className="font-mono text-2xl sm:text-3xl tabular-nums leading-none mt-1">
        {timeStr}
      </div>
      <div className="text-xs text-[color:var(--muted)] mt-1 capitalize">
        {dateStr}
      </div>
    </div>
  );
}

// ---------- Mini calendar ----------

const WEEKDAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"];

function getDrParts(ms: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  return {
    year: Number(parts.find((p) => p.type === "year")?.value ?? 0),
    month: Number(parts.find((p) => p.type === "month")?.value ?? 1),
    day: Number(parts.find((p) => p.type === "day")?.value ?? 1),
  };
}

function eventDaysInMonth(
  events: CalendarEventPayload[],
  year: number,
  month: number,
): { events: Set<number>; holidays: Set<number> } {
  const evDays = new Set<number>();
  const holDays = new Set<number>();
  for (const ev of events) {
    const p = getDrParts(ev.startMs);
    if (p.year === year && p.month === month) {
      if (ev.isHoliday) holDays.add(p.day);
      else evDays.add(p.day);
    }
  }
  return { events: evDays, holidays: holDays };
}

function monthLabel(year: number, month: number): string {
  const probe = new Date(Date.UTC(year, month - 1, 1, 12));
  return new Intl.DateTimeFormat("es-DO", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(probe);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function firstDayOfWeekIdx(year: number, month: number): number {
  // Convert JS Sunday=0 to ISO Monday=0.
  const dow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return (dow + 6) % 7;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

export function MiniCalendar({
  nowMs,
  events,
  highlightHolidays,
  onDayClick,
}: {
  nowMs: number;
  events: CalendarEventPayload[];
  highlightHolidays: boolean;
  onDayClick?: (dateStr: string) => void;
}) {
  const today = getDrParts(nowMs);

  const [view, setView] = useState<{ year: number; month: number }>(() => ({
    year: today.year,
    month: today.month,
  }));

  // Snap back when day changes (e.g. midnight rollover).
  useEffect(() => {
    setView((prev) =>
      prev.year === today.year && prev.month === today.month
        ? prev
        : { year: today.year, month: today.month },
    );
    // We intentionally watch today.year/today.month, not the wider `today`.
  }, [today.year, today.month]);

  const grid = useMemo(() => {
    const firstDow = firstDayOfWeekIdx(view.year, view.month);
    const total = daysInMonth(view.year, view.month);
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= total; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [view.year, view.month]);

  const markers = useMemo(
    () => eventDaysInMonth(events, view.year, view.month),
    [events, view.year, view.month],
  );

  function shiftMonth(delta: number) {
    setView((prev) => {
      let m = prev.month + delta;
      let y = prev.year;
      while (m < 1) {
        m += 12;
        y -= 1;
      }
      while (m > 12) {
        m -= 12;
        y += 1;
      }
      return { year: y, month: m };
    });
  }

  function shiftYear(delta: number) {
    setView((prev) => ({ ...prev, year: prev.year + delta }));
  }

  function goToToday() {
    setView({ year: today.year, month: today.month });
  }

  const isCurrentMonth = view.year === today.year && view.month === today.month;

  return (
    <div className="flex flex-col items-end">
      <div className="flex items-center gap-1.5 mb-1.5">
        <button
          type="button"
          onClick={() => shiftYear(-1)}
          aria-label="Año anterior"
          className="px-1 text-[color:var(--muted)] hover:text-foreground transition text-xs leading-none"
          title="Año anterior"
        >
          «
        </button>
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="Mes anterior"
          className="px-1 text-[color:var(--muted)] hover:text-foreground transition text-xs leading-none"
          title="Mes anterior"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={goToToday}
          className={`uppercase tracking-[0.2em] text-[10px] capitalize px-2 py-0.5 rounded transition ${
            isCurrentMonth
              ? "text-[color:var(--muted)]"
              : "text-foreground hover:bg-white/10"
          }`}
          title="Volver al mes actual"
        >
          {monthLabel(view.year, view.month)}
        </button>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="Mes siguiente"
          className="px-1 text-[color:var(--muted)] hover:text-foreground transition text-xs leading-none"
          title="Mes siguiente"
        >
          ›
        </button>
        <button
          type="button"
          onClick={() => shiftYear(1)}
          aria-label="Año siguiente"
          className="px-1 text-[color:var(--muted)] hover:text-foreground transition text-xs leading-none"
          title="Año siguiente"
        >
          »
        </button>
      </div>
      <div className="grid grid-cols-7 gap-[3px] text-[10px]">
        {WEEKDAY_LABELS.map((w, i) => (
          <div
            key={`h${i}`}
            className="w-6 h-5 flex items-center justify-center text-[color:var(--muted)]"
          >
            {w}
          </div>
        ))}
        {grid.map((d, i) => {
          if (d === null) {
            return <div key={i} className="w-6 h-6" />;
          }
          const isToday =
            isCurrentMonth && d === today.day;
          const hasEvent = markers.events.has(d);
          const hasHoliday = highlightHolidays && markers.holidays.has(d);
          const dateStr = `${view.year}-${pad(view.month)}-${pad(d)}`;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onDayClick?.(dateStr)}
              className={`w-6 h-6 flex items-center justify-center rounded text-[11px] relative transition ${
                isToday
                  ? "bg-white text-black font-semibold"
                  : hasHoliday
                    ? "text-amber-300 hover:bg-white/10"
                    : "text-foreground/80 hover:bg-white/10"
              }`}
              title={dateStr}
            >
              {d}
              {hasEvent && !isToday ? (
                <span className="absolute bottom-[2px] left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-sky-400" />
              ) : null}
              {hasHoliday && !isToday && !hasEvent ? (
                <span className="absolute bottom-[2px] left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-amber-400" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Upcoming/Past events strip ----------

const dayFormatter = new Intl.DateTimeFormat("es-DO", {
  timeZone: DR_TZ,
  weekday: "short",
});
const dayNumFormatter = new Intl.DateTimeFormat("es-DO", {
  timeZone: DR_TZ,
  day: "numeric",
});
const monthShortFormatter = new Intl.DateTimeFormat("es-DO", {
  timeZone: DR_TZ,
  month: "short",
});
const timeFormatter = new Intl.DateTimeFormat("es-DO", {
  timeZone: DR_TZ,
  hour: "numeric",
  minute: "2-digit",
});

export function UpcomingEvents({
  past = [],
  upcoming = [],
  maxUpcoming = 8,
  onSelect,
  onEdit,
}: {
  past?: CalendarEventPayload[];
  upcoming?: CalendarEventPayload[];
  maxUpcoming?: number;
  onSelect?: (ev: CalendarEventPayload) => void;
  onEdit?: (ev: CalendarEventPayload) => void;
}) {
  if (past.length === 0 && upcoming.length === 0) return null;

  const combined: Array<{ ev: CalendarEventPayload; isPast: boolean }> = [];
  for (const ev of past) combined.push({ ev, isPast: true });
  for (const ev of upcoming.slice(0, Math.max(0, maxUpcoming))) {
    combined.push({ ev, isPast: false });
  }

  return (
    <div className="w-full">
      <div className="uppercase tracking-[0.2em] text-[10px] text-[color:var(--muted)] mb-2 px-1">
        Próximos
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 px-1">
        {combined.map(({ ev, isPast }) => {
          const d = new Date(ev.startMs);
          const canEdit = ev.canEdit && Boolean(onEdit);
          return (
            <button
              key={`${isPast ? "p" : "u"}-${ev.id}`}
              type="button"
              onClick={() => onSelect?.(ev)}
              className={`group relative flex-shrink-0 w-[160px] text-left rounded-lg border backdrop-blur-sm px-3 py-2.5 transition ${
                isPast
                  ? "bg-white/[0.025] border-white/5 hover:bg-white/[0.05] text-foreground/50"
                  : "bg-white/5 border-white/10 hover:bg-white/10"
              }`}
            >
              {canEdit ? (
                <span
                  role="button"
                  aria-label="Editar evento"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit?.(ev);
                  }}
                  className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition text-[color:var(--muted)] hover:text-foreground p-1 cursor-pointer"
                  title="Editar evento"
                >
                  <PencilIcon />
                </span>
              ) : null}
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-mono leading-none tabular-nums">
                  {dayNumFormatter.format(d)}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-[color:var(--muted)]">
                  {monthShortFormatter.format(d).replace(".", "")}
                </span>
                {isPast ? (
                  <span className="ml-auto text-[9px] uppercase tracking-wider text-[color:var(--muted)]/70">
                    Pasado
                  </span>
                ) : null}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-[color:var(--muted)] mt-0.5">
                {dayFormatter.format(d).replace(".", "")}
                {!ev.isAllDay ? ` · ${timeFormatter.format(d)}` : " · todo el día"}
              </div>
              <div
                className="mt-1.5 text-xs leading-tight line-clamp-2 text-foreground/90"
                title={ev.title}
              >
                {ev.title}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PencilIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
