import { describe, expect, it } from "vitest";
import { buildCreatePlanningRunSuccessResult } from "../../src/lib/planning/server/runs/createRunSuccessResponse";
import { type CurrentUserRunRecord } from "../../src/lib/planning/server/runs/routeService";

function sampleRunRecord(overrides: Partial<CurrentUserRunRecord> = {}): CurrentUserRunRecord {
  return {
    version: 1,
    schemaVersion: 2,
    id: "run-1",
    profileId: "profile-1",
    title: "Success response run",
    createdAt: "2026-07-03T00:00:00.000Z",
    overallStatus: "SUCCESS",
    stages: [],
    input: {
      horizonMonths: 12,
    },
    meta: {},
    outputs: {},
    ...overrides,
  };
}

describe("planning create run success response", () => {
  it("assembles the public success status, meta, and data without route dependencies", () => {
    const data = sampleRunRecord();
    const result = buildCreatePlanningRunSuccessResult({
      generatedAt: "2026-07-03T01:02:03.000Z",
      snapshotMeta: {
        id: "snapshot-1",
        asOf: "2026-07-01",
        missing: false,
      },
      profileNormalization: {
        defaultsApplied: ["cashflow"],
        fixesApplied: [],
      },
      healthSummary: {
        warningCodes: ["ASSUMPTIONS_STALE"],
        criticalCount: 0,
      },
      overallStatus: "SUCCESS",
      stages: [
        {
          id: "simulate",
          label: "simulate",
          status: "SUCCESS",
          durationMs: 12,
        },
      ],
      data,
    });

    expect(result).toEqual({
      ok: true,
      status: 201,
      payload: {
        meta: {
          generatedAt: "2026-07-03T01:02:03.000Z",
          snapshot: {
            id: "snapshot-1",
            asOf: "2026-07-01",
            missing: false,
          },
          normalization: {
            defaultsApplied: ["cashflow"],
            fixesApplied: [],
          },
          health: {
            warningCodes: ["ASSUMPTIONS_STALE"],
            criticalCount: 0,
          },
          overallStatus: "SUCCESS",
          stages: [
            {
              id: "simulate",
              label: "simulate",
              status: "SUCCESS",
              durationMs: 12,
            },
          ],
        },
        data,
      },
    });
    expect(result.payload.data).toBe(data);
  });
});
