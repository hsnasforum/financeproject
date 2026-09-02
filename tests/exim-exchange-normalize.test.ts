import { describe, expect, it } from "vitest";
import { normalizeEximExchange } from "../src/lib/publicApis/providers/exchange";
import { normalizeExchangeCurrencyUnit } from "../src/lib/publicApis/providers/exchangeNormalization";

describe("exim exchange normalize", () => {
  it("parses generic currency batch units without currency-specific branches", () => {
    expect(normalizeExchangeCurrencyUnit("USD")).toEqual({ code: "USD", scale: 1 });
    expect(normalizeExchangeCurrencyUnit("JPY(100)")).toEqual({ code: "JPY", scale: 100 });
    expect(normalizeExchangeCurrencyUnit("IDR(1000)")).toEqual({ code: "IDR", scale: 1000 });
    expect(normalizeExchangeCurrencyUnit("abc (100)")).toEqual({ code: "ABC", scale: 100 });
  });

  it("normalizes exim rows into KRW base rates", () => {
    const parsed = normalizeEximExchange([
      { cur_unit: "USD", deal_bas_r: "1,330.50", deal_bas_dt: "2026-02-19" },
      { cur_unit: "JPY(100)", deal_bas_r: "912.00", deal_bas_dt: "2026-02-19" },
    ]);

    expect(parsed).not.toBeNull();
    if (!parsed) return;
    expect(parsed.base).toBe("KRW");
    expect(parsed.asOf).toBe("2026-02-19");
    expect(parsed.rates.USD).toBe(1330.5);
    expect(parsed.rates.JPY).toBe(9.12);
  });
});
