"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CalendarEventPayload,
  WritableCalendar,
} from "@/lib/event-utils";

const DR_TZ = "America/Santo_Domingo";

type Mode = { kind: "create" } | { kind: "edit"; event: CalendarEventPayload };

type Props = {
  open: boolean;
  mode: Mode;
  writableCalendars: WritableCalendar[];
  onClose: () => void;
  onSaved: () => void;
};

type FormState = {
  title: string;
  calendarId: string;
  isAllDay: boolean;
  startLocal: string; // either "YYYY-MM-DDTHH:mm" or "YYYY-MM-DD"
  endLocal: string;
  location: string;
  description: string;
};

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function toLocalInputValue(ms: number, isAllDay: boolean, tz: string): string {
  // Format the instant `ms` as seen in `tz`, producing a string compatible
  // with <input type="datetime-local"> or <input type="date">.
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: isAllDay ? undefined : "2-digit",
    minute: isAllDay ? undefined : "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  if (isAllDay) return date;
  return `${date}T${get("hour")}:${get("minute")}`;
}

function tzOffsetMinutesAt(tz: string, utcMs: number): number {
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

function formatOffset(min: number): string {
  const sign = min >= 0 ? "+" : "-";
  const abs = Math.abs(min);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/**
 * Convert "YYYY-MM-DDTHH:mm" (local-to-`tz`) into an ISO string that names the
 * same wall-clock instant in `tz`, e.g. "2025-12-01T15:00:00-04:00".
 */
function buildDateTimeISO(localInput: string, tz: string): string {
  const [datePart, timePart = "00:00"] = localInput.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  // First, get the UTC ms that would be that wall-clock time IF interpreted
  // as UTC. Then correct by the TZ offset.
  const naiveUtc = Date.UTC(y, m - 1, d, hh, mm);
  const offsetMin = tzOffsetMinutesAt(tz, naiveUtc);
  const trueUtc = naiveUtc - offsetMin * 60_000;
  // The ISO with the timezone offset suffix.
  const wallY = y;
  const wallM = pad(m);
  const wallD = pad(d);
  const wallH = pad(hh);
  const wallMin = pad(mm);
  return `${wallY}-${wallM}-${wallD}T${wallH}:${wallMin}:00${formatOffset(
    tzOffsetMinutesAt(tz, trueUtc),
  )}`;
}

export default function EventModal({
  open,
  mode,
  writableCalendars,
  onClose,
  onSaved,
}: Props) {
  const browserTz =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || DR_TZ
      : DR_TZ;

  const initialState = useMemo<FormState>(() => {
    if (mode.kind === "edit") {
      const ev = mode.event;
      const tz = ev.timeZone ?? browserTz;
      return {
        title: ev.title,
        calendarId: ev.calendarId,
        isAllDay: ev.isAllDay,
        startLocal: toLocalInputValue(ev.startMs, ev.isAllDay, tz),
        endLocal: toLocalInputValue(ev.endMs, ev.isAllDay, tz),
        location: ev.location ?? "",
        description: ev.description ?? "",
      };
    }
    // create: default to "in 1 hour, 1 hour duration"
    const start = Date.now() + 60 * 60 * 1000;
    const end = start + 60 * 60 * 1000;
    const primary =
      writableCalendars.find((c) => c.isPrimary) ?? writableCalendars[0];
    return {
      title: "",
      calendarId: primary?.id ?? "",
      isAllDay: false,
      startLocal: toLocalInputValue(start, false, browserTz),
      endLocal: toLocalInputValue(end, false, browserTz),
      location: "",
      description: "",
    };
  }, [mode, writableCalendars, browserTz]);

  const [form, setForm] = useState<FormState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form whenever the modal opens or mode changes.
  useEffect(() => {
    if (open) {
      setForm(initialState);
      setError(null);
    }
  }, [open, initialState]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isEdit = mode.kind === "edit";
  const eventId = isEdit ? mode.event.id : null;
  const eventTz = isEdit
    ? (mode.event.timeZone ?? browserTz)
    : browserTz;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // When the all-day toggle flips, convert the values to the right shape.
  function toggleAllDay(next: boolean) {
    setForm((f) => {
      if (next === f.isAllDay) return f;
      if (next) {
        // strip times
        const stripDate = (s: string) => s.split("T")[0];
        return { ...f, isAllDay: true, startLocal: stripDate(f.startLocal), endLocal: stripDate(f.endLocal) };
      } else {
        // add default times
        const addTime = (s: string, t: string) =>
          s.includes("T") ? s : `${s}T${t}`;
        return {
          ...f,
          isAllDay: false,
          startLocal: addTime(f.startLocal, "09:00"),
          endLocal: addTime(f.endLocal, "10:00"),
        };
      }
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const payload: Record<string, unknown> = {
      calendarId: form.calendarId,
      title: form.title,
      description: form.description || undefined,
      location: form.location || undefined,
      isAllDay: form.isAllDay,
      timeZone: form.isAllDay ? undefined : eventTz,
    };

    if (form.isAllDay) {
      payload.startISO = form.startLocal; // YYYY-MM-DD
      // Google end.date is exclusive: add one day so a single-day event
      // covers the chosen end day.
      const [y, m, d] = form.endLocal.split("-").map(Number);
      const inclusiveEnd = new Date(Date.UTC(y, m - 1, d + 1));
      payload.endISO = `${inclusiveEnd.getUTCFullYear()}-${pad(
        inclusiveEnd.getUTCMonth() + 1,
      )}-${pad(inclusiveEnd.getUTCDate())}`;
    } else {
      payload.startISO = buildDateTimeISO(form.startLocal, eventTz);
      payload.endISO = buildDateTimeISO(form.endLocal, eventTz);
    }

    try {
      const url = isEdit ? `/api/events/${eventId}` : "/api/events";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed: ${res.status}`);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!isEdit || !eventId) return;
    if (!confirm("¿Eliminar este evento? Esta acción no se puede deshacer.")) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const url = `/api/events/${eventId}?calendarId=${encodeURIComponent(
        form.calendarId,
      )}`;
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed: ${res.status}`);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-lg bg-zinc-900 border border-white/10 rounded-xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {isEdit ? "Editar evento" : "Nuevo evento"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[color:var(--muted)] hover:text-foreground text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-[color:var(--muted)] mb-1">
            Título
          </label>
          <input
            type="text"
            required
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            className="w-full bg-zinc-800 border border-white/10 rounded px-3 py-2 text-foreground focus:outline-none focus:border-sky-500"
            placeholder="Reunión con..."
          />
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-[color:var(--muted)] mb-1">
            Calendario
          </label>
          <select
            required
            value={form.calendarId}
            onChange={(e) => update("calendarId", e.target.value)}
            className="w-full bg-zinc-800 border border-white/10 rounded px-3 py-2 text-foreground focus:outline-none focus:border-sky-500"
            disabled={isEdit}
          >
            {writableCalendars.length === 0 ? (
              <option value="">No hay calendarios con permiso de escritura</option>
            ) : null}
            {writableCalendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.isPrimary ? " (principal)" : ""}
              </option>
            ))}
          </select>
          {isEdit ? (
            <div className="text-[10px] text-[color:var(--muted)] mt-1">
              No se puede mover entre calendarios al editar.
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <input
            id="allDayChk"
            type="checkbox"
            checked={form.isAllDay}
            onChange={(e) => toggleAllDay(e.target.checked)}
            className="accent-sky-500"
          />
          <label htmlFor="allDayChk" className="text-sm select-none">
            Todo el día
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs uppercase tracking-wider text-[color:var(--muted)] mb-1">
              Inicio
            </label>
            <input
              type={form.isAllDay ? "date" : "datetime-local"}
              required
              value={form.startLocal}
              onChange={(e) => update("startLocal", e.target.value)}
              className="w-full bg-zinc-800 border border-white/10 rounded px-3 py-2 text-foreground focus:outline-none focus:border-sky-500"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-[color:var(--muted)] mb-1">
              Fin
            </label>
            <input
              type={form.isAllDay ? "date" : "datetime-local"}
              required
              value={form.endLocal}
              onChange={(e) => update("endLocal", e.target.value)}
              className="w-full bg-zinc-800 border border-white/10 rounded px-3 py-2 text-foreground focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-[color:var(--muted)] mb-1">
            Ubicación / enlace
          </label>
          <input
            type="text"
            value={form.location}
            onChange={(e) => update("location", e.target.value)}
            className="w-full bg-zinc-800 border border-white/10 rounded px-3 py-2 text-foreground focus:outline-none focus:border-sky-500"
            placeholder="Oficina, Google Meet, etc."
          />
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-[color:var(--muted)] mb-1">
            Descripción
          </label>
          <textarea
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            rows={3}
            className="w-full bg-zinc-800 border border-white/10 rounded px-3 py-2 text-foreground focus:outline-none focus:border-sky-500 resize-y"
          />
        </div>

        {error ? (
          <div className="text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded px-3 py-2">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-between pt-2">
          {isEdit ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={submitting}
              className="text-sm text-red-400 hover:text-red-300 disabled:opacity-50"
            >
              Eliminar
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm rounded hover:bg-white/5 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={
                submitting ||
                !form.title.trim() ||
                !form.calendarId ||
                writableCalendars.length === 0
              }
              className="px-4 py-2 text-sm rounded bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50"
            >
              {submitting ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
