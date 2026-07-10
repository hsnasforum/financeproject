import { afterEach, describe, expect, it, vi } from "vitest";
import {
  persistCreatePlanningRunRecord,
  resolveCreateRunPersistenceOptions,
  shouldStoreRawPlanningRunOutputs,
  type CreateRunRecord,
  type CreateRunRecordInput,
} from "../../src/lib/planning/server/runs/createRunPersistence";
import { type CurrentUserRunRecord } from "../../src/lib/planning/server/runs/routeService";

function sampleRecordInput(): CreateRunRecordInput {
  return {
    profileId: "profile-1",
    title: "Persistence adapter run",
    overallStatus: "SUCCESS",
    stages: [],
    input: {
      horizonMonths: 12,
    },
    meta: {
      snapshot: {},
      health: {
        warningsCodes: [],
        criticalCount: 0,
      },
    },
    outputs: {},
  };
}

function sampleRunRecord(overrides: Partial<CurrentUserRunRecord> = {}): CurrentUserRunRecord {
  return {
    version: 1,
    schemaVersion: 2,
    id: "run-1",
    profileId: "profile-1",
    title: "Persistence adapter run",
    createdAt: "2026-07-02T00:00:00.000Z",
    overallStatus: "SUCCESS",
    stages: [],
    input: {
      horizonMonths: 12,
    },
    meta: {
      snapshot: {},
      health: {
        warningsCodes: [],
        criticalCount: 0,
      },
    },
    outputs: {},
    ...overrides,
  };
}

describe("planning create run persistence adapter", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("normalizes the raw output storage env flag without leaking env parsing into orchestration", () => {
    expect(shouldStoreRawPlanningRunOutputs("true")).toBe(true);
    expect(shouldStoreRawPlanningRunOutputs(" TRUE ")).toBe(true);
    expect(shouldStoreRawPlanningRunOutputs("false")).toBe(false);
    expect(shouldStoreRawPlanningRunOutputs(undefined)).toBe(false);
    expect(resolveCreateRunPersistenceOptions({
      PLANNING_RUN_STORE_RAW_OUTPUTS: "true",
    })).toEqual({ storeRawOutputs: true });
    expect(resolveCreateRunPersistenceOptions({})).toEqual({ storeRawOutputs: false });
  });

  it("reads the raw output storage flag from process.env when no env is injected", () => {
    vi.stubEnv("PLANNING_RUN_STORE_RAW_OUTPUTS", " TRUE ");

    expect(resolveCreateRunPersistenceOptions()).toEqual({ storeRawOutputs: true });
  });

  it("persists the assembled record input through the injected repository boundary", async () => {
    const recordInput = sampleRecordInput();
    const runRecord = sampleRunRecord();
    const createRunRecord = vi.fn(async () => runRecord) as unknown as CreateRunRecord;

    await expect(persistCreatePlanningRunRecord({
      createRunRecord,
      recordInput,
      env: {
        PLANNING_RUN_STORE_RAW_OUTPUTS: "true",
      },
    })).resolves.toBe(runRecord);

    expect(createRunRecord).toHaveBeenCalledWith(recordInput, {
      storeRawOutputs: true,
    });
  });

  it("preserves persistence failures for the service-level error handler", async () => {
    const failure = new Error("run store unavailable");
    const createRunRecord = vi.fn(async () => {
      throw failure;
    }) as unknown as CreateRunRecord;

    await expect(persistCreatePlanningRunRecord({
      createRunRecord,
      recordInput: sampleRecordInput(),
      env: {},
    })).rejects.toBe(failure);
  });
});
