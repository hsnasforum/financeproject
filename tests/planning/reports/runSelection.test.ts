import { describe, expect, it, vi } from "vitest";
import {
  buildRequestedReportRunScope,
  DEFAULT_REPORT_RUN_SCOPE_LIMIT,
  mergeRunListWithPreferredRun,
  resolveFallbackReportRunScope,
  resolveRequestedReportRunContext,
  resolveRequestedReportRunScope,
  resolveSelectedRunId,
} from "../../../src/lib/planning/reports/runSelection";
import { type PlanningRunRecord } from "../../../src/lib/planning/store/types";

function createRun(id: string, profileId: string, createdAt: string): PlanningRunRecord {
  return {
    version: 1,
    id,
    profileId,
    createdAt,
    title: `Run ${id}`,
    overallStatus: "SUCCESS",
    input: {
      horizonMonths: 120,
    },
    meta: {},
    outputs: {},
    stages: [],
  };
}

describe("runSelection", () => {
  it("prepends the preferred run when the scoped list does not include it", () => {
    const scopedRuns = [
      createRun("run-new-1", "profile-a", "2026-03-09T00:00:00.000Z"),
      createRun("run-new-2", "profile-a", "2026-03-08T00:00:00.000Z"),
    ];
    const preferredRun = createRun("run-old", "profile-a", "2026-01-01T00:00:00.000Z");

    const merged = mergeRunListWithPreferredRun(scopedRuns, preferredRun);

    expect(merged.map((run) => run.id)).toEqual(["run-old", "run-new-1", "run-new-2"]);
    expect(resolveSelectedRunId(merged, "run-old")).toBe("run-old");
  });

  it("builds a fallback scope from the requested run when the scoped list is empty", () => {
    const requestedRun = createRun("run-requested", "profile-b", "2026-03-09T00:00:00.000Z");

    const scope = buildRequestedReportRunScope({
      runs: [],
      requestedRun,
      preferredRunId: "run-requested",
      fallbackProfileId: "profile-a",
    });

    expect(scope.effectiveProfileId).toBe("profile-b");
    expect(scope.initialRunId).toBe("run-requested");
    expect(scope.runs.map((run) => run.id)).toEqual(["run-requested"]);
  });

  it("switches to the requested run profile and preserves the requested run", async () => {
    const requestedRun = createRun("run-legacy", "profile-b", "2026-01-05T00:00:00.000Z");
    const listRuns = vi.fn(async (options?: { profileId?: string; limit?: number }) => {
      expect(options).toEqual({ profileId: "profile-b", limit: DEFAULT_REPORT_RUN_SCOPE_LIMIT });
      return [
        createRun("run-new-1", "profile-b", "2026-03-09T00:00:00.000Z"),
        createRun("run-new-2", "profile-b", "2026-03-08T00:00:00.000Z"),
      ];
    });
    const getRun = vi.fn(async (id: string) => {
      expect(id).toBe("run-legacy");
      return requestedRun;
    });

    const resolved = await resolveRequestedReportRunScope({
      requestedProfileId: "profile-a",
      requestedRunId: "run-legacy",
      defaultProfileId: "profile-a",
      listRuns,
      getRun,
    });

    expect(resolved.effectiveProfileId).toBe("profile-b");
    expect(resolved.initialRunId).toBe("run-legacy");
    expect(resolved.runs.map((run) => run.id)).toEqual(["run-legacy", "run-new-1", "run-new-2"]);
  });

  it("resolves the requested run profile before scoped list fallback runs", async () => {
    const requestedRun = createRun("run-legacy", "profile-b", "2026-01-05T00:00:00.000Z");

    const resolved = await resolveRequestedReportRunContext({
      requestedProfileId: "profile-a",
      requestedRunId: "run-legacy",
      defaultProfileId: "profile-a",
      getRun: vi.fn(async () => requestedRun),
    });

    expect(resolved.effectiveProfileId).toBe("profile-b");
    expect(resolved.requestedRun?.id).toBe("run-legacy");
  });

  it("falls back to the first scoped run when there is no requested run match", async () => {
    const scopedRuns = [
      createRun("run-1", "profile-a", "2026-03-09T00:00:00.000Z"),
      createRun("run-2", "profile-a", "2026-03-08T00:00:00.000Z"),
    ];

    const resolved = await resolveRequestedReportRunScope({
      requestedProfileId: "",
      requestedRunId: "missing-run",
      defaultProfileId: "profile-a",
      listRuns: vi.fn(async () => scopedRuns),
      getRun: vi.fn(async () => null),
    });

    expect(resolved.effectiveProfileId).toBe("profile-a");
    expect(resolved.initialRunId).toBe("run-1");
    expect(resolved.runs.map((run) => run.id)).toEqual(["run-1", "run-2"]);
  });

  it("absorbs requested run lookup failures and falls back to the scoped recent runs", async () => {
    const scopedRuns = [
      createRun("run-1", "profile-a", "2026-03-09T00:00:00.000Z"),
      createRun("run-2", "profile-a", "2026-03-08T00:00:00.000Z"),
    ];
    const listRuns = vi.fn(async (options?: { profileId?: string; limit?: number }) => {
      expect(options).toEqual({ profileId: "profile-a", limit: DEFAULT_REPORT_RUN_SCOPE_LIMIT });
      return scopedRuns;
    });
    const getRun = vi.fn(async () => {
      throw new Error("read failed");
    });

    const resolved = await resolveRequestedReportRunScope({
      requestedProfileId: "",
      requestedRunId: "run-legacy",
      defaultProfileId: "profile-a",
      listRuns,
      getRun,
    });

    expect(resolved.requestedRun).toBeNull();
    expect(resolved.effectiveProfileId).toBe("profile-a");
    expect(resolved.initialRunId).toBe("run-1");
    expect(resolved.runs.map((run) => run.id)).toEqual(["run-1", "run-2"]);
  });


  it("retries fallback scope with requested run lookup and preserves the requested run", async () => {
    const requestedRun = createRun("run-legacy", "profile-b", "2026-01-05T00:00:00.000Z");
    const listRuns = vi.fn(async (options?: { profileId?: string; limit?: number }) => {
      expect(options).toEqual({ profileId: "profile-b", limit: DEFAULT_REPORT_RUN_SCOPE_LIMIT });
      return [
        createRun("run-new-1", "profile-b", "2026-03-09T00:00:00.000Z"),
        createRun("run-new-2", "profile-b", "2026-03-08T00:00:00.000Z"),
      ];
    });
    const getRun = vi.fn(async (id: string) => {
      expect(id).toBe("run-legacy");
      return requestedRun;
    });

    const resolved = await resolveFallbackReportRunScope({
      effectiveProfileId: "profile-a",
      requestedRunId: "run-legacy",
      listRuns,
      getRun,
    });

    expect(resolved.effectiveProfileId).toBe("profile-b");
    expect(resolved.initialRunId).toBe("run-legacy");
    expect(resolved.runs.map((run) => run.id)).toEqual(["run-legacy", "run-new-1", "run-new-2"]);
  });

  it("keeps the scoped list when fallback requested run lookup still fails", async () => {
    const scopedRuns = [
      createRun("run-1", "profile-a", "2026-03-09T00:00:00.000Z"),
      createRun("run-2", "profile-a", "2026-03-08T00:00:00.000Z"),
    ];

    const resolved = await resolveFallbackReportRunScope({
      effectiveProfileId: "profile-a",
      requestedRunId: "run-legacy",
      listRuns: vi.fn(async () => scopedRuns),
      getRun: vi.fn(async () => {
        throw new Error("read failed");
      }),
    });

    expect(resolved.effectiveProfileId).toBe("profile-a");
    expect(resolved.requestedRun).toBeNull();
    expect(resolved.initialRunId).toBe("run-1");
    expect(resolved.runs.map((run) => run.id)).toEqual(["run-1", "run-2"]);
  });

});
