import { NextResponse } from "next/server";
import type { NewsItem } from "@/lib/news-types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_ITEMS = 20;
const FETCH_TIMEOUT_MS = 10_000;

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function stripHtmlTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").trim();
}

function pickTagContent(block: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  if (!m) return undefined;
  const raw = stripCdata(m[1]).trim();
  return raw ? decodeXmlEntities(raw) : undefined;
}

function pickAtomLink(block: string): string | undefined {
  // Atom links are self-closing: <link href="..." rel="alternate" />
  const m = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  return m ? decodeXmlEntities(m[1]) : undefined;
}

function parseRssOrAtom(xml: string): NewsItem[] {
  // <item>…</item> for RSS, <entry>…</entry> for Atom.
  const itemRegex = /<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  const items: NewsItem[] = [];
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null && items.length < MAX_ITEMS) {
    const block = match[2];
    const title = pickTagContent(block, "title") ?? "(no title)";
    const link =
      pickTagContent(block, "link") ?? pickAtomLink(block) ?? undefined;
    const description =
      pickTagContent(block, "description") ??
      pickTagContent(block, "summary") ??
      pickTagContent(block, "content") ??
      undefined;
    const pubText =
      pickTagContent(block, "pubDate") ??
      pickTagContent(block, "published") ??
      pickTagContent(block, "updated") ??
      undefined;
    const guid =
      pickTagContent(block, "guid") ??
      pickTagContent(block, "id") ??
      link ??
      `${items.length}-${title.slice(0, 32)}`;
    const pubMs = pubText ? Date.parse(pubText) : NaN;
    items.push({
      id: guid,
      title: stripHtmlTags(title),
      link,
      summary: description ? stripHtmlTags(description).slice(0, 220) : undefined,
      pubMs: Number.isFinite(pubMs) ? pubMs : undefined,
    });
  }
  return items;
}

function parseJsonFeed(json: unknown): NewsItem[] | null {
  if (!json || typeof json !== "object") return null;
  // JSON Feed v1: https://www.jsonfeed.org/version/1.1/
  const items = (json as { items?: unknown[] }).items;
  if (!Array.isArray(items)) return null;
  const sourceTitle =
    typeof (json as { title?: unknown }).title === "string"
      ? ((json as { title: string }).title as string)
      : undefined;
  return items.slice(0, MAX_ITEMS).map((raw, idx) => {
    const it = raw as Record<string, unknown>;
    const title =
      (typeof it.title === "string" && it.title) ||
      (typeof it.summary === "string" && it.summary) ||
      "(no title)";
    const link =
      (typeof it.url === "string" && it.url) ||
      (typeof it.external_url === "string" && it.external_url) ||
      undefined;
    const summary =
      (typeof it.summary === "string" && it.summary) ||
      (typeof it.content_text === "string" && it.content_text) ||
      undefined;
    const pubText =
      (typeof it.date_published === "string" && it.date_published) ||
      (typeof it.date_modified === "string" && it.date_modified) ||
      undefined;
    const pubMs = pubText ? Date.parse(pubText) : NaN;
    const id =
      (typeof it.id === "string" && it.id) ||
      link ||
      `${idx}-${String(title).slice(0, 32)}`;
    return {
      id,
      title: stripHtmlTags(String(title)),
      link,
      summary: summary ? stripHtmlTags(summary).slice(0, 220) : undefined,
      source: sourceTitle,
      pubMs: Number.isFinite(pubMs) ? pubMs : undefined,
    };
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = url.searchParams.get("url");
  if (!target) {
    return NextResponse.json({ error: "Missing `url` query" }, { status: 400 });
  }

  let parsedTarget: URL;
  try {
    parsedTarget = new URL(target);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }
  if (parsedTarget.protocol !== "http:" && parsedTarget.protocol !== "https:") {
    return NextResponse.json(
      { error: "Only http(s) URLs are supported" },
      { status: 400 },
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(parsedTarget.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "calendario-newsfeed/0.1 (+local) Mozilla/5.0 compatible",
        Accept:
          "application/rss+xml, application/atom+xml, application/feed+json, application/json;q=0.9, application/xml;q=0.8, text/xml;q=0.7, */*;q=0.5",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${res.status}` },
        { status: 502 },
      );
    }
    const body = await res.text();
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    const looksJson =
      contentType.includes("json") || body.trim().startsWith("{");

    let items: NewsItem[] = [];
    if (looksJson) {
      try {
        items = parseJsonFeed(JSON.parse(body)) ?? [];
      } catch {
        items = [];
      }
    }
    if (items.length === 0) {
      items = parseRssOrAtom(body);
    }

    return NextResponse.json(
      { items, fetchedAt: Date.now() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? "Upstream timed out"
          : err.message
        : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
