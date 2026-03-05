import { describe, expect, it } from "vitest";
import { NEWS_SOURCES } from "./sources";

describe("planning v3 news sources ssot", () => {
  it("contains official rss sources with valid metadata", () => {
    expect(NEWS_SOURCES.length).toBeGreaterThanOrEqual(8);
    expect(NEWS_SOURCES.every((row) => row.feedUrl.length > 0)).toBe(true);
    expect(NEWS_SOURCES.every((row) => Number.isFinite(row.weight))).toBe(true);
    expect(NEWS_SOURCES.every((row) => row.country.length >= 2)).toBe(true);
    expect(NEWS_SOURCES.every((row) => row.language.length >= 2)).toBe(true);
  });

  it("keeps KR public sources enabled and global feeds disabled by default", () => {
    const enabledIds = NEWS_SOURCES.filter((row) => row.enabled).map((row) => row.id);
    expect(enabledIds).toEqual([
      "bok_press_all",
      "bok_mpc_decisions",
      "kosis_monthly_trend",
      "kostat_press",
      "moef_econ_policy_en",
    ]);

    const disabledIds = NEWS_SOURCES.filter((row) => !row.enabled).map((row) => row.id);
    expect(disabledIds).toEqual(["fed_press_all", "bis_press", "ecb_press"]);
  });
});
