"use client";

import useSWR from "swr";
import type { NewsItem, NewsResponse } from "@/lib/news-types";

const fetcher = async (url: string): Promise<NewsResponse> => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
};

const relativeTime = new Intl.RelativeTimeFormat("es-DO", { numeric: "auto" });

function formatRelative(ms: number, nowMs: number): string {
  const delta = ms - nowMs;
  const sec = Math.round(delta / 1000);
  const abs = Math.abs(sec);
  if (abs < 60) return relativeTime.format(sec, "second");
  const min = Math.round(sec / 60);
  if (Math.abs(min) < 60) return relativeTime.format(min, "minute");
  const hr = Math.round(min / 60);
  if (Math.abs(hr) < 24) return relativeTime.format(hr, "hour");
  const day = Math.round(hr / 24);
  return relativeTime.format(day, "day");
}

export default function NewsFeed({
  enabled,
  url,
  refreshMinutes,
  widthPx,
}: {
  enabled: boolean;
  url: string;
  refreshMinutes: number;
  widthPx: number;
}) {
  const fetchUrl =
    enabled && url ? `/api/news?url=${encodeURIComponent(url)}` : null;

  const { data, error, isLoading } = useSWR<NewsResponse>(fetchUrl, fetcher, {
    refreshInterval: Math.max(1, refreshMinutes) * 60_000,
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  if (!enabled || !url) return null;

  return (
    <div className="shrink-0" style={{ width: widthPx }}>
      <div className="uppercase tracking-[0.2em] text-[10px] text-[color:var(--muted)] mb-2 text-center">
        Noticias
      </div>
      {error ? (
        <div className="text-[11px] text-amber-400 text-center">
          No se pudo cargar el feed
        </div>
      ) : isLoading && !data ? (
        <div className="text-[11px] text-[color:var(--muted)] text-center">
          Cargando…
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1 justify-center">
          {(data?.items ?? []).slice(0, 8).map((it) => (
            <NewsCard key={it.id} item={it} nowMs={data?.fetchedAt ?? Date.now()} />
          ))}
          {data && data.items.length === 0 ? (
            <div className="text-[11px] text-[color:var(--muted)]">
              Sin noticias
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function NewsCard({ item, nowMs }: { item: NewsItem; nowMs: number }) {
  const content = (
    <>
      <div className="text-[10px] uppercase tracking-wider text-[color:var(--muted)] mb-1 line-clamp-1">
        {item.pubMs ? formatRelative(item.pubMs, nowMs) : item.source ?? "Feed"}
      </div>
      <div className="text-xs leading-tight line-clamp-3 text-foreground/90">
        {item.title}
      </div>
    </>
  );

  const className =
    "flex-shrink-0 w-[180px] rounded-lg bg-white/5 border border-white/10 backdrop-blur-sm px-3 py-2 hover:bg-white/10 transition text-left";

  if (item.link) {
    return (
      <a
        href={item.link}
        target="_blank"
        rel="noreferrer noopener"
        className={className}
        title={item.title}
      >
        {content}
      </a>
    );
  }
  return (
    <div className={className} title={item.title}>
      {content}
    </div>
  );
}
