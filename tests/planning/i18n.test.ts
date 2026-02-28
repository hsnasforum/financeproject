import { describe, expect, it } from "vitest";
import { formatDate, formatKrw, formatPct } from "../../src/lib/planning/i18n/format";
import { resolvePlanningLocale, t } from "../../src/lib/planning/i18n";

describe("planning i18n", () => {
  it("resolves locale from query/env with ko default", () => {
    expect(resolvePlanningLocale("en", "ko-KR")).toBe("en-US");
    expect(resolvePlanningLocale(undefined, "en-US")).toBe("en-US");
    expect(resolvePlanningLocale(undefined, undefined)).toBe("ko-KR");
  });

  it("translates message keys and interpolates vars", () => {
    expect(t("ko-KR", "SNAPSHOT_MISSING")).toContain("스냅샷");
    expect(t("en-US", "SNAPSHOT_MISSING")).toContain("snapshot");
    expect(t("ko-KR", "I18N_SAMPLE_VAR", { name: "테스트" })).toBe("샘플 테스트");
    expect(t("en-US", "I18N_SAMPLE_VAR", { name: "Test" })).toBe("Sample Test");
    expect(t("ko-KR", "UNKNOWN_MESSAGE_KEY")).toBe("UNKNOWN_MESSAGE_KEY");
  });

  it("formats krw/percent/date with locale-aware output", () => {
    expect(formatKrw("ko-KR", 1_234_567)).toContain("1,234,567");
    expect(formatKrw("en-US", 1_234_567)).toContain("1,234,567");
    expect(formatPct("ko-KR", 2.35)).toBe("2.4%");
    expect(formatPct("en-US", 2.35)).toBe("2.4%");
    expect(formatDate("ko-KR", "2026-02-28T00:00:00.000Z")).toContain("2026");
    expect(formatDate("en-US", "2026-02-28T00:00:00.000Z")).toContain("2026");
    expect(formatDate("ko-KR", "not-a-date")).toBe("-");
  });
});
