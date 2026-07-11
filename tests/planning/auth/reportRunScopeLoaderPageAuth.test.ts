import { beforeEach, describe, expect, it, vi } from "vitest";

let insidePageAuth = false;

const mocks = vi.hoisted(() => ({
  getCurrentUserDefaultProfileId: vi.fn(),
  getCurrentUserRun: vi.fn(),
  listCurrentUserRuns: vi.fn(),
  resolveRequestedReportRunContext: vi.fn(),
  resolveRequestedReportRunScope: vi.fn(),
  resolveFallbackReportRunScope: vi.fn(),
}));

vi.mock("@/lib/planning/server/pageAuth", () => ({
  toPlanningPageLoadMessage: (error: unknown, fallback: string) => (
    error instanceof Error ? error.message : fallback
  ),
  withCurrentPlanningPageUser: async <T>(callback: () => T | Promise<T>): Promise<T> => {
    expect(insidePageAuth).toBe(false);
    insidePageAuth = true;
    try {
      return await callback();
    } finally {
      insidePageAuth = false;
    }
  },
}));

vi.mock("@/lib/planning/server/profiles/repository", () => ({
  getCurrentUserDefaultProfileId: mocks.getCurrentUserDefaultProfileId,
}));

vi.mock("@/lib/planning/server/runs/repository", () => ({
  getCurrentUserRun: mocks.getCurrentUserRun,
  listCurrentUserRuns: mocks.listCurrentUserRuns,
}));

vi.mock("@/lib/planning/reports/runSelection", () => ({
  DEFAULT_REPORT_RUN_SCOPE_LIMIT: 50,
  resolveFallbackReportRunScope: mocks.resolveFallbackReportRunScope,
  resolveRequestedReportRunContext: mocks.resolveRequestedReportRunContext,
  resolveRequestedReportRunScope: mocks.resolveRequestedReportRunScope,
}));

describe("loadCurrentUserReportRunScope pageAuth boundary", () => {
  beforeEach(() => {
    insidePageAuth = false;
    vi.clearAllMocks();
  });

  it("executes current-user report run readers only inside withCurrentPlanningPageUser", async () => {
    mocks.getCurrentUserDefaultProfileId.mockImplementation(async () => {
      expect(insidePageAuth).toBe(true);
      return "profile-1";
    });
    mocks.getCurrentUserRun.mockImplementation(async (runId: string) => {
      expect(insidePageAuth).toBe(true);
      return {
        version: 1,
        id: runId,
        profileId: "profile-1",
        title: "Requested run",
        createdAt: "2026-01-01T00:00:00.000Z",
        input: { horizonMonths: 12 },
        meta: {},
        outputs: {},
      };
    });
    mocks.listCurrentUserRuns.mockImplementation(async () => {
      expect(insidePageAuth).toBe(true);
      return [
        {
          version: 1,
          id: "run-1",
          profileId: "profile-1",
          title: "Run 1",
          createdAt: "2026-01-01T00:00:00.000Z",
          input: { horizonMonths: 12 },
          meta: {
            idempotency: {
              version: 1,
              keyHash: "key-hash",
              requestFingerprint: "request-fingerprint",
              responseMeta: { generatedAt: "2026-01-01T00:00:00.000Z" },
            },
          },
          outputs: {},
        },
      ];
    });
    mocks.resolveRequestedReportRunContext.mockImplementation(async (options: {
      getRun: (runId: string) => Promise<unknown>;
    }) => {
      expect(insidePageAuth).toBe(true);
      const requestedRun = await options.getRun("run-1");
      return { effectiveProfileId: "profile-1", requestedRun };
    });
    mocks.resolveRequestedReportRunScope.mockImplementation(async (options: {
      listRuns: () => Promise<unknown[]>;
      getRun: (runId: string) => Promise<unknown>;
    }) => {
      expect(insidePageAuth).toBe(true);
      const [runs, requestedRun] = await Promise.all([
        options.listRuns(),
        options.getRun("run-1"),
      ]);
      return {
        effectiveProfileId: "profile-1",
        initialRunId: "run-1",
        requestedRun,
        runs,
      };
    });

    const { loadCurrentUserReportRunScope } = await import("../../../src/lib/planning/reports/reportRunScopeLoader");

    const result = await loadCurrentUserReportRunScope({
      requestedProfileId: "",
      requestedRunId: "run-1",
      logContext: "test/report-scope",
      scopeFailureMessage: "리포트 범위를 불러오지 못했습니다.",
    });

    expect(result).toMatchObject({
      effectiveProfileId: "profile-1",
      initialRunId: "run-1",
      initialScopeReady: true,
    });
    expect(result.runs).toHaveLength(1);
    expect(JSON.stringify(result)).not.toMatch(/idempotency|keyHash|requestFingerprint|responseMeta/);
    expect(mocks.getCurrentUserDefaultProfileId).toHaveBeenCalledTimes(1);
    expect(mocks.getCurrentUserRun).toHaveBeenCalledTimes(2);
    expect(mocks.listCurrentUserRuns).toHaveBeenCalledTimes(1);
    expect(insidePageAuth).toBe(false);
  });
});
