import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listRuns: vi.fn(),
  summarizeActionProgress: vi.fn(),
}));

vi.mock("@/lib/planning/server/pageAuth", () => ({
  toPlanningPageLoadMessage: (_error: unknown, fallback: string) => fallback,
  withCurrentPlanningPageUser: async (callback: () => unknown) => callback(),
}));

vi.mock("@/lib/planning/server/pages/planningPageLoadTelemetry", () => ({
  createPlanningPageLoadTelemetry: () => ({
    finish: vi.fn(),
    step: async (_name: string, callback: () => unknown) => callback(),
  }),
}));

vi.mock("@/lib/planning/server/profiles/repository", () => ({
  getCurrentUserDefaultProfileId: vi.fn(async () => ""),
  getCurrentUserProfile: vi.fn(async () => null),
  listCurrentUserProfilesWithDefault: vi.fn(async () => ({
    defaultProfileId: "profile-1",
    profiles: [],
  })),
}));

vi.mock("@/lib/planning/server/reports/repository", () => ({
  getCurrentUserReport: vi.fn(async () => null),
}));

vi.mock("@/lib/planning/server/runs/repository", () => ({
  getCurrentUserRun: vi.fn(async () => null),
  listCurrentUserRuns: mocks.listRuns,
  summarizeCurrentUserRunActionProgressByRunId: mocks.summarizeActionProgress,
}));

vi.mock("@/lib/planning/store/startupMigrationGate", () => ({
  getPlanningStartupMigrationGateSnapshot: () => ({ sequence: 0 }),
  getPlanningStartupMigrationTelemetryContext: () => ({}),
}));

import { loadPlanningRunsPageInitialData } from "../../../src/lib/planning/server/pages/planningRscLoaders";

function rawRunWithIdempotencyMeta() {
  return {
    version: 1 as const,
    id: "run-1",
    profileId: "profile-1",
    createdAt: "2026-07-12T00:00:00.000Z",
    input: { horizonMonths: 12 },
    meta: {
      idempotency: {
        version: 1 as const,
        keyHash: "secret-key-hash",
        requestFingerprint: "secret-request-fingerprint",
        responseMeta: { generatedAt: "2026-07-12T00:00:00.000Z" },
      },
    },
    outputs: {},
    overallStatus: "SUCCESS" as const,
  };
}

describe("planning runs RSC response sanitizer", () => {
  beforeEach(() => {
    mocks.listRuns.mockReset();
    mocks.summarizeActionProgress.mockReset();
    mocks.listRuns.mockResolvedValue([rawRunWithIdempotencyMeta()]);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("strips internal idempotency metadata on the successful initial load", async () => {
    mocks.summarizeActionProgress.mockResolvedValue({});

    const loaded = await loadPlanningRunsPageInitialData({ initialFilterProfileId: "profile-1" });

    expect(loaded.runsReady).toBe(true);
    expect(loaded.runs).toHaveLength(1);
    expect(JSON.stringify(loaded)).not.toMatch(/idempotency|keyHash|requestFingerprint|responseMeta/);
  });

  it("keeps already loaded runs sanitized when action-progress hydration fails", async () => {
    mocks.summarizeActionProgress.mockRejectedValue(new Error("action progress unavailable"));

    const loaded = await loadPlanningRunsPageInitialData({ initialFilterProfileId: "profile-1" });

    expect(loaded.runsReady).toBe(false);
    expect(loaded.runs).toHaveLength(1);
    expect(loaded.loadNotice).toContain("화면에서 다시 불러옵니다");
    expect(JSON.stringify(loaded)).not.toMatch(/idempotency|keyHash|requestFingerprint|responseMeta/);
  });
});
