import { describe, expect, it } from "vitest";
import { normalizeEximExchange } from "../src/lib/publicApis/providers/exchange";
import {
  normalizeExchangeCurrencyUnit,
  normalizeExchangeQuoteDate,
} from "../src/lib/publicApis/providers/exchangeNormalization";

describe("exim exchange normalize", () => {
  it("parses generic currency batch units without currency-specific branches", () => {
    expect(normalizeExchangeCurrencyUnit("USD")).toEqual({ code: "USD", scale: 1 });
    expect(normalizeExchangeCurrencyUnit("JPY(100)")).toEqual({ code: "JPY", scale: 100 });
    expect(normalizeExchangeCurrencyUnit("IDR(1000)")).toEqual({ code: "IDR", scale: 1000 });
    expect(normalizeExchangeCurrencyUnit("  abc ( 100 )  ")).toEqual({ code: "ABC", scale: 100 });
    expect(normalizeExchangeCurrencyUnit("ABC(9007199254740991)")).toEqual({
      code: "ABC",
      scale: Number.MAX_SAFE_INTEGER,
    });
  });

  it.each([
    "JPY(0)",
    "ABC(-100)",
    "ABC(1.5)",
    "JPY(9007199254740992)",
    "JPY(999999999999999999999999999999999999999999)",
    "JPY(foo)",
    "JPY()",
    "JPY(100",
    "JPY100)",
    "JPYX",
    "",
  ])("rejects an invalid or malformed currency unit: %s", (unit) => {
    expect(normalizeExchangeCurrencyUnit(unit)).toBeNull();
  });

  it("canonicalizes only real EXIM calendar dates", () => {
    expect(normalizeExchangeQuoteDate("20260901")).toBe("2026-09-01");
    expect(normalizeExchangeQuoteDate(" 2026-09-01 ")).toBe("2026-09-01");
    expect(normalizeExchangeQuoteDate("20260229")).toBeNull();
    expect(normalizeExchangeQuoteDate("2026-04-31")).toBeNull();
    expect(normalizeExchangeQuoteDate("2026/09/01")).toBeNull();
    expect(normalizeExchangeQuoteDate(20260901)).toBeNull();
  });

  it("normalizes exim rows into KRW base rates", () => {
    const parsed = normalizeEximExchange([
      { cur_unit: "USD", deal_bas_r: "1,330.50", deal_bas_dt: "2026-02-19" },
      { cur_unit: "JPY(100)", deal_bas_r: "912.00", deal_bas_dt: "2026-02-19" },
      { cur_unit: "IDR(1000)", deal_bas_r: "85.00", deal_bas_dt: "2026-02-19" },
      { cur_unit: "ABC (100)", deal_bas_r: "500.00", deal_bas_dt: "2026-02-19" },
    ]);

    expect(parsed).not.toBeNull();
    if (!parsed) return;
    expect(parsed.base).toBe("KRW");
    expect(parsed.asOf).toBe("2026-02-19");
    expect(parsed.rates.USD).toBe(1330.5);
    expect(parsed.rates.JPY).toBe(9.12);
    expect(parsed.rates.IDR).toBe(0.085);
    expect(parsed.rates.ABC).toBe(5);
  });

  it("fails closed when EXIM rows do not carry a valid quote date", () => {
    expect(normalizeEximExchange([
      { cur_unit: "USD", deal_bas_r: "1,330.50", deal_bas_dt: "2026-02-30" },
    ])).toBeNull();
    expect(normalizeEximExchange([
      { cur_unit: "USD", deal_bas_r: "1,330.50" },
    ])).toBeNull();
  });
});
