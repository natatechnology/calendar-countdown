"use client";

import { useEffect, useState } from "react";
import type { CalendarEventPayload } from "@/lib/event-utils";

type Props = {
  open: boolean;
  dateStr: string | null; // YYYY-MM-DD
  onClose: () => void;
  onSelectEvent?: (ev: CalendarEventPayload) => void;
};

const headingFormatter = new Intl.DateTimeFormat("es-DO", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Santo_Domingo",
});

const timeFormatter = new Intl.DateTimeFormat("es-DO", {
  timeZone: "America/Santo_Domingo",
  hour: "numeric",
  minute: "2-digit",
});

export default function DayDetailsModal({
  open,
  dateStr,
  onClose,
  onSelectEvent,
}: Props) {
  const [events, setEvents] = useState<CalendarEventPayload[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !dateStr) return;
    let cancelled = false;
    setEvents(null);
    setError(null);
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/events/day?date=${encodeURIComponent(dateStr)}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Request failed: ${res.status}`);
        }
        const data = (await res.json()) as {
          events: CalendarEventPayload[];
        };
        if (!cancelled) setEvents(data.events);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, dateStr]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !dateStr) return null;

  const [y, m, d] = dateStr.split("-").map(Number);
  // Use noon UTC for the heading to avoid TZ edge issues.
  const headingDate = new Date(Date.UTC(y, m - 1, d, 12));

  const holidays = events?.filter((e) => e.isHoliday) ?? [];
  const regular = events?.filter((e) => !e.isHoliday) ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-zinc-900 border border-white/10 rounded-xl shadow-2xl max-h-[90vh] flex flex-col"
      >
        <div className="flex items-start justify-between px-6 py-5 border-b border-white/10">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
              Día
            </div>
            <h2 className="text-xl font-semibold mt-1 capitalize">
              {headingFormatter.format(headingDate)}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[color:var(--muted)] hover:text-foreground text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-sm">
          {loading ? (
            <div className="text-[color:var(--muted)]">Cargando…</div>
          ) : error ? (
            <div className="text-red-400">No se pudo cargar: {error}</div>
          ) : (
            <>
              {holidays.length > 0 ? (
                <Section title="Feriados">
                  {holidays.map((ev) => (
                    <HolidayRow key={ev.id} event={ev} />
                  ))}
                </Section>
              ) : null}
              {regular.length > 0 ? (
                <Section title="Eventos">
                  {regular.map((ev) => (
                    <EventRow
                      key={ev.id}
                      event={ev}
                      onClick={() => onSelectEvent?.(ev)}
                    />
                  ))}
                </Section>
              ) : null}
              {holidays.length === 0 && regular.length === 0 ? (
                <div className="text-[color:var(--muted)]">
                  No hay nada en este día.
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded hover:bg-white/5"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)] mb-2">
        {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function HolidayRow({ event }: { event: CalendarEventPayload }) {
  return (
    <div className="rounded px-3 py-2 bg-amber-500/10 border border-amber-500/30">
      <div className="text-sm">{event.title}</div>
      {event.calendarName ? (
        <div className="text-[11px] text-[color:var(--muted)] mt-0.5">
          {event.calendarName}
        </div>
      ) : null}
    </div>
  );
}

function EventRow({
  event,
  onClick,
}: {
  event: CalendarEventPayload;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 transition"
    >
      <div className="flex items-baseline gap-3">
        <div className="text-xs text-[color:var(--muted)] tabular-nums w-24 flex-shrink-0">
          {event.isAllDay
            ? "Todo el día"
            : `${timeFormatter.format(new Date(event.startMs))} – ${timeFormatter.format(new Date(event.endMs))}`}
        </div>
        <div className="text-sm flex-1 min-w-0">{event.title}</div>
      </div>
    </button>
  );
}
