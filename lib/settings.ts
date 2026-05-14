"use client";

import { useCallback, useEffect, useState } from "react";

export type BackgroundType = "lights" | "color" | "gradient" | "image" | "video";

export type AppSettings = {
  display: {
    // Minutes past an event's end that it stays visible in the bottom strip.
    // Range: 1–120 (1 min to 2 h).
    lingerMinutesAfterEventEnd: number;
    // Maximum number of upcoming events to show in the bottom strip (1–20).
    maxUpcomingEvents: number;
  };
  background: {
    type: BackgroundType;
    color: string;
    gradient: {
      from: string;
      to: string;
      angle: number;
    };
    image: {
      dataUrl: string | null;
      blur: number;
      opacity: number;
    };
    video: {
      // Either a data: URL from an uploaded file, or a remote URL.
      src: string | null;
      blur: number;
      opacity: number;
      muted: boolean;
    };
  };
  calendar: {
    highlightHolidays: boolean;
  };
  news: {
    enabled: boolean;
    url: string;
    // How often to refresh the news feed in minutes (1–120).
    refreshMinutes: number;
    // Width of the feed column in pixels (240–960).
    widthPx: number;
  };
};

export const DEFAULT_SETTINGS: AppSettings = {
  display: {
    lingerMinutesAfterEventEnd: 5,
    maxUpcomingEvents: 8,
  },
  background: {
    type: "lights",
    color: "#050505",
    gradient: {
      from: "#1e293b",
      to: "#020617",
      angle: 135,
    },
    image: {
      dataUrl: null,
      blur: 8,
      opacity: 0.6,
    },
    video: {
      src: null,
      blur: 6,
      opacity: 0.55,
      muted: true,
    },
  },
  calendar: {
    highlightHolidays: true,
  },
  news: {
    enabled: false,
    url: "",
    refreshMinutes: 15,
    widthPx: 360,
  },
};

export const LINGER_MIN_MINUTES = 1;
export const LINGER_MAX_MINUTES = 120;
export const MAX_UPCOMING_MIN = 1;
export const MAX_UPCOMING_MAX = 20;
export const NEWS_WIDTH_MIN_PX = 240;
export const NEWS_WIDTH_MAX_PX = 960;

const STORAGE_KEY = "calendar-countdown:settings:v2";
// We bumped the schema; v1 stored linger as seconds. Migrate when we find it.
const STORAGE_KEY_LEGACY_V1 = "calendar-countdown:settings:v1";

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function deepMerge<T>(base: T, partial: DeepPartial<T>): T {
  if (!isPlainObject(base) || !isPlainObject(partial)) {
    return (partial as T) ?? base;
  }
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(partial)) {
    const baseVal = (base as Record<string, unknown>)[k];
    if (isPlainObject(baseVal) && isPlainObject(v)) {
      out[k] = deepMerge(baseVal, v as DeepPartial<unknown>);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}

function clampLinger(minutes: number): number {
  if (!Number.isFinite(minutes)) return DEFAULT_SETTINGS.display.lingerMinutesAfterEventEnd;
  return Math.min(LINGER_MAX_MINUTES, Math.max(LINGER_MIN_MINUTES, Math.round(minutes)));
}

function clampInt(n: number, lo: number, hi: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

function normalizeSettings(s: AppSettings): AppSettings {
  return {
    ...s,
    display: {
      ...s.display,
      lingerMinutesAfterEventEnd: clampLinger(s.display.lingerMinutesAfterEventEnd),
      maxUpcomingEvents: clampInt(
        s.display.maxUpcomingEvents,
        MAX_UPCOMING_MIN,
        MAX_UPCOMING_MAX,
        DEFAULT_SETTINGS.display.maxUpcomingEvents,
      ),
    },
    news: {
      ...s.news,
      widthPx: clampInt(
        s.news.widthPx,
        NEWS_WIDTH_MIN_PX,
        NEWS_WIDTH_MAX_PX,
        DEFAULT_SETTINGS.news.widthPx,
      ),
    },
  };
}

function migrateLegacyV1(raw: string): DeepPartial<AppSettings> | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const display = isPlainObject(parsed.display) ? parsed.display : {};
    const linger = display.lingerSecondsAfterEventEnd;
    const minutes =
      typeof linger === "number"
        ? Math.max(1, Math.round(linger / 60))
        : DEFAULT_SETTINGS.display.lingerMinutesAfterEventEnd;
    return {
      display: { lingerMinutesAfterEventEnd: minutes },
      background: isPlainObject(parsed.background)
        ? (parsed.background as DeepPartial<AppSettings>["background"])
        : undefined,
      calendar: isPlainObject(parsed.calendar)
        ? (parsed.calendar as DeepPartial<AppSettings>["calendar"])
        : undefined,
    };
  } catch {
    return null;
  }
}

function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DeepPartial<AppSettings>;
      return normalizeSettings(deepMerge(DEFAULT_SETTINGS, parsed));
    }
    const legacy = window.localStorage.getItem(STORAGE_KEY_LEGACY_V1);
    if (legacy) {
      const migrated = migrateLegacyV1(legacy);
      if (migrated) {
        const merged = normalizeSettings(deepMerge(DEFAULT_SETTINGS, migrated));
        // Persist under new key; leave the old one for one cycle in case the
        // user rolls back.
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        } catch {}
        return merged;
      }
    }
    return DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: AppSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // localStorage full (huge background image/video) — swallow.
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
    setReady(true);

    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setSettings(loadSettings());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((partial: DeepPartial<AppSettings>) => {
    setSettings((prev) => {
      const next = normalizeSettings(deepMerge(prev, partial));
      saveSettings(next);
      return next;
    });
  }, []);

  const replace = useCallback((next: AppSettings) => {
    const norm = normalizeSettings(next);
    saveSettings(norm);
    setSettings(norm);
  }, []);

  const reset = useCallback(() => {
    saveSettings(DEFAULT_SETTINGS);
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return { settings, update, replace, reset, ready };
}

export function settingsToJson(s: AppSettings): string {
  return JSON.stringify(s, null, 2);
}

export function settingsFromJson(json: string): AppSettings {
  const parsed = JSON.parse(json) as DeepPartial<AppSettings>;
  return normalizeSettings(deepMerge(DEFAULT_SETTINGS, parsed));
}
