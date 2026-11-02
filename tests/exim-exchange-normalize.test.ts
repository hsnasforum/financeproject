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

  it("attributes undated official AP01 rows only to the explicit request date", () => {
    const parsed = normalizeEximExchange([
      { result: 1, cur_unit: "USD", deal_bas_r: "1,330.50", cur_nm: "미국 달러" },
      { result: 1, cur_unit: "JPY(100)", deal_bas_r: "912.00", cur_nm: "일본 엔" },
      { result: 1, cur_unit: "KRW", deal_bas_r: "1", cur_nm: "한국 원" },
    ], "https://example.test/exchangeJSON", { requestedDate: "20261008" });

    expect(parsed).toEqual({
      asOf: "2026-10-08",
      base: "KRW",
      rates: { USD: 1330.5, JPY: 9.12, KRW: 1 },
      rawMeta: { source: "EXIM", baseUrl: "https://example.test/exchangeJSON" },
    });
  });

  it("keeps dated legacy aliases compatible without request context", () => {
    expect(normalizeEximExchange({ response: { list: [
      { currency: "USD", baseRate: "1,330.50", asOf: "20261008" },
      { curUnit: "JPY(100)", dealBasR: 912, dealBasDt: "2026-10-08" },
    ] } })?.rates).toEqual({ USD: 1330.5, JPY: 9.12 });
  });

  it("accepts an explicit response date only when it matches the requested date", () => {
    const rows = [{ result: "1", cur_unit: "USD", deal_bas_r: "1,330.50", deal_bas_dt: "2026-10-08" }];
    expect(normalizeEximExchange(rows, "", { requestedDate: "20261008" })?.asOf).toBe("2026-10-08");
    expect(normalizeEximExchange(rows, "", { requestedDate: "20261007" })).toBeNull();
  });

  it.each(["", "20260229", "2026-04-31", "20261301", "20261008junk"])(
    "rejects invalid request context rather than trusting row dates: %s",
    (requestedDate) => {
      expect(normalizeEximExchange([
        { result: 1, cur_unit: "USD", deal_bas_r: "1,330.50", deal_bas_dt: "2026-10-08" },
      ], "", { requestedDate })).toBeNull();
    },
  );

  it.each([undefined, 2, 3, 4, "2", "0", null])("requires result 1 for requested-date rows: %s", (result) => {
    expect(normalizeEximExchange([
      { result, cur_unit: "USD", deal_bas_r: "1,330.50", deal_bas_dt: "2026-10-08" },
    ], "", { requestedDate: "20261008" })).toBeNull();
  });

  it("rejects a non-success result even for dated legacy rows", () => {
    expect(normalizeEximExchange([
      { result: 3, cur_unit: "USD", deal_bas_r: "1,330.50", deal_bas_dt: "2026-10-08" },
    ])).toBeNull();
  });

  it.each([0, -1, NaN, Infinity, "", "1,23.50", "1abc", "1,330.50 KRW", "-1"])(
    "rejects the entire batch when one rate is invalid: %s",
    (deal_bas_r) => {
      expect(normalizeEximExchange([
        { cur_unit: "USD", deal_bas_r: "1,330.50", deal_bas_dt: "2026-10-08" },
        { cur_unit: "EUR", deal_bas_r, deal_bas_dt: "2026-10-08" },
      ])).toBeNull();
    },
  );

  it("rejects a duplicate currency after unit normalization", () => {
    expect(normalizeEximExchange([
      { cur_unit: "JPY(100)", deal_bas_r: "912", deal_bas_dt: "2026-10-08" },
      { cur_unit: "JPY", deal_bas_r: "9.12", deal_bas_dt: "2026-10-08" },
    ])).toBeNull();
  });

  it("rejects conflicting source dates instead of using the first row date", () => {
    expect(normalizeEximExchange([
      { cur_unit: "USD", deal_bas_r: "1,330.50", deal_bas_dt: "2026-10-08" },
      { cur_unit: "JPY(100)", deal_bas_r: "912", deal_bas_dt: "2026-10-07" },
    ])).toBeNull();
  });

  it("rejects partially missing dates rather than dropping rows", () => {
    expect(normalizeEximExchange([
      { cur_unit: "USD", deal_bas_r: "1,330.50", deal_bas_dt: "2026-10-08" },
      { cur_unit: "JPY(100)", deal_bas_r: "912" },
    ])).toBeNull();
  });

  it("rejects mixed dated and undated response rows even with request context", () => {
    expect(normalizeEximExchange([
      { result: 1, cur_unit: "USD", deal_bas_r: "1,330.50", deal_bas_dt: "2026-10-08" },
      { result: 1, cur_unit: "JPY(100)", deal_bas_r: "912" },
    ], "", { requestedDate: "20261008" })).toBeNull();
  });

  it("rejects malformed rows instead of producing a partial batch", () => {
    expect(normalizeEximExchange([
      { cur_unit: "USD", deal_bas_r: "1,330.50", deal_bas_dt: "2026-10-08" },
      { cur_unit: "JPY(0)", deal_bas_r: "912", deal_bas_dt: "2026-10-08" },
    ])).toBeNull();
  });

  it.each(["tts", "ttb", "rate", "baseRate", "dealBasR", "kftcDealBasR"])(
    "does not substitute %s for the official AP01 deal_bas_r field",
    (alias) => {
      expect(normalizeEximExchange([
        { result: 1, cur_unit: "USD", [alias]: "1,330.50" },
      ], "", { requestedDate: "20261008" })).toBeNull();
    },
  );

  it.each(["currency", "curUnit"])("requires official cur_unit instead of %s in request context", (alias) => {
    expect(normalizeEximExchange([
      { result: 1, [alias]: "USD", deal_bas_r: "1,330.50" },
    ], "", { requestedDate: "20261008" })).toBeNull();
  });
});
