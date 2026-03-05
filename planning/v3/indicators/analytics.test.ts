import { describe, expect, it } from "vitest";
import { pctChange, regime, trendSlope, zscore } from "./analytics";
import type { Observation } from "./contracts";

const SAMPLE: Observation[] = [
  { date: "2026-01", value: 100 },
  { date: "2026-02", value: 102 },
  { date: "2026-03", value: 104 },
  { date: "2026-04", value: 106 },
  { date: "2026-05", value: 108 },
];

describe("planning v3 indicators analytics", () => {
  it("returns deterministic outputs for stable input", () => {
    const a = pctChange(SAMPLE, 3);
    const b = pctChange(SAMPLE, 3);
    expect(a).toBe(b);
    expect(a).toBeCloseTo(5.8823529412, 8);

    const z1 = zscore(SAMPLE, 3);
    const z2 = zscore(SAMPLE, 3);
    expect(z1).toBe(z2);
    expect(z1).toBeCloseTo(1.2247448713, 8);

    const slope1 = trendSlope(SAMPLE, 3);
    const slope2 = trendSlope(SAMPLE, 3);
    expect(slope1).toBe(slope2);
    expect(slope1).toBeCloseTo(2, 8);

    expect(regime(SAMPLE, 3)).toBe("up");
  });

  it("handles flat/down regimes", () => {
    const flat: Observation[] = [
      { date: "2026-01", value: 100 },
      { date: "2026-02", value: 100 },
      { date: "2026-03", value: 100 },
    ];

    const down: Observation[] = [
      { date: "2026-01", value: 110 },
      { date: "2026-02", value: 105 },
      { date: "2026-03", value: 100 },
    ];

    expect(regime(flat, 2)).toBe("flat");
    expect(regime(down, 2)).toBe("down");
  });

  it("returns unknown/null for edge cases without throwing", () => {
    const empty: Observation[] = [];
    const onePoint: Observation[] = [{ date: "2026-01", value: 100 }];
    const withZeroBaseline: Observation[] = [
      { date: "2026-01", value: 0 },
      { date: "2026-02", value: 10 },
    ];

    expect(() => pctChange(empty, 3)).not.toThrow();
    expect(() => zscore(empty, 3)).not.toThrow();
    expect(() => trendSlope(empty, 3)).not.toThrow();
    expect(() => regime(empty, 3)).not.toThrow();

    expect(pctChange(empty, 3)).toBeNull();
    expect(zscore(empty, 3)).toBeNull();
    expect(trendSlope(empty, 3)).toBeNull();
    expect(regime(empty, 3)).toBe("unknown");

    expect(pctChange(onePoint, 1)).toBeNull();
    expect(zscore(onePoint, 2)).toBeNull();
    expect(trendSlope(onePoint, 2)).toBeNull();
    expect(regime(onePoint, 2)).toBe("unknown");

    expect(pctChange(withZeroBaseline, 1)).toBeNull();
    expect(regime(withZeroBaseline, 1)).toBe("unknown");
  });
});
