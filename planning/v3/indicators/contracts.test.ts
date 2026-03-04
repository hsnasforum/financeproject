import { describe, expect, it } from "vitest";
import {
  IndicatorSourceSchema,
  ObservationSchema,
  RefreshErrorSchema,
  SeriesSnapshotSchema,
  SeriesSpecSchema,
} from "./contracts";

describe("planning v3 indicators contracts", () => {
  it("parses indicator source and series spec", () => {
    const source = IndicatorSourceSchema.parse({
      id: "fixture",
      name: "Fixture",
      type: "fixture",
      enabled: true,
    });

    const spec = SeriesSpecSchema.parse({
      id: "kr_cpi",
      sourceId: source.id,
      externalId: "fixture://kr_cpi",
      name: "Korea CPI",
      frequency: "M",
      transform: "pct_change",
      enabled: true,
    });

    expect(spec.id).toBe("kr_cpi");
    expect(spec.sourceId).toBe("fixture");
  });

  it("accepts valid observation dates and rejects invalid", () => {
    expect(ObservationSchema.parse({ date: "2026-03-04", value: 100.1 }).date).toBe("2026-03-04");
    expect(ObservationSchema.parse({ date: "2026-03", value: 100.1 }).date).toBe("2026-03");
    expect(ObservationSchema.parse({ date: "2026-Q1", value: 100.1 }).date).toBe("2026-Q1");

    expect(() => ObservationSchema.parse({ date: "2026/03/04", value: 100.1 })).toThrow();
  });

  it("parses series snapshot", () => {
    const parsed = SeriesSnapshotSchema.parse({
      seriesId: "kr_base_rate",
      asOf: "2026-03-04T00:00:00.000Z",
      observations: [
        { date: "2026-01", value: 3.25 },
        { date: "2026-02", value: 3.25 },
      ],
      meta: {
        sourceId: "fixture",
        externalId: "fixture://kr_base_rate",
        frequency: "M",
      },
    });

    expect(parsed.observations.length).toBe(2);
  });

  it("uses unified connector error codes", () => {
    expect(RefreshErrorSchema.parse({
      sourceId: "fixture",
      seriesId: "kr_cpi",
      code: "FETCH",
      message: "fixture_not_found",
    }).code).toBe("FETCH");

    expect(() => RefreshErrorSchema.parse({
      sourceId: "fixture",
      code: "UNKNOWN",
      message: "x",
    })).toThrow();
  });
});
