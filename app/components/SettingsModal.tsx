"use client";

import { useEffect, useState } from "react";
import {
  LINGER_MAX_MINUTES,
  LINGER_MIN_MINUTES,
  MAX_UPCOMING_MAX,
  MAX_UPCOMING_MIN,
  NEWS_WIDTH_MAX_PX,
  NEWS_WIDTH_MIN_PX,
  type AppSettings,
  type BackgroundType,
  type DeepPartial,
  settingsFromJson,
  settingsToJson,
} from "@/lib/settings";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB
const MAX_VIDEO_BYTES = 16 * 1024 * 1024; // 16 MB — anything bigger blows localStorage

type Props = {
  open: boolean;
  settings: AppSettings;
  onClose: () => void;
  onUpdate: (partial: DeepPartial<AppSettings>) => void;
  onReplace: (next: AppSettings) => void;
  onReset: () => void;
};

type Tab = "display" | "background" | "calendar" | "news" | "json";

export default function SettingsModal({
  open,
  settings,
  onClose,
  onUpdate,
  onReplace,
  onReset,
}: Props) {
  const [tab, setTab] = useState<Tab>("display");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-zinc-900 border border-white/10 rounded-xl shadow-2xl max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold">Configuración</h2>
          <button
            onClick={onClose}
            className="text-[color:var(--muted)] hover:text-foreground text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex border-b border-white/10 text-xs uppercase tracking-wider">
          <TabBtn active={tab === "display"} onClick={() => setTab("display")}>
            Pantalla
          </TabBtn>
          <TabBtn
            active={tab === "background"}
            onClick={() => setTab("background")}
          >
            Fondo
          </TabBtn>
          <TabBtn
            active={tab === "calendar"}
            onClick={() => setTab("calendar")}
          >
            Calendario
          </TabBtn>
          <TabBtn active={tab === "news"} onClick={() => setTab("news")}>
            Noticias
          </TabBtn>
          <TabBtn active={tab === "json"} onClick={() => setTab("json")}>
            JSON
          </TabBtn>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {tab === "display" && (
            <DisplayTab settings={settings} onUpdate={onUpdate} />
          )}
          {tab === "background" && (
            <BackgroundTab settings={settings} onUpdate={onUpdate} />
          )}
          {tab === "calendar" && (
            <CalendarTab settings={settings} onUpdate={onUpdate} />
          )}
          {tab === "news" && (
            <NewsTab settings={settings} onUpdate={onUpdate} />
          )}
          {tab === "json" && (
            <JsonTab settings={settings} onReplace={onReplace} />
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10">
          <button
            onClick={() => {
              if (confirm("¿Restablecer todas las configuraciones?")) onReset();
            }}
            className="text-xs text-red-400 hover:text-red-300"
          >
            Restablecer valores
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded bg-sky-600 hover:bg-sky-500 text-white"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-4 py-3 transition ${
        active
          ? "text-foreground border-b-2 border-sky-500 bg-white/5"
          : "text-[color:var(--muted)] hover:text-foreground hover:bg-white/[0.02]"
      }`}
    >
      {children}
    </button>
  );
}

function Label({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-1.5">
      <div className="text-xs uppercase tracking-wider text-[color:var(--muted)]">
        {children}
      </div>
      {hint ? (
        <div className="text-[11px] text-[color:var(--muted)]/70 mt-0.5">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function formatLinger(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function DisplayTab({
  settings,
  onUpdate,
}: {
  settings: AppSettings;
  onUpdate: (p: DeepPartial<AppSettings>) => void;
}) {
  const linger = settings.display.lingerMinutesAfterEventEnd;
  const maxUpcoming = settings.display.maxUpcomingEvents;
  return (
    <div className="space-y-5">
      <div>
        <Label hint="Cuánto tiempo permanece visible un evento en la tira inferior después de que termina. Entre 1 minuto y 2 horas.">
          Permanencia tras finalizar — {formatLinger(linger)}
        </Label>
        <input
          type="range"
          min={LINGER_MIN_MINUTES}
          max={LINGER_MAX_MINUTES}
          step={1}
          value={linger}
          onChange={(e) =>
            onUpdate({
              display: {
                lingerMinutesAfterEventEnd: Number(e.target.value),
              },
            })
          }
          className="w-full accent-sky-500"
        />
        <div className="flex justify-between text-[10px] text-[color:var(--muted)] mt-1">
          <span>1 min</span>
          <span>1 h</span>
          <span>2 h</span>
        </div>
      </div>

      <div>
        <Label hint="Cuántas tarjetas de próximos eventos aparecen como máximo en la barra inferior.">
          Máximo de próximos eventos — {maxUpcoming}
        </Label>
        <input
          type="range"
          min={MAX_UPCOMING_MIN}
          max={MAX_UPCOMING_MAX}
          step={1}
          value={maxUpcoming}
          onChange={(e) =>
            onUpdate({
              display: { maxUpcomingEvents: Number(e.target.value) },
            })
          }
          className="w-full accent-sky-500"
        />
        <div className="flex justify-between text-[10px] text-[color:var(--muted)] mt-1">
          <span>{MAX_UPCOMING_MIN}</span>
          <span>{MAX_UPCOMING_MAX}</span>
        </div>
      </div>
    </div>
  );
}

function BackgroundTab({
  settings,
  onUpdate,
}: {
  settings: AppSettings;
  onUpdate: (p: DeepPartial<AppSettings>) => void;
}) {
  const bg = settings.background;
  const [imageError, setImageError] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoUrlDraft, setVideoUrlDraft] = useState<string>(
    bg.video.src && bg.video.src.startsWith("http") ? bg.video.src : "",
  );

  function setType(type: BackgroundType) {
    onUpdate({ background: { type } });
  }

  async function handleImageFile(file: File) {
    setImageError(null);
    if (!file.type.startsWith("image/")) {
      setImageError("El archivo no es una imagen.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError(
        `Imagen demasiado grande (${(file.size / 1024 / 1024).toFixed(
          1,
        )} MB). Máximo 4 MB.`,
      );
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    onUpdate({ background: { image: { dataUrl } } });
  }

  async function handleVideoFile(file: File) {
    setVideoError(null);
    if (!file.type.startsWith("video/")) {
      setVideoError("El archivo no es un video.");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setVideoError(
        `Video demasiado grande (${(file.size / 1024 / 1024).toFixed(
          1,
        )} MB). Máximo 16 MB para que quepa en almacenamiento local.`,
      );
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    onUpdate({ background: { video: { src: dataUrl } } });
  }

  return (
    <div className="space-y-5">
      <div>
        <Label>Tipo de fondo</Label>
        <div className="grid grid-cols-5 gap-2">
          {(
            ["lights", "color", "gradient", "image", "video"] as BackgroundType[]
          ).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`text-xs py-2 rounded border transition ${
                bg.type === t
                  ? "border-sky-500 bg-sky-500/10 text-foreground"
                  : "border-white/10 bg-white/5 text-[color:var(--muted)] hover:bg-white/10"
              }`}
            >
              {t === "lights" && "Luces"}
              {t === "color" && "Color"}
              {t === "gradient" && "Degradado"}
              {t === "image" && "Imagen"}
              {t === "video" && "Video"}
            </button>
          ))}
        </div>
      </div>

      {bg.type === "color" && (
        <div>
          <Label>Color sólido</Label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={bg.color}
              onChange={(e) =>
                onUpdate({ background: { color: e.target.value } })
              }
              className="w-12 h-10 bg-transparent border border-white/10 rounded cursor-pointer"
            />
            <input
              type="text"
              value={bg.color}
              onChange={(e) =>
                onUpdate({ background: { color: e.target.value } })
              }
              className="flex-1 bg-zinc-800 border border-white/10 rounded px-3 py-2 font-mono text-sm"
            />
          </div>
        </div>
      )}

      {bg.type === "gradient" && (
        <div className="space-y-4">
          <div>
            <Label>Color inicial</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={bg.gradient.from}
                onChange={(e) =>
                  onUpdate({
                    background: { gradient: { from: e.target.value } },
                  })
                }
                className="w-12 h-10 bg-transparent border border-white/10 rounded cursor-pointer"
              />
              <input
                type="text"
                value={bg.gradient.from}
                onChange={(e) =>
                  onUpdate({
                    background: { gradient: { from: e.target.value } },
                  })
                }
                className="flex-1 bg-zinc-800 border border-white/10 rounded px-3 py-2 font-mono text-sm"
              />
            </div>
          </div>
          <div>
            <Label>Color final</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={bg.gradient.to}
                onChange={(e) =>
                  onUpdate({
                    background: { gradient: { to: e.target.value } },
                  })
                }
                className="w-12 h-10 bg-transparent border border-white/10 rounded cursor-pointer"
              />
              <input
                type="text"
                value={bg.gradient.to}
                onChange={(e) =>
                  onUpdate({
                    background: { gradient: { to: e.target.value } },
                  })
                }
                className="flex-1 bg-zinc-800 border border-white/10 rounded px-3 py-2 font-mono text-sm"
              />
            </div>
          </div>
          <div>
            <Label>Ángulo — {bg.gradient.angle}°</Label>
            <input
              type="range"
              min={0}
              max={360}
              value={bg.gradient.angle}
              onChange={(e) =>
                onUpdate({
                  background: {
                    gradient: { angle: Number(e.target.value) },
                  },
                })
              }
              className="w-full accent-sky-500"
            />
          </div>
        </div>
      )}

      {bg.type === "image" && (
        <div className="space-y-4">
          <div>
            <Label hint="Hasta 4 MB. Se guarda dentro de la app (almacenamiento local); no se sube a ningún servidor.">
              Imagen
            </Label>
            <div className="flex items-center gap-3">
              <label className="text-xs px-3 py-2 rounded bg-zinc-800 border border-white/10 hover:bg-zinc-700 cursor-pointer">
                Subir imagen
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImageFile(f);
                    e.target.value = "";
                  }}
                />
              </label>
              {bg.image.dataUrl ? (
                <button
                  onClick={() =>
                    onUpdate({ background: { image: { dataUrl: null } } })
                  }
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Quitar imagen
                </button>
              ) : null}
            </div>
            {imageError ? (
              <div className="text-xs text-red-400 mt-2">{imageError}</div>
            ) : null}
            {bg.image.dataUrl ? (
              <div className="mt-3 w-full h-20 rounded overflow-hidden border border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={bg.image.dataUrl}
                  alt="Vista previa"
                  className="w-full h-full object-cover"
                />
              </div>
            ) : null}
          </div>
          <div>
            <Label>Difuminado — {bg.image.blur}px</Label>
            <input
              type="range"
              min={0}
              max={40}
              value={bg.image.blur}
              onChange={(e) =>
                onUpdate({
                  background: { image: { blur: Number(e.target.value) } },
                })
              }
              className="w-full accent-sky-500"
            />
          </div>
          <div>
            <Label>Opacidad — {Math.round(bg.image.opacity * 100)}%</Label>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(bg.image.opacity * 100)}
              onChange={(e) =>
                onUpdate({
                  background: {
                    image: { opacity: Number(e.target.value) / 100 },
                  },
                })
              }
              className="w-full accent-sky-500"
            />
          </div>
        </div>
      )}

      {bg.type === "video" && (
        <div className="space-y-4">
          <div>
            <Label hint="Sube un video corto (≤16 MB) o pega un enlace .mp4/.webm directo.">
              Video
            </Label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs px-3 py-2 rounded bg-zinc-800 border border-white/10 hover:bg-zinc-700 cursor-pointer">
                Subir video
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleVideoFile(f);
                    e.target.value = "";
                  }}
                />
              </label>
              {bg.video.src ? (
                <button
                  onClick={() => {
                    onUpdate({ background: { video: { src: null } } });
                    setVideoUrlDraft("");
                  }}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Quitar video
                </button>
              ) : null}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="url"
                placeholder="https://… (.mp4 / .webm)"
                value={videoUrlDraft}
                onChange={(e) => setVideoUrlDraft(e.target.value)}
                className="flex-1 bg-zinc-800 border border-white/10 rounded px-3 py-2 text-sm"
              />
              <button
                onClick={() => {
                  const v = videoUrlDraft.trim();
                  if (!v) return;
                  setVideoError(null);
                  onUpdate({ background: { video: { src: v } } });
                }}
                className="text-xs px-3 py-2 rounded bg-sky-600 hover:bg-sky-500 text-white"
              >
                Usar URL
              </button>
            </div>
            {videoError ? (
              <div className="text-xs text-red-400 mt-2">{videoError}</div>
            ) : null}
            {bg.video.src ? (
              <div className="mt-3 w-full h-24 rounded overflow-hidden border border-white/10 bg-black">
                <video
                  src={bg.video.src}
                  className="w-full h-full object-cover"
                  autoPlay
                  muted
                  loop
                  playsInline
                />
              </div>
            ) : null}
          </div>
          <div>
            <Label>Difuminado — {bg.video.blur}px</Label>
            <input
              type="range"
              min={0}
              max={40}
              value={bg.video.blur}
              onChange={(e) =>
                onUpdate({
                  background: { video: { blur: Number(e.target.value) } },
                })
              }
              className="w-full accent-sky-500"
            />
          </div>
          <div>
            <Label>Opacidad — {Math.round(bg.video.opacity * 100)}%</Label>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(bg.video.opacity * 100)}
              onChange={(e) =>
                onUpdate({
                  background: {
                    video: { opacity: Number(e.target.value) / 100 },
                  },
                })
              }
              className="w-full accent-sky-500"
            />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={bg.video.muted}
              onChange={(e) =>
                onUpdate({ background: { video: { muted: e.target.checked } } })
              }
              className="accent-sky-500"
            />
            <span className="text-sm">Silenciar video</span>
          </label>
        </div>
      )}
    </div>
  );
}

function CalendarTab({
  settings,
  onUpdate,
}: {
  settings: AppSettings;
  onUpdate: (p: DeepPartial<AppSettings>) => void;
}) {
  return (
    <div className="space-y-5">
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={settings.calendar.highlightHolidays}
          onChange={(e) =>
            onUpdate({
              calendar: { highlightHolidays: e.target.checked },
            })
          }
          className="accent-sky-500"
        />
        <div>
          <div className="text-sm">Destacar feriados</div>
          <div className="text-[11px] text-[color:var(--muted)] mt-0.5">
            Los días con feriado aparecen marcados en el mini calendario. Detecta
            calendarios de festivos automáticamente.
          </div>
        </div>
      </label>
    </div>
  );
}

function NewsTab({
  settings,
  onUpdate,
}: {
  settings: AppSettings;
  onUpdate: (p: DeepPartial<AppSettings>) => void;
}) {
  const news = settings.news;
  const [draft, setDraft] = useState(news.url);

  useEffect(() => {
    setDraft(news.url);
  }, [news.url]);

  return (
    <div className="space-y-5">
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={news.enabled}
          onChange={(e) =>
            onUpdate({ news: { enabled: e.target.checked } })
          }
          className="accent-sky-500"
        />
        <div>
          <div className="text-sm">Mostrar feed de noticias</div>
          <div className="text-[11px] text-[color:var(--muted)] mt-0.5">
            Aparecerá entre el reloj y el mini calendario. Es opcional.
          </div>
        </div>
      </label>

      <div>
        <Label hint="RSS, Atom o JSON Feed. Ejemplos: https://news.google.com/rss, https://hnrss.org/frontpage">
          URL del feed
        </Label>
        <div className="flex items-center gap-2">
          <input
            type="url"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="https://example.com/rss.xml"
            className="flex-1 bg-zinc-800 border border-white/10 rounded px-3 py-2 text-sm"
            disabled={!news.enabled}
          />
          <button
            onClick={() => onUpdate({ news: { url: draft.trim() } })}
            disabled={!news.enabled || draft.trim() === news.url}
            className="text-xs px-3 py-2 rounded bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Guardar
          </button>
        </div>
      </div>

      <div>
        <Label>
          Refrescar cada — {news.refreshMinutes} min
        </Label>
        <input
          type="range"
          min={1}
          max={120}
          value={news.refreshMinutes}
          onChange={(e) =>
            onUpdate({ news: { refreshMinutes: Number(e.target.value) } })
          }
          className="w-full accent-sky-500"
          disabled={!news.enabled}
        />
      </div>

      <div>
        <Label hint="Espacio horizontal reservado para el feed entre el reloj y el mini calendario.">
          Ancho del feed — {news.widthPx}px
        </Label>
        <input
          type="range"
          min={NEWS_WIDTH_MIN_PX}
          max={NEWS_WIDTH_MAX_PX}
          step={10}
          value={news.widthPx}
          onChange={(e) =>
            onUpdate({ news: { widthPx: Number(e.target.value) } })
          }
          className="w-full accent-sky-500"
          disabled={!news.enabled}
        />
        <div className="flex justify-between text-[10px] text-[color:var(--muted)] mt-1">
          <span>{NEWS_WIDTH_MIN_PX}px</span>
          <span>{NEWS_WIDTH_MAX_PX}px</span>
        </div>
      </div>
    </div>
  );
}

function JsonTab({
  settings,
  onReplace,
}: {
  settings: AppSettings;
  onReplace: (s: AppSettings) => void;
}) {
  const [text, setText] = useState(settingsToJson(settings));
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setText(settingsToJson(settings));
  }, [settings]);

  function applyJson() {
    try {
      const next = settingsFromJson(text);
      onReplace(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "JSON inválido");
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  function download() {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "calendario-settings.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-[color:var(--muted)]">
        Configuración como JSON. Puedes copiarla, descargarla como archivo, o
        pegar otra y aplicar.
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={14}
        className="w-full bg-zinc-950 border border-white/10 rounded px-3 py-2 font-mono text-xs text-foreground"
        spellCheck={false}
      />
      {error ? (
        <div className="text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded px-3 py-2">
          {error}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          onClick={copy}
          className="text-xs px-3 py-2 rounded bg-zinc-800 border border-white/10 hover:bg-zinc-700"
        >
          {copied ? "Copiado" : "Copiar"}
        </button>
        <button
          onClick={download}
          className="text-xs px-3 py-2 rounded bg-zinc-800 border border-white/10 hover:bg-zinc-700"
        >
          Descargar
        </button>
        <button
          onClick={applyJson}
          className="text-xs px-3 py-2 rounded bg-sky-600 hover:bg-sky-500 text-white"
        >
          Aplicar JSON
        </button>
      </div>
    </div>
  );
}
