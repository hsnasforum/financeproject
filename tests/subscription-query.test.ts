import { describe, expect, it } from "vitest";
import { parseSubscriptionInit } from "../src/lib/publicApis/subscriptionQuery";

const FIXED_NOW = new Date("2026-02-25T12:00:00.000Z");

describe("parseSubscriptionInit", () => {
  it("parses valid full query parameters", () => {
    const parsed = parseSubscriptionInit(
      new URLSearchParams("region=서울&from=2026-01-01&to=2026-02-01&q=강남&houseType=urbty&mode=search"),
      { now: FIXED_NOW },
    );
    expect(parsed).toEqual({
      region: "서울",
      from: "2026-01-01",
      to: "2026-02-01",
      q: "강남",
      houseType: "urbty",
      mode: "search",
    });
  });

  it("uses defaults when params are missing", () => {
    const parsed = parseSubscriptionInit(undefined, { now: FIXED_NOW });
    expect(parsed.region).toBe("전국");
    expect(parsed.from).toBe("2025-11-27");
    expect(parsed.to).toBe("2026-02-25");
    expect(parsed.q).toBe("");
    expect(parsed.houseType).toBe("apt");
    expect(parsed.mode).toBe("all");
  });

  it("sanitizes invalid dates", () => {
    const parsed = parseSubscriptionInit(
      new URLSearchParams("from=20260201&to=2026-02-31"),
      { now: FIXED_NOW },
    );
    expect(parsed.from).toBe("2025-11-27");
    expect(parsed.to).toBe("2026-02-25");
  });

  it("swaps from/to when the range is reversed", () => {
    const parsed = parseSubscriptionInit(
      new URLSearchParams("from=2026-02-20&to=2026-01-15"),
      { now: FIXED_NOW },
    );
    expect(parsed.from).toBe("2026-01-15");
    expect(parsed.to).toBe("2026-02-20");
  });

  it("falls back to apt for invalid houseType", () => {
    const parsed = parseSubscriptionInit(new URLSearchParams("houseType=invalid"), { now: FIXED_NOW });
    expect(parsed.houseType).toBe("apt");
  });

  it("accepts alias type query for houseType", () => {
    const parsed = parseSubscriptionInit(new URLSearchParams("type=remndr"), { now: FIXED_NOW });
    expect(parsed.houseType).toBe("remndr");
  });

  it("falls back to all for invalid mode", () => {
    const parsed = parseSubscriptionInit(new URLSearchParams("mode=deep"), { now: FIXED_NOW });
    expect(parsed.mode).toBe("all");
  });

  it("supports object-style searchParams from page props", () => {
    const parsed = parseSubscriptionInit(
      {
        region: "경기",
        from: "2026-01-05",
        to: "2026-01-31",
        q: "분양",
        houseType: "apt",
        mode: "all",
      },
      { now: FIXED_NOW },
    );
    expect(parsed.region).toBe("경기");
    expect(parsed.from).toBe("2026-01-05");
    expect(parsed.to).toBe("2026-01-31");
    expect(parsed.q).toBe("분양");
    expect(parsed.houseType).toBe("apt");
    expect(parsed.mode).toBe("all");
  });
});
