import { describe, expect, it } from "vitest";
import {
  buildPlanningRunInput,
  parseHorizonMonths,
  parseJsonText,
  parseMaxCandidatesPerAction,
  parseMonteCarloPaths,
  parseMonteCarloSeed,
  resolveRunMatchesCurrentProfile,
  resolveRunStatusReviewRequired,
  resolveWorkspaceRuntimeSnapshotFallback,
  selectPreferredBaselineRunId,
} from "../../../src/components/planning/workspace/useWorkspaceRuntimeBundle";
import { parseCreatePlanningRunCommand } from "../../../src/lib/planning/server/runs/createRunCommandParser";
import { PLANNING_RUN_INPUT_CONTRACT } from "../../../src/lib/planning/v2/planningRunInputContract";
import { DEFAULT_PLANNING_POLICY } from "../../../src/lib/planning/v2/insights/planningPolicy";

function baselineRunFixture(id: string, overallStatus?: "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED") {
  return {
    id,
    createdAt: "2026-04-11T00:00:00.000Z",
    overallStatus,
  };
}

function savedRunFixture(profileHash?: string) {
  return {
    version: 1 as const,
    id: "run-1",
    profileId: "profile-1",
    createdAt: "2026-04-11T00:00:00.000Z",
    input: { horizonMonths: 120 },
    meta: {},
    outputs: {},
    ...(profileHash
      ? {
        reproducibility: {
          appVersion: "test",
          engineVersion: "planning-v2",
          profileHash,
          policy: DEFAULT_PLANNING_POLICY,
        },
      }
      : {}),
  };
}

describe("workspaceRuntimeBundle", () => {
  it("keeps preferred baseline selection stable", () => {
    const rows = [
      baselineRunFixture("run-failed", "FAILED"),
      baselineRunFixture("run-success", "SUCCESS"),
      baselineRunFixture("run-partial", "PARTIAL_SUCCESS"),
    ];

    expect(selectPreferredBaselineRunId(rows, "run-partial")).toBe("run-partial");
    expect(selectPreferredBaselineRunId(rows, "missing-run")).toBe("run-success");
    expect(selectPreferredBaselineRunId([baselineRunFixture("run-failed", "FAILED")], "")).toBe("");
  });

  it("keeps current profile hash review gating and run match checks", () => {
    const savedRun = savedRunFixture("hash-abc");

    expect(resolveRunStatusReviewRequired({
      profileSyncState: "saved",
      savedRun,
      selectedProfileId: "profile-1",
      currentProfileHashInput: "{\"profile\":1}",
      currentProfileHashState: { input: "{\"profile\":1}", hash: "hash-abc" },
    })).toBe(false);
    expect(resolveRunStatusReviewRequired({
      profileSyncState: "saved",
      savedRun,
      selectedProfileId: "profile-1",
      currentProfileHashInput: "{\"profile\":1}",
      currentProfileHashState: { input: "", hash: "" },
    })).toBe(true);
    expect(resolveRunMatchesCurrentProfile({
      runStatusReviewRequired: false,
      profileSyncState: "saved",
      savedRun,
      selectedProfileId: "profile-1",
      currentProfileHash: "hash-abc",
    })).toBe(true);
    expect(resolveRunMatchesCurrentProfile({
      runStatusReviewRequired: true,
      profileSyncState: "saved",
      savedRun,
      selectedProfileId: "profile-1",
      currentProfileHash: "hash-abc",
    })).toBe(false);
  });

  it("keeps snapshot-not-found fallback on latest selection", () => {
    expect(resolveWorkspaceRuntimeSnapshotFallback("SNAPSHOT_NOT_FOUND")).toEqual({ mode: "latest" });
    expect(resolveWorkspaceRuntimeSnapshotFallback("OTHER_CODE")).toBeNull();
  });

  it("keeps run/save/optimize helper bindings stable", () => {
    const runInput = buildPlanningRunInput({
      parsed: {
        profile: { monthlyIncomeNet: 4_200_000 },
        assumptions: { inflationPct: 2.3 },
        horizon: 120,
        snapshotId: "snapshot-1",
        policyId: "balanced",
        monteCarlo: { paths: 500, seed: 42 },
        actions: { includeProducts: true, maxCandidatesPerAction: 5 },
        debt: {
          offers: [{ liabilityId: "loan-1" }],
          options: { extraPaymentKrw: 200_000 },
        },
      },
      effectiveRunScenariosEnabled: true,
      effectiveRunActionsEnabled: true,
      effectiveRunDebtEnabled: true,
      effectiveRunMonteCarloEnabled: true,
      scenario: {
        title: "선택지출 -10%",
        baseRunId: "run-success",
        patch: [{ op: "mul", field: "monthlyDiscretionaryExpenses", value: 0.9 }],
      },
    });
    const parsedJson = parseJsonText<Record<string, unknown>>("Optimizer constraints", "{\"maxDebtServiceRatio\":0.6}");
    const invalidJson = parseJsonText("Optimizer search", "{invalid-json");

    expect(runInput).toMatchObject({
      horizonMonths: 120,
      policyId: "balanced",
      snapshotId: "snapshot-1",
      runScenarios: true,
      getActions: true,
      analyzeDebt: true,
      includeProducts: true,
      monteCarlo: { paths: 500, seed: 42 },
      scenario: { title: "선택지출 -10%", baseRunId: "run-success" },
      debtStrategy: {
        offers: [{ liabilityId: "loan-1" }],
        options: { extraPaymentKrw: 200_000 },
      },
    });
    expect(parsedJson).toEqual({
      value: { maxDebtServiceRatio: 0.6 },
      error: "",
    });
    expect(invalidJson).toEqual({
      value: null,
      error: "Optimizer search JSON 파싱에 실패했습니다.",
    });
  });

  it("keeps client parser boundaries synchronized with create-run parser contract", () => {
    const contract = PLANNING_RUN_INPUT_CONTRACT;

    expect(parseHorizonMonths(String(contract.horizonMonths.min))).toBe(contract.horizonMonths.min);
    expect(parseHorizonMonths(String(contract.horizonMonths.max))).toBe(contract.horizonMonths.max);
    expect(parseHorizonMonths(String(contract.horizonMonths.max + 1))).toBeNull();
    expect(parseMonteCarloPaths(String(contract.monteCarloPaths.max))).toBe(contract.monteCarloPaths.max);
    expect(parseMonteCarloPaths(String(contract.monteCarloPaths.max + 1))).toBeNull();
    expect(parseMonteCarloSeed("abc")).toBeNull();
    expect(parseMaxCandidatesPerAction(String(contract.maxCandidatesPerAction.max))).toBe(contract.maxCandidatesPerAction.max);
    expect(parseMaxCandidatesPerAction(String(contract.maxCandidatesPerAction.max + 1))).toBeNull();

    const accepted = parseCreatePlanningRunCommand({
      profileId: "profile-1",
      input: {
        horizonMonths: contract.horizonMonths.max,
        monteCarlo: {
          paths: contract.monteCarloPaths.max,
          seed: 7,
        },
      },
    }, {
      randomUUID: () => "run-request-1",
      now: () => new Date("2026-07-01T00:00:00.000Z"),
    });
    expect(accepted.ok).toBe(true);
    if (accepted.ok) {
      expect(accepted.command.horizonMonths).toBe(contract.horizonMonths.max);
      expect(accepted.command.monteCarloConfig).toEqual({
        paths: contract.monteCarloPaths.max,
        seed: 7,
      });
    }

    const rejectedHorizon = parseCreatePlanningRunCommand({
      profileId: "profile-1",
      input: { horizonMonths: contract.horizonMonths.max + 1 },
    });
    const rejectedMonteCarlo = parseCreatePlanningRunCommand({
      profileId: "profile-1",
      input: {
        horizonMonths: contract.horizonMonths.max,
        monteCarlo: { paths: contract.monteCarloPaths.max + 1 },
      },
    });

    expect(rejectedHorizon.ok).toBe(false);
    if (!rejectedHorizon.ok) {
      expect(rejectedHorizon.issues?.join("\n")).toContain("horizonMonths");
    }
    expect(rejectedMonteCarlo.ok).toBe(false);
    if (!rejectedMonteCarlo.ok) {
      expect(rejectedMonteCarlo.issues?.join("\n")).toContain("input.monteCarlo.paths");
    }
  });
});
