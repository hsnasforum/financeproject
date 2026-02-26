import { describe, expect, it } from "vitest";
import { parseSubscriptionFilters } from "../src/lib/schemas/subscriptionFilters";

const FIXED_NOW = new Date("2026-02-25T12:00:00.000Z");

describe("subscription filters schema", () => {
  it("parses valid parameters", () => {
    const parsed = parseSubscriptionFilters(
      new URLSearchParams("region=서울&from=2026-01-01&to=2026-02-01&q=강남&houseType=urbty&mode=search&scan=deep"),
      { now: FIXED_NOW },
    );

    expect(parsed.ok).toBe(true);
    expect(parsed.value).toEqual({
      region: "서울",
      from: "2026-01-01",
      to: "2026-02-01",
      q: "강남",
      houseType: "urbty",
      mode: "search",
      deep: true,
    });
  });

  it("uses defaults and swaps reversed range", () => {
    const parsed = parseSubscriptionFilters(
      new URLSearchParams("from=2026-02-20&to=2026-01-15"),
      { now: FIXED_NOW },
    );

    expect(parsed.value.region).toBe("전국");
    expect(parsed.value.from).toBe("2026-01-15");
    expect(parsed.value.to).toBe("2026-02-20");
  });

  it("returns issues for invalid date format", () => {
    const parsed = parseSubscriptionFilters(
      new URLSearchParams("from=20260201&to=2026-02-31"),
      { now: FIXED_NOW },
    );

    expect(parsed.ok).toBe(false);
    expect(parsed.issues.some((entry) => entry.path === "from")).toBe(true);
    expect(parsed.issues.some((entry) => entry.path === "to")).toBe(true);
    expect(parsed.value.from).toBe("2025-11-27");
    expect(parsed.value.to).toBe("2026-02-25");
  });
});
