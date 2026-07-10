import { describe, expect, it, vi } from "vitest";

import { createRunLegacyBackfillReadStore } from "../../src/lib/planning/store/runLegacyBackfillReadStore";
import { type RunPaths } from "../../src/lib/planning/store/runReadSources";
import { type PlanningRunRecord } from "../../src/lib/planning/store/types";

function makeRun(overrides: Partial<PlanningRunRecord> = {}): PlanningRunRecord {
  return {
    version: 1,
    schemaVersion: 2,
    id: "run-1",
    profileId: "profile-1",
    createdAt: "2026-07-04T00:00:00.000Z",
    input: { horizonMonths: 12 },
    meta: { snapshot: { missing: true } },
    outputs: {},
    ...overrides,
  };
}

function makePaths(): RunPaths {
  return {
    runId: "run-1",
    profileId: "profile-1",
    partitionMetaPath: "/vault/profiles/profile-1/runs/run-1/run.json",
    partitionRunDir: "/vault/profiles/profile-1/runs/run-1",
    partitionBlobDir: "/vault/profiles/profile-1/runs/run-1/blobs",
    legacyMetaPath: "/runs/run-1/run.json",
    legacyFilePath: "/runs/run-1.json",
    legacyRunDir: "/runs/run-1",
  };
}

describe("planning run legacy backfill read store", () => {
  it("reads raw run candidates in partition, legacy meta, legacy file order", async () => {
    const run = makeRun();
    const calls: string[] = [];
    const readJsonFile = vi.fn(async (filePath: string) => {
      calls.push(filePath);
      if (filePath === "/runs/run-1.json") return { encoded: "legacy-file" };
      return null;
    });
    const store = createRunLegacyBackfillReadStore({
      getPaths: vi.fn(() => makePaths()),
      readJsonFile,
      decodeStoredPayload: vi.fn(async () => ({ payload: run })),
      normalizeRawRun: vi.fn((value) => value as PlanningRunRecord),
    });

    await expect(store.readRawRunForIndexEntry({
      id: "run-1",
      profileId: "profile-1",
    })).resolves.toBe(run);

    expect(calls).toEqual([
      "/vault/profiles/profile-1/runs/run-1/run.json",
      "/runs/run-1/run.json",
      "/runs/run-1.json",
    ]);
  });

  it("falls back when a decoded payload is not a normalizable run", async () => {
    const run = makeRun({ id: "legacy-meta" });
    const decodeStoredPayload = vi.fn(async (loaded: unknown) => ({
      payload: loaded,
    }));
    const normalizeRawRun = vi.fn((value: unknown) => (
      value === "bad-payload" ? null : run
    ));
    const store = createRunLegacyBackfillReadStore({
      getPaths: vi.fn(() => makePaths()),
      readJsonFile: vi.fn(async (filePath: string) => (
        filePath.endsWith("/run-1/run.json") && filePath.startsWith("/vault")
          ? "bad-payload"
          : { id: "legacy-meta" }
      )),
      decodeStoredPayload,
      normalizeRawRun,
    });

    await expect(store.readRawRunForIndexEntry({
      id: "run-1",
      profileId: "profile-1",
    })).resolves.toBe(run);

    expect(decodeStoredPayload).toHaveBeenCalledTimes(2);
    expect(normalizeRawRun).toHaveBeenNthCalledWith(1, "bad-payload");
    expect(normalizeRawRun).toHaveBeenNthCalledWith(2, { id: "legacy-meta" });
  });

  it("reports malformed and invalid run fallbacks without exposing paths", async () => {
    const run = makeRun({ id: "legacy-file" });
    const store = createRunLegacyBackfillReadStore({
      getPaths: vi.fn(() => makePaths()),
      readJsonFile: vi.fn(async () => null),
      readJsonFileDetailed: vi.fn(async (filePath: string) => {
        if (filePath.startsWith("/vault")) return { status: "invalid-json" as const };
        if (filePath.endsWith("/run-1/run.json")) {
          return { status: "found" as const, value: "invalid-run" };
        }
        return { status: "found" as const, value: run };
      }),
      decodeStoredPayload: vi.fn(async (loaded: unknown) => ({ payload: loaded })),
      normalizeRawRun: vi.fn((value: unknown) => (
        value === "invalid-run" ? null : value as PlanningRunRecord
      )),
    });

    await expect(store.readRawRunForIndexEntryDetailed({
      id: "run-1",
      profileId: "profile-1",
    })).resolves.toEqual({
      run,
      fallbacks: [
        { source: "partition-meta", reason: "invalid-json" },
        { source: "legacy-meta", reason: "invalid-run-record" },
      ],
    });
  });

  it("attributes the legacy meta fallback correctly when no partition path exists", async () => {
    const run = makeRun({ id: "legacy-meta" });
    const paths = makePaths();
    delete paths.partitionMetaPath;
    let reads = 0;
    const store = createRunLegacyBackfillReadStore({
      getPaths: vi.fn(() => paths),
      readJsonFile: vi.fn(async () => null),
      readJsonFileDetailed: vi.fn(async () => {
        reads += 1;
        return reads === 1
          ? { status: "invalid-json" as const }
          : { status: "found" as const, value: run };
      }),
      decodeStoredPayload: vi.fn(async (loaded: unknown) => ({ payload: loaded })),
      normalizeRawRun: vi.fn((value: unknown) => value as PlanningRunRecord),
    });

    await expect(store.readRawRunForIndexEntryDetailed({
      id: "run-1",
      profileId: "profile-1",
    })).resolves.toEqual({
      run,
      fallbacks: [
        { source: "legacy-meta", reason: "invalid-json" },
      ],
    });
    expect(reads).toBe(2);
  });

  it("preserves decode exceptions instead of treating them as fallback", async () => {
    const decodeError = new TypeError("vault decode failed");
    const store = createRunLegacyBackfillReadStore({
      getPaths: vi.fn(() => makePaths()),
      readJsonFile: vi.fn(async () => ({ encoded: true })),
      readJsonFileDetailed: vi.fn(async () => ({
        status: "found" as const,
        value: { encoded: true },
      })),
      decodeStoredPayload: vi.fn(async () => {
        throw decodeError;
      }),
      normalizeRawRun: vi.fn(() => makeRun()),
    });

    await expect(store.readRawRunForIndexEntryDetailed({
      id: "run-1",
      profileId: "profile-1",
    })).rejects.toBe(decodeError);
  });

  it("returns null without decoding when no raw source is readable", async () => {
    const decodeStoredPayload = vi.fn(async () => ({ payload: makeRun() }));
    const normalizeRawRun = vi.fn(() => makeRun());
    const store = createRunLegacyBackfillReadStore({
      getPaths: vi.fn(() => makePaths()),
      readJsonFile: vi.fn(async () => null),
      decodeStoredPayload,
      normalizeRawRun,
    });

    await expect(store.readRawRunForIndexEntry({
      id: "missing-run",
      profileId: "profile-1",
    })).resolves.toBeNull();

    expect(decodeStoredPayload).not.toHaveBeenCalled();
    expect(normalizeRawRun).not.toHaveBeenCalled();
  });
});
