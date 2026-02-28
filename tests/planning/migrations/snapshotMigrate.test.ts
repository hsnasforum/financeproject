import { describe, expect, it } from "vitest";
import { migrateAssumptionsSnapshot } from "../../../src/lib/planning/migrations/snapshotMigrate";

function validSnapshot() {
  return {
    version: 1,
    asOf: "2026-02-28",
    fetchedAt: "2026-02-28T00:00:00.000Z",
    korea: {
      cpiYoYPct: 2.0,
    },
    sources: [
      { name: "BOK", url: "https://example.com", fetchedAt: "2026-02-28T00:00:00.000Z" },
    ],
    warnings: [],
  };
}

describe("migrateAssumptionsSnapshot", () => {
  it("defaults missing version and normalizes legacy sources", () => {
    const row = {
      ...validSnapshot(),
      version: undefined,
      sources: ["https://source-1.example"],
    };
    const result = migrateAssumptionsSnapshot(row);
    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.warnings).toContain("VERSION_MISSING_DEFAULTED");
    expect(result.warnings).toContain("SOURCES_SHAPE_NORMALIZED");
    expect(result.data?.sources.length).toBe(1);
    expect(result.data?.sources[0]?.name).toBe("https://source-1.example");
  });

  it("rejects when fetchedAt is missing", () => {
    const row = {
      ...validSnapshot(),
      fetchedAt: "",
    };
    const result = migrateAssumptionsSnapshot(row);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("MISSING_FETCHED_AT");
  });

  it("keeps valid v1 snapshot unchanged", () => {
    const row = validSnapshot();
    const result = migrateAssumptionsSnapshot(row);
    expect(result.ok).toBe(true);
    expect(result.changed).toBe(false);
    expect(result.warnings).toEqual([]);
  });
});
