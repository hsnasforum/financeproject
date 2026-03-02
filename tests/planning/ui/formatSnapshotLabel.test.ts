import { describe, expect, it } from "vitest";
import { formatSnapshotLabel, getSnapshotFreshness } from "../../../src/app/planning/_lib/formatSnapshotLabel";

describe("formatSnapshotLabel", () => {
  it("includes policy rate and cpi when values exist", () => {
    const label = formatSnapshotLabel({
      id: "snap-1",
      asOf: "2026-01-31",
      staleDays: 12,
      korea: {
        policyRatePct: 2.5,
        cpiYoYPct: 2.0,
      },
    }, "latest");

    expect(label).toContain("LATEST");
    expect(label).toContain("기준금리 2.50%");
    expect(label).toContain("CPI 2.00%");
    expect(label).toContain("(stale 12d)");
  });

  it("returns stale badge thresholds for 45/120 day boundaries", () => {
    expect(getSnapshotFreshness(45)).toBe("ok");
    expect(getSnapshotFreshness(46)).toBe("caution");
    expect(getSnapshotFreshness(120)).toBe("caution");
    expect(getSnapshotFreshness(121)).toBe("risk");
  });
});
