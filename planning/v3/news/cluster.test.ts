import { describe, expect, it } from "vitest";
import { FIXTURE_ITEMS, FIXTURE_NOW_ISO } from "./fixtures/sample-items";
import { clusterItems } from "./cluster";
import { scoreItems } from "./score";

describe("planning v3 news cluster", () => {
  it("groups similar titles by Jaccard token overlap", () => {
    const scored = scoreItems(FIXTURE_ITEMS, { now: new Date(FIXTURE_NOW_ISO) });
    const clusters = clusterItems(scored);

    const ratesCluster = clusters.find((cluster) => cluster.items.some((item) => item.id === "i-rates-1"));
    expect(ratesCluster).toBeTruthy();
    expect(ratesCluster?.items.map((item) => item.id)).toContain("i-rates-2");

    // Five items with one similar pair => four clusters.
    expect(clusters.length).toBe(4);
  });
});
