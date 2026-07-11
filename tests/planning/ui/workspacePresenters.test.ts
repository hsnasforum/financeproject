import { describe, expect, it } from "vitest";
import { ASSUMPTIONS_FORM_DEFAULT } from "../../../src/app/planning/_lib/workspaceAssumptionsEditor";
import { type StepStatus } from "../../../src/app/planning/_lib/runPipeline";
import { type ProfileFormModel } from "../../../src/app/planning/_lib/profileFormModel";
import {
  buildWorkspaceExecutionGuardPresenter,
  buildWorkspaceQuickStartPresenter,
  buildWorkspaceResultPresenter,
} from "../../../src/components/planning/workspace/workspacePresenters";
import { type PlanningRunRecord } from "../../../src/lib/planning/store/types";
import { type ResultDtoV1 } from "../../../src/lib/planning/v2/resultDto";

function profileFixture(overrides?: Partial<ProfileFormModel>): ProfileFormModel {
  return {
    name: "테스트",
    monthlyIncomeNet: 4_800_000,
    monthlyEssentialExpenses: 1_900_000,
    monthlyDiscretionaryExpenses: 900_000,
    liquidAssets: 3_000_000,
    investmentAssets: 5_000_000,
    debts: [
      {
        id: "loan-1",
        name: "대출 1",
        balance: 20_000_000,
        aprPct: 4.8,
        monthlyPayment: 420_000,
        remainingMonths: 120,
        repaymentType: "amortizing",
      },
    ],
    goals: [],
    ...overrides,
  };
}

function savedRunFixture(overrides?: Partial<PlanningRunRecord>): PlanningRunRecord {
  return {
    version: 1,
    id: "run-1",
    profileId: "profile-1",
    createdAt: "2026-07-01T00:00:00.000Z",
    input: { horizonMonths: 120 },
    meta: {},
    outputs: {},
    overallStatus: "SUCCESS",
    ...overrides,
  };
}

function resultDtoFixture(overrides?: Partial<ResultDtoV1>): ResultDtoV1 {
  return {
    version: 1,
    meta: {
      generatedAt: "2026-07-01T00:00:00.000Z",
      snapshot: {},
    },
    summary: {},
    warnings: { aggregated: [] },
    goals: [],
    timeline: { points: [] },
    ...overrides,
  };
}

describe("workspacePresenters", () => {
  it("keeps execution guard preflight pure and blocks mismatched debt offers", () => {
    const presenter = buildWorkspaceExecutionGuardPresenter({
      profileForm: profileFixture(),
      effectiveSnapshotSelection: { mode: "latest" },
      assumptionsForm: ASSUMPTIONS_FORM_DEFAULT,
      assumptionsExtraOverrides: {},
      beginnerMode: false,
      effectiveRunDebtEnabled: true,
      debtOfferRows: [
        {
          rowId: "offer-1",
          liabilityId: "missing-loan",
          title: "테스트 제안",
          newAprPct: 3.9,
          feeKrw: 0,
        },
      ],
      effectiveRunMonteCarloEnabled: true,
      monteCarloPaths: "500",
      horizonMonths: "120",
    });

    expect(presenter.preflightHasBlockers).toBe(true);
    expect(presenter.preflightBlockIssues.map((issue) => issue.code)).toContain("DEBT_OFFER_ID_MISMATCH");
    expect(presenter.debtOffers).toEqual([
      { liabilityId: "missing-loan", newAprPct: 3.9, feeKrw: 0 },
    ]);
  });

  it("builds quick start next-step targets without controller state", () => {
    expect(buildWorkspaceQuickStartPresenter({
      selectedProfileId: "",
      profileSyncState: "missing",
      profileForm: profileFixture(),
      profileValidationErrorCount: 0,
      runHasSimulateResult: false,
      runMatchesCurrentProfile: false,
      runStatusReviewRequired: false,
      runNeedsWarningConfirmation: false,
      savedRun: null,
      reportsPageHref: "/planning/reports",
      selectedProfileReportHref: (runId) => `/planning/reports?runId=${runId}`,
    }).quickStartNextStep.targetId).toBe("planning-profile-create-button");

    const savedPresenter = buildWorkspaceQuickStartPresenter({
      selectedProfileId: "profile-1",
      profileSyncState: "saved",
      profileForm: profileFixture(),
      profileValidationErrorCount: 0,
      runHasSimulateResult: true,
      runMatchesCurrentProfile: true,
      runStatusReviewRequired: false,
      runNeedsWarningConfirmation: false,
      savedRun: savedRunFixture(),
      reportsPageHref: "/planning/reports?profileId=profile-1",
      selectedProfileReportHref: (runId) => `/planning/reports?profileId=profile-1&runId=${runId}`,
    });

    expect(savedPresenter.quickStartNextStep.targetId).toBe("planning-quickstart-report-button");
    expect(savedPresenter.quickStartVm.selectedRunReportHref).toBe("/planning/reports?profileId=profile-1&runId=run-1");
  });

  it("targets the warning confirmation control before a blocked quick-start run CTA", () => {
    const presenter = buildWorkspaceQuickStartPresenter({
      selectedProfileId: "profile-1",
      profileSyncState: "saved",
      profileForm: profileFixture(),
      profileValidationErrorCount: 0,
      runHasSimulateResult: false,
      runMatchesCurrentProfile: false,
      runStatusReviewRequired: false,
      runNeedsWarningConfirmation: true,
      savedRun: null,
      reportsPageHref: "/planning/reports?profileId=profile-1",
      selectedProfileReportHref: (runId) => `/planning/reports?profileId=profile-1&runId=${runId}`,
    });

    expect(presenter.quickStartNextStep).toMatchObject({
      label: "먼저 실행 경고 확인",
      targetId: "planning-run-warning-confirm-checkbox",
    });
  });

  it("builds result tabs and debug VM from DTO plus step statuses", () => {
    const currentStepStatuses: StepStatus[] = [
      {
        id: "monteCarlo",
        state: "SKIPPED",
        message: "예산 초과로 Monte Carlo를 건너뛰었습니다.",
      },
    ];
    const presenter = buildWorkspaceResultPresenter({
      resultDto: resultDtoFixture(),
      currentStepStatuses,
      showAllActions: false,
      beginnerMode: false,
    });

    expect(presenter.monteCarloBudgetSkipped).toBe(true);
    expect(presenter.tabs.map((tab) => tab.id)).toEqual(["summary", "warningsGoals", "monteCarlo"]);
    expect(presenter.warningsGoalsDebugSections.length).toBeGreaterThan(0);
  });
});
