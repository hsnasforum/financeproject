import { describe, expect, it } from "vitest";
import { type NewsItem } from "../contracts";
import { clusterByTitle } from "./clusterByTitle";
import { scoreItems } from "./score";
import { selectTopFromItems } from "./selectTop";

const NOW = new Date("2026-03-04T12:00:00.000Z");

const ITEMS: NewsItem[] = [
  {
    id: "a-2",
    sourceId: "src-a",
    title: "Alpha headline",
    url: "https://example.com/a2",
    publishedAt: "2026-03-04T08:00:00.000Z",
    snippet: "neutral text",
    fetchedAt: NOW.toISOString(),
  },
  {
    id: "a-1",
    sourceId: "src-a",
    title: "Alpha headline",
    url: "https://example.com/a1",
    publishedAt: "2026-03-04T08:00:00.000Z",
    snippet: "neutral text",
    fetchedAt: NOW.toISOString(),
  },
  {
    id: "b-1",
    sourceId: "src-a",
    title: "Beta headline",
    url: "https://example.com/b1",
    publishedAt: "2026-03-04T08:00:00.000Z",
    snippet: "neutral text",
    fetchedAt: NOW.toISOString(),
  },
  {
    id: "rates-1",
    sourceId: "src-r",
    title: "Rate hike outlook remains firm",
    url: "https://example.com/r1",
    publishedAt: "2026-03-04T10:00:00.000Z",
    snippet: "rate hike signals continue",
    fetchedAt: NOW.toISOString(),
  },
  {
    id: "rates-2",
    sourceId: "src-r",
    title: "Rate hike outlook remains firm as inflation cools",
    url: "https://example.com/r2",
    publishedAt: "2026-03-04T09:00:00.000Z",
    snippet: "rate hike signals continue",
    fetchedAt: NOW.toISOString(),
  },
];

describe("planning v3 news deterministic select pipeline", () => {
  it("keeps deterministic ordering with fixed tie-break chain", () => {
    const scored = scoreItems(ITEMS, {
      now: NOW,
      sourceWeights: {
        "src-a": 1,
        "src-r": 1.2,
      },
    });

    const alpha = scored.filter((row) => row.title === "Alpha headline");
    expect(alpha.map((row) => row.id)).toEqual(["a-1", "a-2"]);
  });

  it("clusters by title jaccard >= 0.6 and picks highest-score representative", () => {
    const scored = scoreItems(ITEMS, {
      now: NOW,
      sourceWeights: {
        "src-a": 1,
        "src-r": 1.2,
      },
    });
    const clusters = clusterByTitle(scored);
    const ratesCluster = clusters.find((row) => row.items.some((item) => item.id === "rates-1"));
    expect(ratesCluster).toBeTruthy();
    expect(ratesCluster?.items.map((item) => item.id)).toContain("rates-2");
    expect(ratesCluster?.representative.id).toBe("rates-1");
  });

  it("returns deterministic topItems/clusters/topTopics for same input", () => {
    const first = selectTopFromItems(ITEMS, {
      now: NOW,
      windowHours: 72,
      topN: 5,
      topM: 3,
      sourceWeights: {
        "src-a": 1,
        "src-r": 1.2,
      },
    });
    const second = selectTopFromItems(ITEMS, {
      now: NOW,
      windowHours: 72,
      topN: 5,
      topM: 3,
      sourceWeights: {
        "src-a": 1,
        "src-r": 1.2,
      },
    });
    expect(first).toStrictEqual(second);
    expect(first.clusters.length).toBeGreaterThan(0);
    expect(first.topItems.length).toBeGreaterThan(0);
    expect(first.topTopics.length).toBeGreaterThan(0);
  });
});
