import { describe, expect, it } from "vitest";
import { parseBenefitsQueryPreset, parseSubscriptionQueryPreset } from "../src/lib/planner/actionQuery";

describe("planner action deep-link query parsing", () => {
  it("prioritizes benefits q/category/region params over fallback defaults", () => {
    const params = new URLSearchParams(
      "q=주거비&query=legacy&category=housing&region=서울 강남구&ageBand=30s&incomeBand=low-mid",
    );
    const parsed = parseBenefitsQueryPreset(params, "기본검색어");

    expect(parsed.q).toBe("주거비");
    expect(parsed.category).toBe("housing");
    expect(parsed.region).toBe("서울 강남구");
    expect(parsed.sido).toBe("서울");
    expect(parsed.sigungu).toBe("강남구");
    expect(parsed.mappedTopics).toEqual(["housing", "jeonse", "wolse"]);
  });

  it("parses subscription query with explicit type/priority and region fallback", () => {
    const withQuery = parseSubscriptionQueryPreset(
      new URLSearchParams("region=경기&type=remndr&priority=urgent"),
      "전국",
    );
    expect(withQuery.region).toBe("경기");
    expect(withQuery.type).toBe("remndr");
    expect(withQuery.priority).toBe("urgent");

    const fallback = parseSubscriptionQueryPreset(new URLSearchParams(""), "서울");
    expect(fallback.region).toBe("서울");
    expect(fallback.type).toBe("apt");
    expect(fallback.priority).toBe("general");
  });
});
