import { NewsItemSchema, type NewsItem, type RawFeedEntry } from "../contracts";
import { buildItemId, canonicalizeUrl } from "./url";

function cleanText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizePublishedAt(value: string | undefined): string | undefined {
  const raw = cleanText(value);
  if (!raw) return undefined;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return undefined;
  return new Date(parsed).toISOString();
}

export function normalizeEntry(raw: RawFeedEntry, sourceId: string, fetchedAtIso: string): NewsItem | null {
  const source = cleanText(sourceId);
  if (!source) return null;

  const title = cleanText(raw.title);
  const guid = cleanText(raw.guid) || undefined;
  const link = cleanText(raw.link);
  const publishedAt = normalizePublishedAt(raw.publishedAt);
  const canonicalUrl = canonicalizeUrl(link);

  if (!title && !guid && !canonicalUrl) return null;

  const id = buildItemId({
    sourceId: source,
    guid,
    canonicalUrl,
    title,
    publishedAt,
  });

  const fallbackUrl = `urn:news:${source}:${id}`;
  const item: NewsItem = {
    id,
    sourceId: source,
    title: title || "(untitled)",
    url: canonicalUrl || fallbackUrl,
    publishedAt,
    guid,
    snippet: cleanText(raw.snippet).slice(0, 1500) || undefined,
    fetchedAt: fetchedAtIso,
  };

  return NewsItemSchema.parse(item);
}
