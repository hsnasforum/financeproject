import { describe, expect, it } from "vitest";
import { normalizeEximExchange } from "../src/lib/publicApis/providers/exchange";

describe("exim exchange normalize", () => {
  it("normalizes exim rows into KRW base rates", () => {
    const parsed = normalizeEximExchange([
      { cur_unit: "USD", deal_bas_r: "1,330.50", deal_bas_dt: "2026-02-19" },
      { cur_unit: "JPY", deal_bas_r: "9.12", deal_bas_dt: "2026-02-19" },
    ]);

    expect(parsed).not.toBeNull();
    if (!parsed) return;
    expect(parsed.base).toBe("KRW");
    expect(parsed.asOf).toBe("2026-02-19");
    expect(parsed.rates.USD).toBe(1330.5);
    expect(parsed.rates.JPY).toBe(9.12);
  });
});
