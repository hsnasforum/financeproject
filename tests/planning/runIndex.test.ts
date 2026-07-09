import { describe, expect, it } from "vitest";
import {
  buildRunIndexFile,
  parseRunIndex,
  RUN_INDEX_VERSION,
  sortRunIndexEntriesByCreatedAtDesc,
  toRunIndexEntry,
} from "../../src/lib/planning/store/runIndex";
import { type PlanningRunRecord } from "../../src/lib/planning/store/types";

function sampleRun(overrides: Partial<PlanningRunRecord> = {}): PlanningRunRecord {
  const base: PlanningRunRecord = {
    version: 1,
    schemaVersion: 2,
    id: "run-1",
    profileId: "profile-1",
    title: " Morning plan ",
    createdAt: "2026-07-02T01:00:00.000Z",
    overallStatus: "PARTIAL_SUCCESS",
    input: {
      horizonMonths: 12,
    },
    meta: {
      snapshot: {
        id: "snap-1",
        asOf: "2026-07-01",
        missing: true,
      },
      health: {
        warningsCodes: ["LOW_CASH"],
        criticalCount: 2,
      },
    },
    outputs: {
      resultDto: {
        summary: {
          totalWarnings: 3,
        },
      } as PlanningRunRecord["outputs"]["resultDto"],
    },
  };

  return {
    ...base,
    ...overrides,
    input: {
      ...base.input,
      ...overrides.input,
    },
    meta: {
      ...base.meta,
      ...overrides.meta,
    },
    outputs: {
      ...base.outputs,
      ...overrides.outputs,
    },
  };
}

describe("planning run index contract", () => {
  it("projects run metadata into a compact index entry", () => {
    expect(toRunIndexEntry(sampleRun())).toEqual({
      id: "run-1",
      profileId: "profile-1",
      title: "Morning plan",
      createdAt: "2026-07-02T01:00:00.000Z",
      overallStatus: "PARTIAL_SUCCESS",
      snapshot: {
        id: "snap-1",
        asOf: "2026-07-01",
        missing: true,
      },
      warningsCount: 3,
      criticalCount: 2,
    });
  });

  it("parses only the current index version and valid rows", () => {
    const parsed = parseRunIndex({
      version: RUN_INDEX_VERSION,
      entries: [
        { id: "", profileId: "profile-1", createdAt: "2026-07-02T00:00:00.000Z" },
        { id: "old", profileId: "profile-1", createdAt: "2026-07-01T00:00:00.000Z" },
        { id: "new", profileId: "profile-1", createdAt: "2026-07-03T00:00:00.000Z" },
      ],
    });

    expect(parsed.map((row) => row.id)).toEqual(["new", "old"]);
    expect(parseRunIndex({ version: 999, entries: parsed })).toEqual([]);
  });

  it("sorts entries by createdAt descending and id as a deterministic tie breaker", () => {
    const entries = [
      { id: "a", profileId: "profile-1", createdAt: "invalid" },
      { id: "c", profileId: "profile-1", createdAt: "invalid" },
      { id: "b", profileId: "profile-1", createdAt: "invalid" },
    ];

    expect(sortRunIndexEntriesByCreatedAtDesc(entries).map((row) => row.id)).toEqual(["c", "b", "a"]);
  });

  it("builds the persisted index file without mutating caller order", () => {
    const entries = [
      { id: "old", profileId: "profile-1", createdAt: "2026-07-01T00:00:00.000Z" },
      { id: "new", profileId: "profile-1", createdAt: "2026-07-02T00:00:00.000Z" },
    ];
    const file = buildRunIndexFile(entries);

    expect(file).toEqual({
      version: RUN_INDEX_VERSION,
      entries: [
        { id: "new", profileId: "profile-1", createdAt: "2026-07-02T00:00:00.000Z" },
        { id: "old", profileId: "profile-1", createdAt: "2026-07-01T00:00:00.000Z" },
      ],
    });
    expect(entries.map((row) => row.id)).toEqual(["old", "new"]);
  });
});
