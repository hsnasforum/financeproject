import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeEntry } from "./normalizeEntry";
import { parseFeed } from "./parseFeed";
import { canonicalizeUrl } from "./url";

function readFixture(name: string): string {
  return fs.readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf-8");
}

describe("planning v3 news parse+normalize", () => {
  it("parses RSS/Atom and normalizes minimal NewsItem fields", () => {
    const rssEntries = parseFeed(readFixture("sample-rss.xml"));
    const atomEntries = parseFeed(readFixture("sample-atom.xml"));

    expect(rssEntries.length).toBe(2);
    expect(atomEntries.length).toBe(2);

    const fetchedAt = "2026-03-04T10:00:00.000Z";
    const firstRss = normalizeEntry(rssEntries[0]!, "rss-source", fetchedAt);
    const secondRss = normalizeEntry(rssEntries[1]!, "rss-source", fetchedAt);
    const firstAtom = normalizeEntry(atomEntries[0]!, "atom-source", fetchedAt);

    expect(firstRss).not.toBeNull();
    expect(firstRss?.sourceId).toBe("rss-source");
    expect(firstRss?.title.length).toBeGreaterThan(0);
    expect(firstRss?.url).toBe("https://example.com/news/rates?ref=home");
    expect(firstRss?.fetchedAt).toBe(fetchedAt);
    expect(secondRss?.entities).toContain("commodity_wti");
    expect(firstAtom?.url).toBe("https://example.org/fx/usdkrw");
  });

  it("dedup key prefers guid+source and falls back to canonical url", () => {
    const fetchedAt = "2026-03-04T10:00:00.000Z";

    const withGuidA = normalizeEntry(
      {
        title: "same",
        link: "https://example.com/a?utm_source=abc",
        guid: "GUID-001",
      },
      "same-source",
      fetchedAt,
    );

    const withGuidB = normalizeEntry(
      {
        title: "same-other-url",
        link: "https://example.com/b?utm_source=def",
        guid: "guid-001",
      },
      "same-source",
      fetchedAt,
    );

    const noGuidA = normalizeEntry(
      {
        title: "url dedup",
        link: "https://example.com/x?utm_source=a&fbclid=1&k=1",
      },
      "noguid-source",
      fetchedAt,
    );

    const noGuidB = normalizeEntry(
      {
        title: "url dedup 2",
        link: "https://example.com/x?k=1#section",
      },
      "noguid-source",
      fetchedAt,
    );

    const fallbackA = normalizeEntry(
      {
        title: "Fallback Id Candidate",
        publishedAt: "Wed, 04 Mar 2026 09:00:00 GMT",
      },
      "fallback-source",
      fetchedAt,
    );

    const fallbackB = normalizeEntry(
      {
        title: "fallback    id candidate",
        publishedAt: "2026-03-04T11:10:00+09:00",
      },
      "fallback-source",
      fetchedAt,
    );

    const crossSourceSameUrlA = normalizeEntry(
      {
        title: "same url a",
        link: "https://example.com/shared?id=1",
      },
      "source-a",
      fetchedAt,
    );
    const crossSourceSameUrlB = normalizeEntry(
      {
        title: "same url b",
        link: "https://example.com/shared?id=1",
      },
      "source-b",
      fetchedAt,
    );

    expect(withGuidA?.id).toBe(withGuidB?.id);
    expect(noGuidA?.id).toBe(noGuidB?.id);
    expect(fallbackA?.id).toBe(fallbackB?.id);
    expect(fallbackA?.url.startsWith("urn:news:fallback-source:")).toBe(true);
    expect(crossSourceSameUrlA?.id).not.toBe(crossSourceSameUrlB?.id);
    expect(canonicalizeUrl("https://example.com/x?utm_medium=a&k=2#h")).toBe("https://example.com/x?k=2");
  });
});
