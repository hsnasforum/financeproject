import { describe, expect, it, vi } from "vitest";

import { createRunReadStore } from "../../src/lib/planning/store/runReadStore";
import { type RunPaths } from "../../src/lib/planning/store/runReadSources";
import { type PlanningRunRecord } from "../../src/lib/planning/store/types";

function makeRun(overrides: Partial<PlanningRunRecord> = {}): PlanningRunRecord {
  return {
    id: "run-1",
    profileId: "profile-1",
    title: "Test run",
    scenario: "baseline",
    overallStatus: "complete",
    stages: [],
    input: {},
    meta: {},
    outputs: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    version: 1,
    ...overrides,
  } as PlanningRunRecord;
}

function makePaths(runId = "run-1", profileId = "profile-1"): RunPaths {
  return {
    runId,
    profileId,
    partitionMetaPath: `/vault/profiles/${profileId}/runs/${runId}/meta.json`,
    partitionRunDir: `/vault/profiles/${profileId}/runs/${runId}`,
    partitionBlobDir: `/vault/profiles/${profileId}/runs/${runId}/blobs`,
    legacyMetaPath: `/vault/runs/${runId}/meta.json`,
    legacyFilePath: `/vault/runs/${runId}.json`,
    legacyRunDir: `/vault/runs/${runId}`,
  };
}

describe("planning run read store", () => {
  it("reads candidates in source order and only migrates legacy hits when requested", async () => {
    const run = makeRun();
    const resolveSources = vi.fn(async () => ({
      sources: [
        { source: "partition-hint" as const, filePath: "/partition/meta.json" },
        { source: "legacy-meta" as const, filePath: "/legacy/meta.json" },
      ],
    }));
    const readMetaByPath = vi.fn(async (filePath: string) => (
      filePath === "/legacy/meta.json" ? run : null
    ));
    const getPathsForMigration = vi.fn((runId: string, profileId?: string) => makePaths(runId, profileId));
    const migrateLegacyRun = vi.fn(async () => true);

    const store = createRunReadStore({
      resolveSources,
      readMetaByPath,
      getPathsForMigration,
      migrateLegacyRun,
    });

    await expect(store.readRunMeta("run-1", "profile-hint", { persistMigrations: true })).resolves.toBe(run);

    expect(resolveSources).toHaveBeenCalledWith("run-1", "profile-hint");
    expect(readMetaByPath).toHaveBeenNthCalledWith(1, "/partition/meta.json", { persistMigrations: true });
    expect(readMetaByPath).toHaveBeenNthCalledWith(2, "/legacy/meta.json", { persistMigrations: true });
    expect(getPathsForMigration).toHaveBeenCalledWith("run-1", "profile-1");
    expect(migrateLegacyRun).toHaveBeenCalledWith({
      record: run,
      paths: makePaths("run-1", "profile-1"),
    });
  });

  it("does not partition-migrate legacy hits during read-only calls", async () => {
    const run = makeRun();
    const migrateLegacyRun = vi.fn(async () => true);
    const store = createRunReadStore({
      resolveSources: async () => ({
        sources: [{ source: "legacy-file" as const, filePath: "/legacy/run.json" }],
      }),
      readMetaByPath: async () => run,
      migrateLegacyRun,
    });

    await expect(store.readRunMeta("run-1", undefined, { persistMigrations: false })).resolves.toBe(run);

    expect(migrateLegacyRun).not.toHaveBeenCalled();
  });

  it("keeps diagnostics source traversal and found response assembly outside runStore", async () => {
    const run = makeRun({ id: "run-2", profileId: "profile-2" });
    const store = createRunReadStore({
      normalizePath: (filePath) => filePath.replace("/repo/", ""),
      resolveSources: async () => ({
        sources: [
          { source: "partition-hint" as const, filePath: "/repo/vault/run.json" },
          { source: "legacy-meta" as const, filePath: "/repo/runs/run-2/meta.json" },
        ],
      }),
      readMetaByPathDetailed: async (filePath) => (
        filePath.endsWith("run.json")
          ? { status: "unreadable" as const, reason: "invalid-json" }
          : { status: "found" as const, run }
      ),
    });

    await expect(store.diagnoseRunRead("run-2", "profile-2")).resolves.toEqual({
      id: "run-2",
      profileIdHint: "profile-2",
      status: "found",
      attempts: [
        {
          source: "partition-hint",
          path: "vault/run.json",
          status: "unreadable",
          reason: "invalid-json",
        },
        {
          source: "legacy-meta",
          path: "runs/run-2/meta.json",
          status: "found",
        },
      ],
      run,
    });
  });
});
