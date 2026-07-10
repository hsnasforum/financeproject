import { describe, expect, it, vi } from "vitest";
import {
  prepareCreatePlanningRunInputContext,
  type CreateRunAssumptionsContext,
} from "../../src/lib/planning/server/runs/createRunInputContext";
import { PlanningRunAssumptionsResolveError } from "../../src/lib/planning/server/v2/runAssumptionsRouteService";
import { type CreatePlanningRunCommand } from "../../src/lib/planning/server/runs/createRunCommandParser";
import { type CurrentUserRunRecord } from "../../src/lib/planning/server/runs/routeService";
import { type CurrentUserPlanningProfileRecord } from "../../src/lib/planning/server/profiles/repository";
import { type ProfileV2 } from "../../src/lib/planning/v2/types";

function sampleProfile(): ProfileV2 {
  return {
    monthlyIncomeNet: 4_000_000,
    monthlyEssentialExpenses: 1_500_000,
    monthlyDiscretionaryExpenses: 500_000,
    liquidAssets: 3_000_000,
    investmentAssets: 5_000_000,
    debts: [
      {
        id: "loan-1",
        name: "Loan 1",
        balance: 10_000_000,
        minimumPayment: 300_000,
        apr: 0.052,
        remainingMonths: 48,
        repaymentType: "amortizing",
      },
    ],
    goals: [
      {
        id: "goal-1",
        name: "Goal 1",
        targetAmount: 8_000_000,
        currentAmount: 1_000_000,
        targetMonth: 24,
        priority: 3,
      },
    ],
  };
}

function profileRecord(profile: ProfileV2 = sampleProfile()): CurrentUserPlanningProfileRecord {
  return {
    id: "profile-1",
    name: "Profile 1",
    profile,
    createdAt: "2026-07-03T00:00:00.000Z",
    updatedAt: "2026-07-03T00:00:00.000Z",
  };
}

function baseCommand(overrides: Partial<CreatePlanningRunCommand> = {}): CreatePlanningRunCommand {
  return {
    profileId: "profile-1",
    runRequestId: "request-1",
    title: "Input context run",
    horizonMonths: 12,
    policyId: "balanced",
    assumptionsOverride: {},
    runScenariosEnabled: false,
    getActionsEnabled: false,
    analyzeDebtEnabled: false,
    debtStrategyInput: {
      offers: [],
    },
    includeProducts: false,
    ...overrides,
  };
}

function assumptionsContext(): CreateRunAssumptionsContext {
  return {
    snapshot: null,
    snapshotMeta: { missing: true },
    baseAssumptions: {
      inflationPct: 2,
      investReturnPct: 4,
      cashReturnPct: 2,
      withdrawalRatePct: 4,
    },
    finalSimulationAssumptions: {
      inflation: 0.02,
      expectedReturn: 0.04,
    },
    health: {
      warnings: [],
      summary: {
        warningsCount: 0,
        criticalCount: 0,
        warningCodes: [],
        flags: {
          snapshotMissing: true,
          optimisticReturn: false,
          riskMismatch: false,
        },
      },
    },
    appliedOverrides: [],
  };
}

describe("create run input context", () => {
  it("maps a missing profile before resolving scenario or assumptions", async () => {
    const getRun = vi.fn(async () => null);
    const resolveAssumptions = vi.fn(async () => assumptionsContext());

    const result = await prepareCreatePlanningRunInputContext({
      command: baseCommand(),
      dependencies: {
        getProfile: vi.fn(async () => null),
        getRun,
        resolveAssumptions,
      },
    });

    expect(result).toEqual({
      ok: false,
      audit: {
        result: "ERROR",
        recordId: "profile-1",
        message: "profile not found",
      },
      error: {
        code: "NO_DATA",
        message: "프로필을 찾을 수 없습니다.",
      },
    });
    expect(getRun).not.toHaveBeenCalled();
    expect(resolveAssumptions).not.toHaveBeenCalled();
  });

  it("loads profile, applies input scenario, and resolves assumptions through injected dependencies", async () => {
    const resolvedAssumptions = assumptionsContext();
    const getProfile = vi.fn(async () => profileRecord());
    const getRun = vi.fn(async () => ({ id: "baseline-run" }) as CurrentUserRunRecord);
    const resolveAssumptions = vi.fn(async () => resolvedAssumptions);

    const result = await prepareCreatePlanningRunInputContext({
      command: baseCommand({
        requestedSnapshotId: "snapshot-1",
        assumptionsOverride: { inflationPct: 3 },
        scenarioInput: {
          baseRunId: "baseline-run",
          patch: [
            {
              op: "mul",
              field: "monthlyIncomeNet",
              value: 1.1,
            },
          ],
        },
      }),
      dependencies: {
        getProfile,
        getRun,
        resolveAssumptions,
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(getProfile).toHaveBeenCalledWith("profile-1");
    expect(getRun).toHaveBeenCalledWith("baseline-run");
    expect(resolveAssumptions).toHaveBeenCalledWith({
      profileId: "profile-1",
      requestedSnapshotId: "snapshot-1",
      assumptionsOverride: { inflationPct: 3 },
      riskTolerance: "mid",
    });
    expect(result.canonicalProfile.monthlyIncomeNet).toBe(4_400_000);
    expect(result.profileNormalization.fixesApplied.length).toBeGreaterThanOrEqual(1);
    expect(result.assumptionsContext).toBe(resolvedAssumptions);
  });

  it("maps missing scenario baseline to the existing route error contract", async () => {
    const result = await prepareCreatePlanningRunInputContext({
      command: baseCommand({
        scenarioInput: {
          baseRunId: "missing-run",
          patch: [
            {
              op: "set",
              field: "monthlyIncomeNet",
              value: 5_000_000,
            },
          ],
        },
      }),
      dependencies: {
        getProfile: vi.fn(async () => profileRecord()),
        getRun: vi.fn(async () => null),
        resolveAssumptions: vi.fn(async () => assumptionsContext()),
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.audit).toEqual({
      result: "ERROR",
      recordId: "profile-1",
      message: "scenario baseline run not found",
    });
    expect(result.error).toEqual({
      code: "INPUT",
      message: "scenario baseline runId를 찾을 수 없습니다.",
      status: 400,
      issues: ["input.scenario.baseRunId: 'missing-run' not found"],
    });
  });

  it("preserves the scenario apply audit message for input patch validation failures", async () => {
    const resolveAssumptions = vi.fn(async () => assumptionsContext());
    const result = await prepareCreatePlanningRunInputContext({
      command: baseCommand({
        scenarioInput: {
          patch: [
            {
              op: "set",
              field: "monthlyIncomeNet",
              value: -1,
            },
          ],
        },
      }),
      dependencies: {
        getProfile: vi.fn(async () => profileRecord()),
        getRun: vi.fn(async () => null),
        resolveAssumptions,
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.audit).toEqual({
      result: "ERROR",
      recordId: "profile-1",
      message: "scenario apply failed",
    });
    expect(result.error.code).toBe("INPUT");
    expect(result.error.message).toBe("scenario patch 검증에 실패했습니다.");
    expect(result.error.status).toBe(400);
    expect(result.error.issues?.length).toBeGreaterThan(0);
    expect(resolveAssumptions).not.toHaveBeenCalled();
  });

  it("preserves the scenario validation audit message for unsupported legacy patches", async () => {
    const resolveAssumptions = vi.fn(async () => assumptionsContext());
    const result = await prepareCreatePlanningRunInputContext({
      command: baseCommand({
        scenarioMeta: {
          id: "legacy-scenario",
          name: "Unsupported patch",
          createdAt: "2026-07-03T00:00:00.000Z",
          patches: [
            {
              path: "/unsupported",
              op: "set",
              value: 1,
            },
          ],
        },
      }),
      dependencies: {
        getProfile: vi.fn(async () => profileRecord()),
        getRun: vi.fn(async () => null),
        resolveAssumptions,
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.audit).toEqual({
      result: "ERROR",
      recordId: "profile-1",
      message: "scenario validation failed",
    });
    expect(result.error.code).toBe("INPUT");
    expect(result.error.issues?.length).toBeGreaterThan(0);
    expect(resolveAssumptions).not.toHaveBeenCalled();
  });

  it("stops at preflight blocks before resolving assumptions", async () => {
    const resolveAssumptions = vi.fn(async () => assumptionsContext());
    const result = await prepareCreatePlanningRunInputContext({
      command: baseCommand({
        requestedSnapshotId: "short",
      }),
      dependencies: {
        getProfile: vi.fn(async () => profileRecord()),
        getRun: vi.fn(async () => null),
        resolveAssumptions,
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.audit.recordId).toBe("profile-1");
    expect(result.audit.message).toContain("preflight blocked");
    expect(result.error.code).toBe("INPUT");
    expect(result.error.message).toBe("실행 저장 사전 점검에 실패했습니다.");
    expect(result.error.status).toBe(400);
    expect(result.error.issues?.some((issue) => issue.includes("SNAPSHOT_ID_TOO_SHORT"))).toBe(true);
    expect(result.error.meta).toHaveProperty("preflight.blocks");
    expect(resolveAssumptions).not.toHaveBeenCalled();
  });

  it("maps snapshot resolve failures without route dependencies", async () => {
    const result = await prepareCreatePlanningRunInputContext({
      command: baseCommand({ requestedSnapshotId: "missing-snapshot" }),
      dependencies: {
        getProfile: vi.fn(async () => profileRecord()),
        getRun: vi.fn(async () => null),
        resolveAssumptions: vi.fn(async () => {
          throw new PlanningRunAssumptionsResolveError({
            kind: "SNAPSHOT_NOT_FOUND",
            message: "snapshotId를 찾을 수 없습니다.",
            auditMessage: "snapshot not found",
            status: 400,
            issues: ["input.snapshotId: 'missing-snapshot' not found"],
          });
        }),
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.audit).toEqual({
      result: "ERROR",
      recordId: "profile-1",
      message: "snapshot not found",
    });
    expect(result.error).toEqual({
      code: "SNAPSHOT_NOT_FOUND",
      message: "snapshotId를 찾을 수 없습니다.",
      status: 400,
      issues: ["input.snapshotId: 'missing-snapshot' not found"],
    });
  });

  it.each([
    {
      kind: "SNAPSHOT" as const,
      message: "snapshot load failed",
      status: 503,
      expectedError: {
        code: "SNAPSHOT",
        message: "snapshot load failed",
        status: 503,
      },
    },
    {
      kind: "OVERRIDES" as const,
      message: "override load failed",
      status: 500,
      expectedError: {
        code: "INTERNAL",
        message: "저장된 가정 오버라이드 로드에 실패했습니다.",
        status: 500,
      },
    },
  ])("preserves $kind assumptions error mapping", async ({
    kind,
    message,
    status,
    expectedError,
  }) => {
    const result = await prepareCreatePlanningRunInputContext({
      command: baseCommand(),
      dependencies: {
        getProfile: vi.fn(async () => profileRecord()),
        getRun: vi.fn(async () => null),
        resolveAssumptions: vi.fn(async () => {
          throw new PlanningRunAssumptionsResolveError({
            kind,
            message,
            auditMessage: `${kind.toLowerCase()} resolve failed`,
            status,
          });
        }),
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.audit).toEqual({
      result: "ERROR",
      recordId: "profile-1",
      message: `${kind.toLowerCase()} resolve failed`,
    });
    expect(result.error).toEqual(expectedError);
  });
});
