import { type RawFeedEntry } from "./types";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function decodeEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/&nbsp;/gi, " ");
}

function stripTags(input: string): string {
  return decodeEntities(input)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTag(block: string, tag: string): string {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const matched = block.match(pattern);
  return asString(matched?.[1] ?? "");
}

function parseRssLink(block: string): string {
  const direct = parseTag(block, "link");
  if (direct) return decodeEntities(direct);

  const enclosure = block.match(/<enclosure\s+[^>]*url=["']([^"']+)["'][^>]*>/i);
  return asString(enclosure?.[1] ?? "");
}

function parseAtomLink(block: string): string {
  const candidates = [...block.matchAll(/<link\s+([^>]+?)\/?>(?:<\/link>)?/gi)];
  for (const candidate of candidates) {
    const attrs = candidate[1] ?? "";
    const href = attrs.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const rel = asString(attrs.match(/rel=["']([^"']+)["']/i)?.[1] ?? "").toLowerCase();
    if (!rel || rel === "alternate" || rel === "self") return href.trim();
  }
  return "";
}

function parseDateToIso(raw: string): string | null {
  const value = asString(raw);
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString();

  if (/^\d{8}$/.test(value)) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6)) - 1;
    const day = Number(value.slice(6, 8));
    const ts = Date.UTC(year, month, day);
    if (Number.isFinite(ts)) return new Date(ts).toISOString();
  }

  return null;
}

function normalizeEntry(input: {
  feedItemId?: string;
  title?: string;
  snippet?: string;
  url?: string;
  publishedAt?: string | null;
}): RawFeedEntry | null {
  const title = stripTags(asString(input.title));
  const snippet = stripTags(asString(input.snippet)).slice(0, 1500);
  const url = decodeEntities(asString(input.url));
  if (!title || !url) return null;

  return {
    feedItemId: asString(input.feedItemId) || undefined,
    title,
    snippet,
    description: snippet,
    url,
    publishedAt: parseDateToIso(asString(input.publishedAt ?? "")),
  };
}

function parseRssItems(xml: string): RawFeedEntry[] {
  const out: RawFeedEntry[] = [];
  const blocks = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)];
  for (const block of blocks) {
    const body = block[1] ?? "";
    const entry = normalizeEntry({
      feedItemId: parseTag(body, "guid") || parseTag(body, "id") || undefined,
      title: parseTag(body, "title"),
      // Keep raw strictly at RSS description level; do not ingest full body fields.
      snippet: parseTag(body, "description"),
      url: parseRssLink(body),
      publishedAt: parseTag(body, "pubDate") || parseTag(body, "published") || parseTag(body, "dc:date"),
    });
    if (!entry) continue;
    out.push(entry);
  }
  return out;
}

function parseAtomEntries(xml: string): RawFeedEntry[] {
  const out: RawFeedEntry[] = [];
  const blocks = [...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)];
  for (const block of blocks) {
    const body = block[1] ?? "";
    const entry = normalizeEntry({
      feedItemId: parseTag(body, "id") || parseTag(body, "guid") || undefined,
      title: parseTag(body, "title"),
      // Keep raw strictly at summary/description level; avoid full content fields.
      snippet: parseTag(body, "summary"),
      url: parseAtomLink(body),
      publishedAt: parseTag(body, "published") || parseTag(body, "updated"),
    });
    if (!entry) continue;
    out.push(entry);
  }
  return out;
}

function uniqueByUrlAndTitle(items: RawFeedEntry[]): RawFeedEntry[] {
  const seen = new Set<string>();
  const out: RawFeedEntry[] = [];
  for (const item of items) {
    const key = `${item.url}::${item.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function parseFeedXml(xml: string): RawFeedEntry[] {
  const source = asString(xml);
  if (!source) return [];
  const isAtom = /<feed[\s>]/i.test(source) && /<entry[\s>]/i.test(source);
  const parsed = isAtom ? parseAtomEntries(source) : parseRssItems(source);
  return uniqueByUrlAndTitle(parsed);
}
