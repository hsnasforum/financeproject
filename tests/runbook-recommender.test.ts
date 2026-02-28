import { describe, expect, it } from "vitest";
import { recommendRunbook } from "../src/lib/diagnostics/runbookRecommender";

describe("runbook recommender", () => {
  it("recommends DB_REPAIR for db-related issue only", () => {
    const recommendation = recommendRunbook([
      { id: "schema-drift", code: "SCHEMA_DRIFT", title: "Schema Drift", status: "WARN" },
      { id: "dart-artifacts", code: "DART_ARTIFACTS", title: "DART Artifacts", status: "OK" },
    ]);
    expect(recommendation?.chainId).toBe("DB_REPAIR");
  });

  it("recommends DART_SETUP for dart-related issue only", () => {
    const recommendation = recommendRunbook([
      { id: "daily-refresh", code: "DAILY_REFRESH", title: "Daily Refresh", status: "WARN" },
      { id: "schema-drift", code: "SCHEMA_DRIFT", title: "Schema Drift", status: "OK" },
    ]);
    expect(recommendation?.chainId).toBe("DART_SETUP");
  });

  it("recommends FULL_REPAIR for mixed FAIL issues", () => {
    const recommendation = recommendRunbook([
      { id: "schema-drift", code: "SCHEMA_DRIFT", title: "Schema Drift", status: "FAIL" },
      { id: "dart-artifacts", code: "DART_ARTIFACTS", title: "DART Artifacts", status: "FAIL" },
    ]);
    expect(recommendation?.chainId).toBe("FULL_REPAIR");
  });

  it("returns null for all OK", () => {
    const recommendation = recommendRunbook([
      { id: "schema-drift", code: "SCHEMA_DRIFT", title: "Schema Drift", status: "OK" },
      { id: "dart-artifacts", code: "DART_ARTIFACTS", title: "DART Artifacts", status: "OK" },
    ]);
    expect(recommendation).toBeNull();
  });
});
