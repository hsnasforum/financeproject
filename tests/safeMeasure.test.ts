import { describe, expect, it, vi } from "vitest";
import { safeMark, safeMeasure } from "../src/lib/perf/safeMeasure";

describe("safeMeasure", () => {
  it("does not throw when performance APIs throw", () => {
    const mark = vi.fn(() => {
      throw new Error("mark failed");
    });
    const measure = vi.fn(() => {
      throw new Error("measure failed");
    });
    vi.stubGlobal("window", {} as Window & typeof globalThis);
    vi.stubGlobal("performance", {
      mark,
      measure,
      getEntriesByName: vi.fn(() => [{ startTime: 0 }]),
    });

    expect(() => safeMark("BenefitsPage:start")).not.toThrow();
    expect(() => safeMeasure("BenefitsPage", "BenefitsPage:start", "BenefitsPage:end")).not.toThrow();
  });

  it("skips measure when mark timestamps are inverted", () => {
    const measure = vi.fn();
    vi.stubGlobal("window", {} as Window & typeof globalThis);
    vi.stubGlobal("performance", {
      mark: vi.fn(),
      measure,
      getEntriesByName: vi.fn((name: string) => {
        if (name.includes("start")) return [{ startTime: 200 }];
        return [{ startTime: 100 }];
      }),
    });

    expect(() => safeMeasure("BenefitsPage", "BenefitsPage:start", "BenefitsPage:end")).not.toThrow();
    expect(measure).not.toHaveBeenCalled();
  });
});
