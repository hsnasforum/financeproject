import { describe, expect, it } from "vitest";
import { NEWS_SOURCES } from "../src/lib/planning/v3/news/sources";

describe("planning v3 news source defaults", () => {
  it("keeps every built-in feed HTTPS-only", () => {
    const insecureSources = NEWS_SOURCES
      .filter((source) => new URL(source.feedUrl).protocol !== "https:")
      .map((source) => source.id);

    expect(insecureSources).toEqual([]);
  });
});
