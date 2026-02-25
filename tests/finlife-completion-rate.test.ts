import { describe, expect, it } from "vitest";
import { __test__ as syncTest } from "../src/lib/finlife/syncRunner";

describe("finlife completion rate by group pages", () => {
  it("returns completion 1 when every group reached maxPage", () => {
    const result = syncTest.computeCompletion({
      groups: ["020000", "030000"],
      pagesFetchedByGroup: { "020000": 3, "030000": 5 },
      maxPageByGroup: { "020000": 3, "030000": 5 },
      lastHasNextByGroup: { "020000": false, "030000": false },
      hardCapPages: 200,
    });

    expect(result.truncatedByHardCap).toBe(false);
    expect(result.completionRate).toBeCloseTo(1, 6);
  });

  it("flags truncated when a group is cut by hard cap", () => {
    const result = syncTest.computeCompletion({
      groups: ["020000", "030000"],
      pagesFetchedByGroup: { "020000": 200, "030000": 10 },
      maxPageByGroup: { "020000": 400, "030000": 10 },
      lastHasNextByGroup: { "020000": true, "030000": false },
      hardCapPages: 200,
    });

    expect(result.truncatedByHardCap).toBe(true);
    expect(result.completionRate).toBeCloseTo(0.5, 6);
    expect(result.completionRate).toBeLessThan(0.95);
  });

  it("uses conservative 0.9 when maxPage is missing and hard cap reached with hasNext=true", () => {
    const result = syncTest.computeCompletion({
      groups: ["020000"],
      pagesFetchedByGroup: { "020000": 200 },
      maxPageByGroup: { "020000": null },
      lastHasNextByGroup: { "020000": true },
      hardCapPages: 200,
    });

    expect(result.truncatedByHardCap).toBe(true);
    expect(result.completionRate).toBeCloseTo(0.9, 6);
    expect(result.completionRate).toBeLessThan(0.95);
  });

  it("treats group as complete when maxPage is missing and hasNext=false", () => {
    const result = syncTest.computeCompletion({
      groups: ["020000"],
      pagesFetchedByGroup: { "020000": 200 },
      maxPageByGroup: { "020000": null },
      lastHasNextByGroup: { "020000": false },
      hardCapPages: 200,
    });

    expect(result.truncatedByHardCap).toBe(false);
    expect(result.completionRate).toBeCloseTo(1, 6);
  });
});
