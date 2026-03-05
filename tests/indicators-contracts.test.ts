import { describe, expect, it } from "vitest";
import {
  parseIndicatorSeriesFile,
  parseIndicatorSource,
  parseObservation,
  parseSeriesSpec,
} from "../src/lib/indicators/contracts";

describe("indicators contracts", () => {
  it("parses valid source/spec/observation", () => {
    const source = parseIndicatorSource({
      id: "ecos",
      name: "BOK ECOS",
      type: "ecos",
      enabled: true,
    });
    const spec = parseSeriesSpec({
      id: "kr_base_rate",
      sourceId: "ecos",
      externalId: "722Y001|0101000|||M|202001|209912",
      name: "기준금리",
      frequency: "M",
      transform: "none",
    });
    const obs = parseObservation({ date: "2026-03-01", value: 3.5 });

    expect(source.type).toBe("ecos");
    expect(spec.frequency).toBe("M");
    expect(obs.value).toBe(3.5);
  });

  it("rejects invalid enum values", () => {
    expect(() => parseIndicatorSource({
      id: "x",
      name: "x",
      type: "unknown",
      enabled: true,
    })).toThrow();

    expect(() => parseSeriesSpec({
      id: "x",
      sourceId: "ecos",
      externalId: "x",
      name: "x",
      frequency: "M",
      transform: "invalid",
    })).toThrow();
  });

  it("parses series file shape", () => {
    const parsed = parseIndicatorSeriesFile({
      version: 1,
      series: [
        {
          id: "kr_base_rate",
          sourceId: "ecos",
          externalId: "722Y001|0101000|||M|202001|209912",
          name: "기준금리",
          frequency: "M",
        },
      ],
    });
    expect(parsed.version).toBe(1);
    expect(parsed.series[0]?.id).toBe("kr_base_rate");
  });
});
