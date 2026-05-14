"use client";

import { useEffect } from "react";
import type { CalendarEventPayload } from "@/lib/event-utils";

type Props = {
  event: CalendarEventPayload | null;
  onClose: () => void;
  onEdit?: (ev: CalendarEventPayload) => void;
};

const dateFormatter = new Intl.DateTimeFormat("es-DO", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const timeFormatter = new Intl.DateTimeFormat("es-DO", {
  hour: "numeric",
  minute: "2-digit",
});

function isUrl(value: string | undefined): value is string {
  if (!value) return false;
  return /^https?:\/\//i.test(value.trim());
}

function formatRange(ev: CalendarEventPayload): string {
  const s = new Date(ev.startMs);
  const e = new Date(ev.endMs);
  if (ev.isAllDay) {
    return `${dateFormatter.format(s)} · Todo el día`;
  }
  return `${dateFormatter.format(s)} · ${timeFormatter.format(
    s,
  )} – ${timeFormatter.format(e)}`;
}

export default function EventDetailsModal({ event, onClose, onEdit }: Props) {
  useEffect(() => {
    if (!event) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [event, onClose]);

  if (!event) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-zinc-900 border border-white/10 rounded-xl shadow-2xl max-h-[90vh] flex flex-col"
      >
        <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-white/10">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
              {event.calendarName ?? "Evento"}
            </div>
            <h2 className="text-xl font-semibold mt-1 break-words">
              {event.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[color:var(--muted)] hover:text-foreground text-xl leading-none flex-shrink-0"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 text-sm">
          <Row label="Cuándo" value={formatRange(event)} />
          {event.location ? (
            <Row
              label="Ubicación"
              value={
                isUrl(event.location) ? (
                  <a
                    href={event.location}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-400 hover:text-sky-300 underline break-all"
                  >
                    {event.location}
                  </a>
                ) : (
                  <span className="break-words">{event.location}</span>
                )
              }
            />
          ) : null}
          {event.hangoutLink ? (
            <Row
              label="Reunión"
              value={
                <a
                  href={event.hangoutLink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-400 hover:text-sky-300 underline break-all"
                >
                  {event.hangoutLink}
                </a>
              }
            />
          ) : null}
          {event.description ? (
            <Row
              label="Descripción"
              value={
                <div className="whitespace-pre-wrap break-words">
                  {event.description}
                </div>
              }
            />
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-white/10">
          {event.htmlLink ? (
            <a
              href={event.htmlLink}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-[color:var(--muted)] hover:text-foreground underline"
            >
              Abrir en Google Calendar
            </a>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded hover:bg-white/5"
            >
              Cerrar
            </button>
            {event.canEdit && onEdit ? (
              <button
                onClick={() => {
                  onEdit(event);
                  onClose();
                }}
                className="px-4 py-2 text-sm rounded bg-sky-600 hover:bg-sky-500 text-white"
              >
                Editar
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)] mb-1">
        {label}
      </div>
      <div className="text-foreground">{value}</div>
    </div>
  );
}
