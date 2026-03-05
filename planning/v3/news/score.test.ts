import { describe, expect, it } from "vitest";
import { FIXTURE_ITEMS, FIXTURE_NOW_ISO } from "./fixtures/sample-items";
import { scoreItems } from "./score";

describe("planning v3 news score", () => {
  it("is deterministic and stable for same input", () => {
    const now = new Date(FIXTURE_NOW_ISO);
    const first = scoreItems(FIXTURE_ITEMS, { now });
    const second = scoreItems(FIXTURE_ITEMS, { now });

    expect(first).toStrictEqual(second);
    expect(first.map((item) => item.id)).toEqual([
      "i-fx-1",
      "i-rates-1",
      "i-rates-2",
      "i-policy-1",
      "i-old-1",
    ]);

    const top = first[0]!;
    expect(top.scoreParts.sourceWeight).toBeGreaterThan(0);
    expect(top.scoreParts.burstPlaceholder).toBe(0);
    expect(top.totalScore).toBeGreaterThanOrEqual(first[1]!.totalScore);

    const rates = first.find((row) => row.id === "i-rates-1");
    const fx = first.find((row) => row.id === "i-fx-1");
    expect(rates?.entities).toContain("central_bank_fed");
    expect(fx?.entities).toContain("currency_usdkrw");
    expect(rates?.eventTypes).toContain("policy_rate_signal");
    expect(fx?.eventTypes).toContain("fx_volatility");
  });
});
