import { describe, expect, it } from "vitest";
import { getOptionRates } from "../src/lib/finlife/optionView";
import { type NormalizedOption } from "../src/lib/finlife/types";

function option(partial: Partial<NormalizedOption>): NormalizedOption {
  return {
    raw: {},
    ...partial,
  };
}

describe("finlife option bonus", () => {
  it("computes bonus from base/best rates", () => {
    const rates = getOptionRates(option({ intr_rate: 2.95, intr_rate2: 3.25 }));
    expect(rates.base).toBe(2.95);
    expect(rates.best).toBe(3.25);
    expect(rates.bonus).toBeCloseTo(0.3, 6);
  });

  it("guards against missing values and negative bonus", () => {
    expect(getOptionRates(option({ intr_rate: 2.95 })).bonus).toBe(0);
    expect(getOptionRates(option({ intr_rate2: 3.25 })).bonus).toBe(0);
    expect(getOptionRates(option({ intr_rate: 3.25, intr_rate2: 2.95 })).bonus).toBe(0);
  });
});
