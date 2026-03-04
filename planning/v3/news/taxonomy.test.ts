import { describe, expect, it } from "vitest";
import { canonicalizeTopicId, tagItemTopics } from "./taxonomy";

describe("planning v3 news taxonomy", () => {
  it("maps legacy topic ids to canonical ids", () => {
    expect(canonicalizeTopicId("oil")).toBe("commodities");
    expect(canonicalizeTopicId("policy")).toBe("fiscal");
    expect(canonicalizeTopicId("equity")).toBe("growth");
    expect(canonicalizeTopicId("rates")).toBe("rates");
  });

  it("tags policy-like article as fiscal topic", () => {
    const tags = tagItemTopics({
      id: "t-1",
      sourceId: "fixture",
      title: "Tariff policy review and tax package update",
      url: "https://example.com/article",
      snippet: "Fiscal policy updates include budget and debt issuance plans.",
      fetchedAt: "2026-03-04T00:00:00.000Z",
    });

    expect(tags.length).toBeGreaterThan(0);
    expect(tags[0]?.topicId).toBe("fiscal");
  });
});
