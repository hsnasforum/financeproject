import { describe, expect, it } from "vitest";
import { dedupeNewsItems } from "../src/lib/news/dedupe";
import { type NewsItem } from "../src/lib/news/types";

function item(id: string, canonicalUrl: string, dedupeKey: string): NewsItem {
  return {
    id,
    sourceId: "f1",
    sourceName: "feed",
    url: canonicalUrl,
    canonicalUrl,
    title: `title-${id}`,
    snippet: `snippet-${id}`,
    description: `desc-${id}`,
    publishedAt: "2026-03-04T00:00:00.000Z",
    fetchedAt: "2026-03-04T00:10:00.000Z",
    contentHash: `hash-${id}`,
    dedupeKey,
  };
}

describe("news dedupe", () => {
  it("drops by canonical url first", () => {
    const rows = [
      item("a", "https://example.com/a", "k1"),
      item("b", "https://example.com/a", "k2"),
      item("c", "https://example.com/c", "k3"),
    ];
    const result = dedupeNewsItems(rows);
    expect(result.items).toHaveLength(2);
    expect(result.dedupedCount).toBe(1);
  });

  it("drops by dedupe key", () => {
    const rows = [
      item("a", "https://example.com/a", "same"),
      item("b", "https://example.com/b", "same"),
    ];
    const result = dedupeNewsItems(rows);
    expect(result.items).toHaveLength(1);
    expect(result.dedupedCount).toBe(1);
  });
});
