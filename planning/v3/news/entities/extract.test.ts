import { describe, expect, it } from "vitest";
import { buildTopicEntityMap, extractEntities, normalizeEntityIds } from "./extract";

describe("planning v3 news entities extract", () => {
  it("extracts deterministic normalized entity ids from title/snippet", () => {
    const entities = extractEntities({
      title: "Fed signals shift while USD/KRW climbs",
      snippet: "Federal Reserve comments and WTI moves were highlighted.",
    });

    expect(entities).toEqual([
      "central_bank_fed",
      "currency_usdkrw",
      "commodity_wti",
    ]);
  });

  it("normalizes mixed aliases into canonical entity ids", () => {
    const entities = normalizeEntityIds([
      "FED",
      "currency_usdkrw",
      "usd/krw",
      "unknown-entity",
      "central_bank_fed",
    ]);

    expect(entities).toEqual([
      "central_bank_fed",
      "currency_usdkrw",
    ]);
  });

  it("maps normalized entities to topic hints", () => {
    const mapped = buildTopicEntityMap([
      "fed",
      "usdkrw",
      "opec plus",
      "unknown",
    ]);

    expect(mapped).toEqual({
      rates: ["central_bank_fed"],
      fx: ["currency_usdkrw"],
      commodities: ["cartel_opec_plus"],
    });
  });
});
