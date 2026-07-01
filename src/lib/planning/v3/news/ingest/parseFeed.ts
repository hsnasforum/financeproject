import { RawFeedEntrySchema, type RawFeedEntry } from "../contracts";

function decodeXml(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(text: string, maxLen = 1500): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen);
}

function extractFirstTag(block: string, tagName: string): string {
  const pattern = new RegExp(`<(?:[\\w-]+:)?${tagName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tagName}>`, "i");
  const matched = block.match(pattern);
  return matched?.[1] ? decodeXml(matched[1]).trim() : "";
}

function extractAtomLink(block: string): string {
  const links = [...block.matchAll(/<(?:[\w-]+:)?link\b([^>]*)>/gi)];
  for (const token of links) {
    const attrs = token[1] ?? "";
    const rel = attrs.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1]?.trim().toLowerCase();
    const href = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1]?.trim();
    if (!href) continue;
    if (!rel || rel === "alternate") return href;
  }
  return "";
}

function parseRss(xml: string): RawFeedEntry[] {
  const items = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)];
  return items
    .map((entry) => {
      const block = entry[0];
      const title = extractFirstTag(block, "title");
      const link = extractFirstTag(block, "link");
      const guid = extractFirstTag(block, "guid");
      const publishedAt = extractFirstTag(block, "pubDate") || extractFirstTag(block, "published") || extractFirstTag(block, "updated");
      const description = extractFirstTag(block, "description");
      const snippet = truncate(stripHtml(description));

      return RawFeedEntrySchema.parse({
        title,
        link,
        guid,
        publishedAt,
        snippet,
      });
    })
    .filter((entry) => Boolean(entry.title || entry.link || entry.guid));
}

function parseAtom(xml: string): RawFeedEntry[] {
  const entries = [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)];
  return entries
    .map((entry) => {
      const block = entry[0];
      const title = extractFirstTag(block, "title");
      const link = extractAtomLink(block);
      const guid = extractFirstTag(block, "id");
      const publishedAt = extractFirstTag(block, "published") || extractFirstTag(block, "updated");
      const summary = extractFirstTag(block, "summary");
      const snippet = truncate(stripHtml(summary));

      return RawFeedEntrySchema.parse({
        title,
        link,
        guid,
        publishedAt,
        snippet,
      });
    })
    .filter((entry) => Boolean(entry.title || entry.link || entry.guid));
}

export function parseFeed(xml: string): RawFeedEntry[] {
  const body = xml.trim();
  if (!body) return [];

  if (/<(?:[\w-]+:)?feed\b/i.test(body)) {
    return parseAtom(body);
  }

  if (/<(?:[\w-]+:)?rss\b/i.test(body) || /<rdf:RDF\b/i.test(body)) {
    return parseRss(body);
  }

  return [];
}
