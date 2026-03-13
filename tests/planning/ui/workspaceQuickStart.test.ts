import { describe, expect, it } from "vitest";
import {
  buildWorkspaceLiveSummary,
  buildWorkspaceQuickStartVm,
  isWorkspaceQuickStartProfileDone,
  resolveWorkspaceSelectedProfileSyncState,
} from "../../../src/app/planning/_lib/workspaceQuickStart";
import { toProfileJson, type ProfileFormModel } from "../../../src/app/planning/_lib/profileFormModel";

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

describe("workspaceQuickStart", () => {
  it("builds live summary from profile form values", () => {
    const summary = buildWorkspaceLiveSummary(profileFixture());

    expect(summary.monthlySurplus).toBe(2_000_000);
    expect(summary.totalMonthlyDebtPayment).toBe(420_000);
    expect(summary.dsrPct).toBeCloseTo(8.75);
    expect(summary.emergencyTargetKrw).toBe(16_800_000);
    expect(summary.emergencyGapKrw).toBe(13_800_000);
  });

  it("builds pre-run quick start state after profile save", () => {
    const vm = buildWorkspaceQuickStartVm({
      selectedProfileId: "profile-1",
      profileSyncState: "saved",
      beginnerStepProfileDone: false,
      beginnerStepRunDone: false,
      beginnerStepSaveDone: false,
      reportsPageHref: "/planning/reports?profileId=profile-1",
      selectedProfileReportHref: (runId) => `/planning/reports?profileId=profile-1&runId=${runId}`,
      formatRunOverallStatus: () => "성공",
    });

    expect(vm.title).toContain("이제 첫 실행만 남았습니다");
    expect(vm.description).toContain("빈 항목은 아래에서 계속 보완");
    expect(vm.completedSummary).toBe("프로필 저장 완료");
    expect(vm.nextStepSummary).toBe("첫 실행 시작");
    expect(vm.progressItems).toEqual([
      { label: "프로필 저장", state: "done", stateLabel: "완료" },
      { label: "첫 실행", state: "current", stateLabel: "다음" },
      { label: "리포트/비교", state: "pending", stateLabel: "대기" },
    ]);
    expect(vm.tone).toBe("border-amber-200 bg-amber-50");
    expect(vm.selectedRunReportHref).toBe("/planning/reports?profileId=profile-1");
    expect(vm.runStatusReviewRequired).toBe(false);
  });

  it("builds neutral quick start guidance when saved run matching cannot be verified", () => {
    const vm = buildWorkspaceQuickStartVm({
      selectedProfileId: "profile-1",
      profileSyncState: "saved",
      beginnerStepProfileDone: true,
      beginnerStepRunDone: false,
      beginnerStepSaveDone: false,
      runStatusReviewRequired: true,
      savedRunId: "run-1",
      savedRunOverallStatus: "SUCCESS",
      reportsPageHref: "/planning/reports?profileId=profile-1",
      selectedProfileReportHref: (runId) => `/planning/reports?profileId=profile-1&runId=${runId}`,
      formatRunOverallStatus: () => "성공",
    });

    expect(vm.title).toBe("최근 실행 상태를 자동 확인하지 못했습니다. 진행 상태를 다시 확인해 주세요.");
    expect(vm.description).toContain("아래 실행 내역에서 진행 상태를 다시 확인");
    expect(vm.completedSummary).toBe("프로필 저장 완료 · 실행 상태 확인 필요");
    expect(vm.nextStepSummary).toBe("진행 상태 다시 확인");
    expect(vm.progressItems).toEqual([
      { label: "프로필 저장", state: "done", stateLabel: "완료" },
      { label: "첫 실행", state: "current", stateLabel: "확인 필요" },
      { label: "리포트/비교", state: "pending", stateLabel: "대기" },
    ]);
    expect(vm.tone).toBe("border-amber-200 bg-amber-50");
    expect(vm.runStatusReviewRequired).toBe(true);
  });

  it("builds saved quick start state with report href", () => {
    const vm = buildWorkspaceQuickStartVm({
      selectedProfileId: "profile-1",
      profileSyncState: "saved",
      beginnerStepProfileDone: true,
      beginnerStepRunDone: true,
      beginnerStepSaveDone: true,
      savedRunId: "run-1",
      savedRunOverallStatus: "SUCCESS",
      reportsPageHref: "/planning/reports?profileId=profile-1",
      selectedProfileReportHref: (runId) => `/planning/reports?profileId=profile-1&runId=${runId}`,
      formatRunOverallStatus: (status) => (status === "SUCCESS" ? "성공" : "대기"),
    });

    expect(vm.title).toContain("결과 저장까지 완료");
    expect(vm.description).toBe("최근 저장 상태: 성공 · 리포트와 실행 기록에서 비교를 이어갈 수 있습니다.");
    expect(vm.completedSummary).toBe("프로필 저장 완료 · 첫 실행 완료");
    expect(vm.nextStepSummary).toBe("리포트 열기 또는 실행 내역 비교");
    expect(vm.progressItems).toEqual([
      { label: "프로필 저장", state: "done", stateLabel: "완료" },
      { label: "첫 실행", state: "done", stateLabel: "완료" },
      { label: "리포트/비교", state: "current", stateLabel: "다음" },
    ]);
    expect(vm.tone).toBe("border-slate-200 bg-slate-50");
    expect(vm.selectedRunReportHref).toBe("/planning/reports?profileId=profile-1&runId=run-1");
  });

  it("degrades quickstart guidance when the selected profile has unsaved edits", () => {
    const profileSyncState = resolveWorkspaceSelectedProfileSyncState({
      selectedProfileId: "profile-1",
      selectedProfile: {
        name: "저장본",
        profile: toProfileJson(profileFixture()) as unknown as Record<string, unknown>,
      },
      profileForm: profileFixture({ monthlyDiscretionaryExpenses: 1_100_000 }),
      profileName: "저장본",
    });

    expect(profileSyncState).toBe("dirty");

    const vm = buildWorkspaceQuickStartVm({
      selectedProfileId: "profile-1",
      profileSyncState,
      beginnerStepProfileDone: true,
      beginnerStepRunDone: false,
      beginnerStepSaveDone: false,
      reportsPageHref: "/planning/reports?profileId=profile-1",
      selectedProfileReportHref: (runId) => `/planning/reports?profileId=profile-1&runId=${runId}`,
      formatRunOverallStatus: () => "성공",
    });

    expect(vm.title).toContain("미저장 변경이 있습니다");
    expect(vm.description).toContain("1단계를 완료로 보지 않습니다");
    expect(vm.completedSummary).toBe("선택한 프로필 있음 · 미저장 변경 있음");
    expect(vm.nextStepSummary).toBe("프로필 저장");
    expect(vm.progressItems).toEqual([
      { label: "프로필 저장", state: "current", stateLabel: "다음" },
      { label: "첫 실행", state: "pending", stateLabel: "대기" },
      { label: "리포트/비교", state: "pending", stateLabel: "대기" },
    ]);
    expect(vm.tone).toBe("border-amber-200 bg-amber-50");
  });

  it("treats multiple normalization suggestions as dirty before quickstart follow-through", () => {
    const profileSyncState = resolveWorkspaceSelectedProfileSyncState({
      selectedProfileId: "profile-1",
      selectedProfile: {
        name: "저장본",
        profile: toProfileJson(profileFixture()) as unknown as Record<string, unknown>,
      },
      profileForm: profileFixture(),
      profileName: "저장본",
      pendingSuggestionsCount: 2,
    });

    expect(profileSyncState).toBe("dirty");

    const vm = buildWorkspaceQuickStartVm({
      selectedProfileId: "profile-1",
      profileSyncState,
      beginnerStepProfileDone: true,
      beginnerStepRunDone: false,
      beginnerStepSaveDone: false,
      reportsPageHref: "/planning/reports?profileId=profile-1",
      selectedProfileReportHref: (runId) => `/planning/reports?profileId=profile-1&runId=${runId}`,
      formatRunOverallStatus: () => "성공",
    });

    expect(vm.completedSummary).toBe("선택한 프로필 있음 · 미저장 변경 있음");
    expect(vm.nextStepSummary).toBe("프로필 저장");
  });

  it("requires income, expenses, and assets before marking profile step complete", () => {
    expect(isWorkspaceQuickStartProfileDone(profileFixture(), 0)).toBe(true);
    expect(isWorkspaceQuickStartProfileDone(profileFixture({ monthlyEssentialExpenses: 0, monthlyDiscretionaryExpenses: 0 }), 0)).toBe(false);
    expect(isWorkspaceQuickStartProfileDone(profileFixture({ liquidAssets: 0, investmentAssets: 0 }), 0)).toBe(false);
    expect(isWorkspaceQuickStartProfileDone(profileFixture({ monthlyIncomeNet: 0 }), 0)).toBe(false);
    expect(isWorkspaceQuickStartProfileDone(profileFixture(), 1)).toBe(false);
  });
});
