"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import useSWR from "swr";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CalendarEventPayload,
  WritableCalendar,
} from "@/lib/event-utils";
import Background from "./components/Background";
import {
  DominicanClock,
  MiniCalendar,
  UpcomingEvents,
} from "./components/Dashboard";
import EventModal from "./components/EventModal";
import SettingsModal from "./components/SettingsModal";
import DayDetailsModal from "./components/DayDetailsModal";
import EventDetailsModal from "./components/EventDetailsModal";
import NewsFeed from "./components/NewsFeed";
import { useSettings } from "@/lib/settings";

type EventsApi = {
  current: CalendarEventPayload | null;
  next: CalendarEventPayload | null;
  past: CalendarEventPayload[];
  upcoming: CalendarEventPayload[];
  writableCalendars: WritableCalendar[];
  nowMs: number;
};

type ModalMode =
  | { kind: "create" }
  | { kind: "edit"; event: CalendarEventPayload };

const fetcher = async (url: string): Promise<EventsApi> => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error ?? `Request failed: ${res.status}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return res.json();
};

const DR_TZ = "America/Santo_Domingo";

function formatCountdown(deltaMs: number): string {
  const total = Math.max(0, Math.floor(deltaMs / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

const nextDateFormatter = new Intl.DateTimeFormat("es-DO", {
  timeZone: DR_TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
});

const nextTimeFormatter = new Intl.DateTimeFormat("es-DO", {
  timeZone: DR_TZ,
  hour: "numeric",
  minute: "2-digit",
});

function formatNextDate(ms: number): string {
  return nextDateFormatter.format(new Date(ms));
}

function formatClockShort(ms: number, isAllDay: boolean): string {
  if (isAllDay) return "Todo el día";
  return nextTimeFormatter.format(new Date(ms));
}

function formatDuration(
  startMs: number,
  endMs: number,
  isAllDay: boolean,
): string {
  if (isAllDay) return "Todo el día";
  const minutes = Math.round((endMs - startMs) / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function isUrl(value: string | undefined): value is string {
  if (!value) return false;
  return /^https?:\/\//i.test(value.trim());
}

type Urgency = {
  color: string;
  glow: string;
  pulse: boolean;
  bgTint: string;
  ringTint: string;
};

function getUrgency(deltaMs: number | null | undefined): Urgency {
  const seconds = deltaMs == null ? Infinity : Math.max(0, deltaMs / 1000);
  if (seconds >= 3600) {
    return {
      color: "#f5f5f5",
      glow: "0 0 40px rgba(255,255,255,0.08)",
      pulse: false,
      bgTint: "transparent",
      ringTint: "rgba(255,255,255,0)",
    };
  }
  if (seconds >= 1800) {
    return {
      color: "#fde68a",
      glow: "0 0 40px rgba(253,230,138,0.15)",
      pulse: false,
      bgTint: "rgba(253,230,138,0.04)",
      ringTint: "rgba(253,230,138,0.10)",
    };
  }
  if (seconds >= 600) {
    return {
      color: "#fbbf24",
      glow: "0 0 55px rgba(251,191,36,0.28)",
      pulse: false,
      bgTint: "rgba(251,191,36,0.07)",
      ringTint: "rgba(251,191,36,0.18)",
    };
  }
  if (seconds >= 120) {
    return {
      color: "#fb923c",
      glow: "0 0 65px rgba(251,146,60,0.38)",
      pulse: false,
      bgTint: "rgba(251,146,60,0.10)",
      ringTint: "rgba(251,146,60,0.25)",
    };
  }
  if (seconds >= 60) {
    return {
      color: "#ef4444",
      glow: "0 0 75px rgba(239,68,68,0.48)",
      pulse: false,
      bgTint: "rgba(239,68,68,0.14)",
      ringTint: "rgba(239,68,68,0.32)",
    };
  }
  return {
    color: "#dc2626",
    glow: "0 0 90px rgba(220,38,38,0.6)",
    pulse: true,
    bgTint: "rgba(220,38,38,0.18)",
    ringTint: "rgba(220,38,38,0.42)",
  };
}

export default function Home() {
  const { data: session, status } = useSession();
  const hasSession = status === "authenticated" && !session?.error;
  const { settings, update, replace, reset } = useSettings();

  const lingerMinutes = settings.display.lingerMinutesAfterEventEnd;
  const eventsUrl = hasSession
    ? `/api/events?lingerMinutes=${encodeURIComponent(lingerMinutes)}`
    : null;

  const { data, error, mutate, isLoading } = useSWR<EventsApi>(
    eventsUrl,
    fetcher,
    {
      refreshInterval: 60_000,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      refreshWhenHidden: false,
      shouldRetryOnError: false,
    },
  );

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (!cancelled) setNow(Date.now());
      }, 1000);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    if (typeof document !== "undefined") {
      if (document.visibilityState === "visible") start();
      const onVis = () => {
        if (document.visibilityState === "visible") {
          start();
          mutate();
        } else {
          stop();
        }
      };
      document.addEventListener("visibilitychange", onVis);
      return () => {
        cancelled = true;
        stop();
        document.removeEventListener("visibilitychange", onVis);
      };
    }
    start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [mutate]);

  const nextStartMs = data?.next?.startMs;
  const lastRefetchAtRef = useRef<number>(0);
  useEffect(() => {
    if (!nextStartMs) return;
    if (now < nextStartMs) return;
    if (Date.now() - lastRefetchAtRef.current < 5_000) return;
    lastRefetchAtRef.current = Date.now();
    mutate();
  }, [now, nextStartMs, mutate]);

  const deltaMs = data?.next ? data.next.startMs - now : null;
  const countdown = useMemo(() => {
    if (deltaMs == null) return null;
    return formatCountdown(deltaMs);
  }, [deltaMs]);
  const urgency = useMemo(() => getUrgency(deltaMs), [deltaMs]);

  // Events fed to MiniCalendar — include past for day markers + upcoming.
  const calendarEvents = useMemo<CalendarEventPayload[]>(() => {
    if (!data) return [];
    const all: CalendarEventPayload[] = [];
    if (data.current) all.push(data.current);
    if (data.next) all.push(data.next);
    if (data.past) all.push(...data.past);
    if (data.upcoming) all.push(...data.upcoming);
    return all;
  }, [data]);

  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventPayload | null>(
    null,
  );
  const [dayDetailDate, setDayDetailDate] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Progress bar value (0..1) for the "happening now" section.
  const currentProgress = useMemo(() => {
    if (!data?.current) return 0;
    const span = data.current.endMs - data.current.startMs;
    if (span <= 0) return 0;
    return Math.min(1, Math.max(0, (now - data.current.startMs) / span));
  }, [data?.current, now]);

  if (status === "loading") {
    return (
      <>
        <Background settings={settings} />
        <main className="flex-1 flex items-center justify-center min-h-screen">
          Cargando…
        </main>
      </>
    );
  }

  if (!hasSession) {
    return (
      <>
        <Background settings={settings} />
        <main className="flex-1 flex items-center justify-center min-h-screen">
          <div className="flex flex-col items-center gap-8 text-center">
            <div>
              <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">
                Calendar Countdown
              </h1>
              <p className="mt-3 text-[color:var(--muted)] text-base sm:text-lg max-w-md">
                Cuenta regresiva en tiempo real para tu próximo evento de Google
                Calendar.
              </p>
            </div>
            {session?.error === "RefreshAccessTokenError" ? (
              <p className="text-amber-400 text-sm">
                Tu sesión expiró. Inicia sesión de nuevo.
              </p>
            ) : null}
            <GoogleSignInButton onClick={() => signIn("google")} />
            <div className="mt-2 text-[10px] text-[color:var(--muted)]/60">
              Hecho por{" "}
              <a
                href="https://github.com/natatechnology"
                target="_blank"
                rel="noreferrer noopener"
                className="text-[color:var(--muted)] hover:text-foreground underline underline-offset-2 transition"
              >
                Natanael Capellán
              </a>
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Background settings={settings} />
      {/* Urgency tint */}
      <div
        aria-hidden
        className={`pointer-events-none fixed inset-0 -z-[5]${
          urgency.pulse ? " urgency-pulse" : ""
        }`}
        style={{
          background: `radial-gradient(ellipse at 50% 45%, ${urgency.bgTint} 0%, transparent 65%)`,
          boxShadow: `inset 0 0 240px ${urgency.ringTint}`,
          transition: "background 1.2s ease, box-shadow 1.2s ease",
        }}
      />
      <main className="flex-1 min-h-screen grid grid-rows-[auto_1fr_auto] gap-6 px-6 py-5">
        {/* TOP: DR clock + (optional) news feed + mini calendar */}
        <header className="flex items-start justify-between gap-6">
          <DominicanClock nowMs={now} />
          <NewsFeed
            enabled={settings.news.enabled}
            url={settings.news.url}
            refreshMinutes={settings.news.refreshMinutes}
            widthPx={settings.news.widthPx}
          />
          <MiniCalendar
            nowMs={now}
            events={calendarEvents}
            highlightHolidays={settings.calendar.highlightHolidays}
            onDayClick={(date) => setDayDetailDate(date)}
          />
        </header>

        {/* CENTER: big countdown + event details */}
        <section className="flex flex-col items-center justify-center text-center">
          {data?.current ? (
            <div className="mb-6 text-center text-[color:var(--muted)] w-full max-w-md">
              <div className="uppercase tracking-[0.2em] text-[10px] sm:text-xs">
                Sucediendo ahora
              </div>
              <div className="mt-1 text-base sm:text-lg text-foreground">
                {data.current.title}
              </div>
              <div className="mt-3 h-1 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-sky-400 transition-[width] duration-1000 ease-linear"
                  style={{ width: `${(currentProgress * 100).toFixed(2)}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[10px] tabular-nums text-[color:var(--muted)]/80">
                <span>{formatClockShort(data.current.startMs, data.current.isAllDay)}</span>
                <span>{formatClockShort(data.current.endMs, data.current.isAllDay)}</span>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="text-center">
              <div className="text-amber-400">No se pudieron cargar los eventos</div>
              <button
                className="mt-3 text-xs text-[color:var(--muted)] underline"
                onClick={() => mutate()}
              >
                Reintentar
              </button>
            </div>
          ) : !data && isLoading ? (
            <div className="text-[color:var(--muted)]">Cargando eventos…</div>
          ) : data?.next ? (
            <>
              <div
                className={`font-mono leading-none tracking-tight tabular-nums countdown-digits${
                  urgency.pulse ? " countdown-pulse" : ""
                }`}
                style={{
                  fontSize: "clamp(56px, 15vw, 260px)",
                  fontVariantNumeric: "tabular-nums",
                  color: urgency.color,
                  textShadow: urgency.glow,
                  transition: "color 1.2s ease, text-shadow 1.2s ease",
                }}
              >
                {countdown}
              </div>

              <div className="mt-6 sm:mt-8 text-center max-w-3xl">
                <div className="uppercase tracking-[0.2em] text-[10px] sm:text-xs text-[color:var(--muted)]">
                  Siguiente
                </div>
                <div className="mt-1 text-2xl sm:text-4xl font-medium">
                  {data.next.title}
                </div>
                <div className="mt-2 text-[color:var(--muted)] text-base sm:text-lg capitalize">
                  {formatNextDate(data.next.startMs)}
                </div>
                <div className="mt-1 text-[color:var(--muted)] text-sm sm:text-base">
                  {formatClockShort(data.next.startMs, data.next.isAllDay)}
                  <span className="mx-2">·</span>
                  {formatDuration(
                    data.next.startMs,
                    data.next.endMs,
                    data.next.isAllDay,
                  )}
                </div>
                {data.next.hangoutLink || isUrl(data.next.location) ? (
                  <a
                    className="mt-2 inline-block text-sky-400 hover:text-sky-300 underline text-base sm:text-lg break-all"
                    href={data.next.hangoutLink ?? data.next.location ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {data.next.hangoutLink ?? data.next.location}
                  </a>
                ) : data.next.location ? (
                  <div className="mt-2 text-base sm:text-lg">
                    {data.next.location}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="text-center text-[color:var(--muted)]">
              <div className="text-2xl sm:text-3xl">No hay próximos eventos</div>
              <div className="mt-2 text-sm">
                Nada en tus calendarios en los próximos 7 días.
              </div>
            </div>
          )}
        </section>

        {/* BOTTOM: events strip + menu */}
        <footer className="flex items-end justify-between gap-4">
          <div className="flex-1 min-w-0">
            <UpcomingEvents
              past={data?.past ?? []}
              upcoming={data?.upcoming ?? []}
              maxUpcoming={settings.display.maxUpcomingEvents}
              onSelect={(ev) => setSelectedEvent(ev)}
              onEdit={(ev) => setModalMode({ kind: "edit", event: ev })}
            />
          </div>
          <nav className="flex flex-col items-end gap-1.5 mb-2 whitespace-nowrap">
            <div className="flex items-center gap-4 text-[10px] uppercase tracking-[0.2em]">
              <button
                onClick={() => setModalMode({ kind: "create" })}
                className="flex items-center gap-1.5 text-[color:var(--muted)] hover:text-foreground transition"
              >
                <span aria-hidden className="text-sm leading-none">
                  +
                </span>
                Nuevo evento
              </button>
              <span aria-hidden className="text-[color:var(--muted)]/30">
                |
              </span>
              <button
                onClick={() => setSettingsOpen(true)}
                className="text-[color:var(--muted)] hover:text-foreground transition"
              >
                Configuración
              </button>
              <span aria-hidden className="text-[color:var(--muted)]/30">
                |
              </span>
              <button
                onClick={() => signOut()}
                className="text-[color:var(--muted)]/70 hover:text-foreground transition"
              >
                Cerrar sesión
              </button>
            </div>
            <div className="text-[10px] text-[color:var(--muted)]/60">
              Desarrollado por{" "}
              <a
                href="https://github.com/natatechnology"
                target="_blank"
                rel="noreferrer noopener"
                className="text-[color:var(--muted)] hover:text-foreground underline underline-offset-2 transition"
              >
                Natanael Capellán
              </a>
            </div>
          </nav>
        </footer>
      </main>

      {modalMode ? (
        <EventModal
          open
          mode={modalMode}
          writableCalendars={data?.writableCalendars ?? []}
          onClose={() => setModalMode(null)}
          onSaved={() => mutate()}
        />
      ) : null}

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onUpdate={update}
        onReplace={replace}
        onReset={reset}
      />

      <DayDetailsModal
        open={dayDetailDate !== null}
        dateStr={dayDetailDate}
        onClose={() => setDayDetailDate(null)}
        onSelectEvent={(ev) => {
          setDayDetailDate(null);
          setSelectedEvent(ev);
        }}
      />

      <EventDetailsModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onEdit={(ev) => setModalMode({ kind: "edit", event: ev })}
      />
    </>
  );
}

function GoogleSignInButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 bg-white text-gray-900 font-medium px-5 py-3 rounded-md shadow hover:shadow-md transition"
    >
      <GoogleLogo />
      <span>Iniciar sesión con Google</span>
    </button>
  );
}

function GoogleLogo() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20c0-1.3-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.4-4.5 2.4-7.2 2.4-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.6l6.2 5.2C40.9 36 44 30.5 44 24c0-1.3-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}
