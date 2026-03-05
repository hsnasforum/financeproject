import { createHash } from "node:crypto";
import { type NewsItem } from "./types.ts";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeText(value: string): string {
  return asString(value)
    .toLowerCase()
    .replace(/[^0-9a-z가-힣\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function pickSnippet(snippet: string, description?: string): string {
  const primary = asString(snippet);
  if (primary) return primary;
  return asString(description);
}

export function buildContentHash(title: string, snippet: string, description?: string): string {
  return sha256(`${normalizeText(title)}|${normalizeText(pickSnippet(snippet, description))}`);
}

export function publishedDateBucket(isoDate: string): string {
  const trimmed = asString(isoDate);
  if (!trimmed) return "1970-01-01";
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return "1970-01-01";
  return new Date(parsed).toISOString().slice(0, 10);
}

export function buildDedupeKey(title: string, snippet: string, publishedAt: string, description?: string): string {
  const text = `${normalizeText(title)}|${normalizeText(pickSnippet(snippet, description))}|${publishedDateBucket(publishedAt)}`;
  return sha256(text);
}

export type DedupeNewsResult = {
  items: NewsItem[];
  dedupedCount: number;
};

function compareNewsItem(a: NewsItem, b: NewsItem): number {
  if (a.publishedAt !== b.publishedAt) return b.publishedAt.localeCompare(a.publishedAt);
  if (a.canonicalUrl !== b.canonicalUrl) return a.canonicalUrl.localeCompare(b.canonicalUrl);
  return a.id.localeCompare(b.id);
}

export function dedupeNewsItems(items: NewsItem[]): DedupeNewsResult {
  const byCanonical = new Map<string, NewsItem>();
  const byDedupeKey = new Map<string, NewsItem>();

  const sorted = [...items].sort(compareNewsItem);
  const out: NewsItem[] = [];

  for (const item of sorted) {
    const canonical = asString(item.canonicalUrl);
    const dkey = asString(item.dedupeKey);

    if (canonical && byCanonical.has(canonical)) continue;
    if (dkey && byDedupeKey.has(dkey)) continue;

    out.push(item);
    if (canonical) byCanonical.set(canonical, item);
    if (dkey) byDedupeKey.set(dkey, item);
  }

  return {
    items: out,
    dedupedCount: Math.max(0, items.length - out.length),
  };
}

export function tokenizeText(input: string, stopwords: Set<string> = new Set()): string[] {
  const normalized = normalizeText(input);
  if (!normalized) return [];
  const tokens = normalized
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 || /^\d+$/.test(token))
    .filter((token) => !stopwords.has(token));
  return [...new Set(tokens)].sort((a, b) => a.localeCompare(b));
}
