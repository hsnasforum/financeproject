import { describe, expect, it } from "vitest";
import { migrateRunRecord } from "../../../src/lib/planning/migrations/runMigrate";

function validRunRecord() {
  return {
    version: 1,
    id: "run-1",
    profileId: "profile-1",
    createdAt: "2026-02-28T00:00:00.000Z",
    input: {
      horizonMonths: 120,
    },
    meta: {
      snapshot: {
        asOf: "2026-02-28",
        fetchedAt: "2026-02-28T00:00:00.000Z",
        missing: false,
      },
    },
    outputs: {
      simulate: {
        summary: {},
        warnings: ["GOAL_MISSED"],
        goalsStatus: [],
        keyTimelinePoints: [],
      },
    },
  };
}

describe("migrateRunRecord", () => {
  it("defaults missing version and normalizes warnings list", () => {
    const row = {
      ...validRunRecord(),
      version: undefined,
      outputs: {
        simulate: {
          summary: {},
          warnings: [{ reasonCode: "B_CODE" }, "A_CODE", { code: "A_CODE" }],
          goalsStatus: [],
          keyTimelinePoints: [],
        },
      },
    };
    const result = migrateRunRecord(row);
    expect(result.ok).toBe(true);
    expect(result.warnings).toContain("VERSION_MISSING_DEFAULTED");
    expect(result.data?.outputs.simulate?.warnings).toEqual(["A_CODE", "B_CODE"]);
  });

  it("adds warning when snapshot id is missing but asOf/fetchedAt exists", () => {
    const row = validRunRecord();
    const result = migrateRunRecord(row);
    expect(result.ok).toBe(true);
    expect(result.warnings).toContain("SNAPSHOT_ID_MISSING");
  });

  it("rejects record when profileId is missing", () => {
    const row = {
      ...validRunRecord(),
      profileId: "",
    };
    const result = migrateRunRecord(row);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("MISSING_PROFILE_ID");
  });
});
