import { describe, expect, it } from "vitest";
import { resolveEvidenceSeriesIds } from "./ssot";

describe("planning v3 news evidence graph", () => {
  it("resolves deterministic series ids from topic/entity/event inputs", () => {
    const seriesIds = resolveEvidenceSeriesIds({
      topics: ["rates", "fx"],
      entities: ["currency_usdkrw", "central_bank_fed"],
      eventTypes: ["fx_volatility", "policy_rate_signal"],
      maxSeriesIds: 8,
    });

    expect(seriesIds).toEqual([
      "kr_base_rate",
      "kr_gov_bond_3y",
      "kr_usdkrw",
      "kr_cab",
    ]);
  });

  it("falls back to general mapping when no valid signals exist", () => {
    const seriesIds = resolveEvidenceSeriesIds({
      topics: ["unknown-topic"],
      entities: ["unknown_entity"],
      eventTypes: ["unknown_event"],
      maxSeriesIds: 4,
    });

    expect(seriesIds).toEqual([
      "kr_base_rate",
      "kr_usdkrw",
    ]);
  });
});
