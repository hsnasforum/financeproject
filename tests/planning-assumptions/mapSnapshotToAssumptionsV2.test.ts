import { describe, expect, it } from "vitest";
import { mapSnapshotToAssumptionsV2, mapSnapshotToScenarioExtrasV2 } from "../../src/lib/planning/assumptions/mapSnapshotToAssumptionsV2";

const baseSnapshot = {
  version: 1 as const,
  asOf: "2026-02-28",
  fetchedAt: "2026-02-28T00:00:00.000Z",
  korea: {},
  sources: [],
  warnings: [],
};

describe("mapSnapshotToAssumptionsV2", () => {
  it("maps inflation and does not auto-map invest return", () => {
    const mapped = mapSnapshotToAssumptionsV2({
      ...baseSnapshot,
      korea: {
        cpiYoYPct: 2.1,
        newDepositAvgPct: 2.8,
      },
    });

    expect(mapped).toEqual({
      inflation: 2.1,
    });
  });
});

describe("mapSnapshotToScenarioExtrasV2", () => {
  it("uses deposit average for cash return when available", () => {
    const mapped = mapSnapshotToScenarioExtrasV2({
      ...baseSnapshot,
      korea: {
        newDepositAvgPct: 2.78,
        cd91Pct: 3.5,
      },
    });

    expect(mapped.extra.cashReturnPct).toBe(2.78);
    expect(mapped.warnings).toEqual([]);
  });

  it("uses conservative CD proxy when deposit average is missing", () => {
    const mapped = mapSnapshotToScenarioExtrasV2({
      ...baseSnapshot,
      korea: {
        cd91Pct: 3.2,
      },
    });

    expect(mapped.extra.cashReturnPct).toBe(2.7);
    expect(mapped.warnings.map((warning) => warning.code)).toContain("CASH_RETURN_PROXY_FROM_CD");
  });
});
