import { describe, expect, it, vi } from "vitest";

import { createRunBlobReadStore } from "../../src/lib/planning/store/runBlobReadStore";
import {
  readRunBlobPayload,
  type RunBlobName,
} from "../../src/lib/planning/store/runBlobStore";
import { type PlanningRunRecord } from "../../src/lib/planning/store/types";

const STAGE_BLOB_NAMES: Array<Exclude<RunBlobName, "raw">> = [
  "simulate",
  "scenarios",
  "monteCarlo",
  "actions",
  "debtStrategy",
];

function makeRun(overrides: Partial<PlanningRunRecord> = {}): PlanningRunRecord {
  return {
    version: 1,
    schemaVersion: 2,
    id: "run-1",
    profileId: "profile-1",
    title: "Test run",
    createdAt: "2026-01-01T00:00:00.000Z",
    overallStatus: "SUCCESS",
    stages: [],
    input: {
      horizonMonths: 12,
    },
    meta: {},
    outputs: {
      simulate: {
        ref: {
          name: "simulate",
          path: ".data/planning/runs/run-1/blobs/simulate.json",
        },
        summary: {
          endNetWorthKrw: 1000,
        },
      },
    },
    ...overrides,
  };
}

describe("planning run blob read store", () => {
  it("returns null for unsupported blob names without reading the run", async () => {
    const getRun = vi.fn(async () => makeRun());
    const readBlobPayload = vi.fn(async (input: Parameters<typeof readRunBlobPayload>[0]) => ({
      blobName: input.blobName,
    }));
    const store = createRunBlobReadStore({ getRun, readBlobPayload });

    await expect(store.getRunBlob("run-1", "unknown")).resolves.toBeNull();

    expect(getRun).not.toHaveBeenCalled();
    expect(readBlobPayload).not.toHaveBeenCalled();
  });

  it("delegates non-raw blob reads with the loaded run as fallback", async () => {
    const run = makeRun();
    const getRun = vi.fn(async () => run);
    const readBlobPayload = vi.fn(async (input: Parameters<typeof readRunBlobPayload>[0]) => ({
      blobName: input.blobName,
      runId: input.runId,
    }));
    const store = createRunBlobReadStore({ getRun, readBlobPayload });

    await expect(store.getRunBlob("run-1", "simulate")).resolves.toEqual({
      blobName: "simulate",
      runId: "run-1",
    });

    expect(getRun).toHaveBeenCalledWith("run-1");
    const input = readBlobPayload.mock.calls[0]?.[0];
    expect(input).toMatchObject({ runId: "run-1", blobName: "simulate" });
    expect(input?.run).toBe(run);
    expect(input?.fallbackRun).toBe(run);
  });

  it("keeps legacy blob fallback available when a non-raw run is missing", async () => {
    const getRun = vi.fn(async () => null);
    const readBlobPayload = vi.fn(async (input: Parameters<typeof readRunBlobPayload>[0]) => ({
      blobName: input.blobName,
      run: input.run,
      fallbackRun: input.fallbackRun,
    }));
    const store = createRunBlobReadStore({ getRun, readBlobPayload });

    await expect(store.getRunBlob("legacy-run", "actions")).resolves.toEqual({
      blobName: "actions",
      run: null,
      fallbackRun: null,
    });

    expect(getRun).toHaveBeenCalledWith("legacy-run");
    expect(readBlobPayload).toHaveBeenCalledTimes(1);
    expect(readBlobPayload.mock.calls[0]?.[0]).toMatchObject({
      runId: "legacy-run",
      blobName: "actions",
      run: null,
      fallbackRun: null,
    });
  });

  it("returns null for raw blob reads when the run is missing", async () => {
    const getRun = vi.fn(async () => null);
    const readBlobPayload = vi.fn(async (input: Parameters<typeof readRunBlobPayload>[0]) => ({
      blobName: input.blobName,
    }));
    const store = createRunBlobReadStore({ getRun, readBlobPayload });

    await expect(store.getRunBlob("missing-run", "raw")).resolves.toBeNull();

    expect(getRun).toHaveBeenCalledWith("missing-run");
    expect(readBlobPayload).not.toHaveBeenCalled();
  });

  it("assembles raw blob reads from the five stage blobs in order", async () => {
    const run = makeRun();
    const getRun = vi.fn(async () => run);
    const readBlobPayload = vi.fn(async (input: Parameters<typeof readRunBlobPayload>[0]) => ({
      stage: input.blobName,
    }));
    const store = createRunBlobReadStore({ getRun, readBlobPayload });

    await expect(store.getRunBlob("run-1", "raw")).resolves.toEqual({
      run,
      outputs: {
        simulate: { stage: "simulate" },
        scenarios: { stage: "scenarios" },
        monteCarlo: { stage: "monteCarlo" },
        actions: { stage: "actions" },
        debtStrategy: { stage: "debtStrategy" },
      },
    });

    expect(readBlobPayload.mock.calls.map(([input]) => input.blobName)).toEqual(STAGE_BLOB_NAMES);
    for (const [input] of readBlobPayload.mock.calls) {
      expect(input.runId).toBe("run-1");
      expect(input.run).toBe(run);
      expect(input.fallbackRun).toBe(run);
    }
  });
});
