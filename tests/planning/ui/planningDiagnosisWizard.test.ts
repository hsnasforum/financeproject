import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlanningDiagnosisWizard } from "../../../src/components/planning/PlanningDiagnosisWizard";
import type { PlanningDiagnosisWizardController } from "../../../src/components/planning/workspace/usePlanningDiagnosisWizard";
import { validateProfileForm } from "../../../src/lib/planning/ui/profileFormModel";
import {
  DIAGNOSIS_EXAMPLE_DRAFT,
  buildDiagnosisProfileForm,
  buildDiagnosisSubmission,
  buildDiagnosisSummary,
  createDiagnosisSessionStore,
  createEmptyDiagnosisDraft,
  createInitialDiagnosisState,
  diagnosisDebtFieldId,
  diagnosisFieldId,
  diagnosisGoalFieldId,
  estimateDiagnosisDebtPayment,
  isDiagnosisDirty,
  listDiagnosisAppliedDefaults,
  parseDiagnosisNumber,
  planningDiagnosisSession,
  reduceDiagnosisState,
  resolveDiagnosisNext,
  resolvePlanningWorkspaceEntry,
  syncDiagnosisBeforeUnload,
  validateDiagnosisStep,
  type DiagnosisAction,
  type DiagnosisDebtDraft,
  type DiagnosisDraft,
  type DiagnosisGoalDraft,
  type DiagnosisSessionState,
} from "../../../src/lib/planning/ui/planningDiagnosisWizard";

function completeDraft(overrides: Partial<DiagnosisDraft> = {}): DiagnosisDraft {
  return {
    ...createEmptyDiagnosisDraft(),
    profileName: "내 프로필",
    monthlyIncomeNet: "3,000,000",
    monthlyEssentialExpenses: "1,000,000",
    monthlyDiscretionaryExpenses: "0",
    liquidAssets: "0",
    investmentAssets: "0",
    debtChoice: "none",
    goalChoice: "none",
    horizonMonths: "12",
    ...overrides,
  };
}

function debtRow(overrides: Partial<DiagnosisDebtDraft> = {}): DiagnosisDebtDraft {
  return {
    id: "debt-1",
    name: "학자금",
    balance: "10,000,000",
    aprPct: "3.5",
    monthlyPayment: "200,000",
    remainingMonths: "60",
    repaymentType: "amortizing",
    ...overrides,
  };
}

function goalRow(overrides: Partial<DiagnosisGoalDraft> = {}): DiagnosisGoalDraft {
  return {
    id: "goal-1",
    name: "여행",
    targetAmount: "5,000,000",
    currentAmount: "0",
    targetMonth: "24",
    priority: "",
    minimumMonthlyContribution: "",
    ...overrides,
  };
}

function apply(state: DiagnosisSessionState, ...actions: DiagnosisAction[]): DiagnosisSessionState {
  return actions.reduce(reduceDiagnosisState, state);
}

function fieldIds(draft: DiagnosisDraft, step: 1 | 2 | 3 | 4 | 5): string[] {
  return validateDiagnosisStep(draft, step).map((issue) => issue.fieldId);
}

function wizardFixture(overrides: Partial<PlanningDiagnosisWizardController> = {}): PlanningDiagnosisWizardController {
  const state = createInitialDiagnosisState();
  return {
    state,
    dirty: false,
    issues: validateDiagnosisStep(state.draft, 1),
    showIssues: false,
    guard: { blockers: [], warnings: [], signature: "" },
    conditions: [],
    appliedDefaults: [],
    summary: [],
    canSubmit: false,
    goNext: vi.fn(),
    goPrevious: vi.fn(),
    dispatch: vi.fn(),
    loadExample: vi.fn(),
    requestReset: vi.fn(),
    submit: vi.fn(),
    ...overrides,
  };
}

describe("planning diagnosis draft", () => {
  it("starts every input blank with no selected default", () => {
    const draft = createEmptyDiagnosisDraft();
    const { debts, goals, ...texts } = draft;
    expect(debts).toEqual([]);
    expect(goals).toEqual([]);
    expect(Object.values(texts).every((value) => value === "")).toBe(true);
  });

  it("tells blank, zero and invalid apart before any number conversion", () => {
    expect(parseDiagnosisNumber("")).toEqual({ kind: "blank" });
    expect(parseDiagnosisNumber("   ")).toEqual({ kind: "blank" });
    expect(parseDiagnosisNumber("0")).toEqual({ kind: "value", value: 0 });
    expect(parseDiagnosisNumber("1,234,567")).toEqual({ kind: "value", value: 1_234_567 });
    expect(parseDiagnosisNumber("4.5")).toEqual({ kind: "value", value: 4.5 });
    expect(parseDiagnosisNumber("-1")).toEqual({ kind: "value", value: -1 });
    expect(parseDiagnosisNumber("abc")).toEqual({ kind: "invalid" });
    expect(parseDiagnosisNumber("1e3")).toEqual({ kind: "invalid" });
    expect(parseDiagnosisNumber("0x10")).toEqual({ kind: "invalid" });
  });

  it("requires a profile name and leaves birth year, gender and region optional", () => {
    expect(fieldIds(createEmptyDiagnosisDraft(), 1)).toEqual([diagnosisFieldId("profileName")]);
    expect(fieldIds(completeDraft({ profileName: "   " }), 1)).toEqual([diagnosisFieldId("profileName")]);
    expect(fieldIds(completeDraft(), 1)).toEqual([]);
    expect(validateDiagnosisStep(completeDraft({ birthYear: "1800" }), 1)).toEqual([
      expect.objectContaining({ fieldId: diagnosisFieldId("birthYear"), kind: "range" }),
    ]);
    expect(validateDiagnosisStep(completeDraft({ birthYear: "1990.5" }), 1)).toEqual([
      expect.objectContaining({ fieldId: diagnosisFieldId("birthYear"), kind: "invalid" }),
    ]);
  });

  it("treats zero as a real answer and blank as missing for income and expenses", () => {
    const blank = createEmptyDiagnosisDraft();
    expect(validateDiagnosisStep(blank, 2).map((issue) => [issue.fieldId, issue.kind])).toEqual([
      [diagnosisFieldId("monthlyIncomeNet"), "missing"],
      [diagnosisFieldId("monthlyEssentialExpenses"), "missing"],
      [diagnosisFieldId("monthlyDiscretionaryExpenses"), "missing"],
    ]);
    expect(fieldIds(completeDraft({ monthlyIncomeNet: "0", monthlyEssentialExpenses: "0" }), 2)).toEqual([]);
    expect(validateDiagnosisStep(completeDraft({ monthlyIncomeNet: "abc" }), 2)[0]).toMatchObject({ kind: "invalid" });
    expect(validateDiagnosisStep(completeDraft({ monthlyIncomeNet: "-1" }), 2)[0]).toMatchObject({
      fieldId: diagnosisFieldId("monthlyIncomeNet"),
      kind: "range",
    });
  });

  it("asks for an explicit debt answer and at least one complete row when there is debt", () => {
    expect(fieldIds(completeDraft({ debtChoice: "" }), 3)).toEqual([diagnosisFieldId("debtChoice")]);
    expect(fieldIds(completeDraft({ liquidAssets: "" }), 3)).toEqual([diagnosisFieldId("liquidAssets")]);
    expect(fieldIds(completeDraft({ debtChoice: "some" }), 3)).toEqual([diagnosisFieldId("debtAdd")]);
    expect(fieldIds(completeDraft({ debtChoice: "none", debts: [debtRow({ name: "" })] }), 3)).toEqual([]);

    const blankRow = debtRow({
      name: "", balance: "", aprPct: "", monthlyPayment: "", remainingMonths: "", repaymentType: "",
    });
    expect(fieldIds(completeDraft({ debtChoice: "some", debts: [blankRow] }), 3)).toEqual([
      diagnosisDebtFieldId(0, "name"),
      diagnosisDebtFieldId(0, "balance"),
      diagnosisDebtFieldId(0, "aprPct"),
      diagnosisDebtFieldId(0, "monthlyPayment"),
      diagnosisDebtFieldId(0, "remainingMonths"),
      diagnosisDebtFieldId(0, "repaymentType"),
    ]);
  });

  it("reuses the existing debt range rules and stops silent month clamping", () => {
    const zeroRate = completeDraft({ debtChoice: "some", debts: [debtRow({ aprPct: "0" })] });
    expect(fieldIds(zeroRate, 3)).toEqual([]);

    const noPayment = completeDraft({ debtChoice: "some", debts: [debtRow({ monthlyPayment: "0" })] });
    expect(validateDiagnosisStep(noPayment, 3)).toEqual([
      expect.objectContaining({ fieldId: diagnosisDebtFieldId(0, "monthlyPayment"), kind: "range" }),
    ]);
    const secondRow = completeDraft({
      debtChoice: "some",
      debts: [debtRow(), debtRow({ id: "debt-2", aprPct: "150" })],
    });
    expect(validateDiagnosisStep(secondRow, 3)).toEqual([
      expect.objectContaining({ fieldId: diagnosisDebtFieldId(1, "aprPct"), kind: "range" }),
    ]);
    const tooLong = completeDraft({ debtChoice: "some", debts: [debtRow({ remainingMonths: "601" })] });
    expect(validateDiagnosisStep(tooLong, 3)).toEqual([
      expect.objectContaining({ fieldId: diagnosisDebtFieldId(0, "remainingMonths"), kind: "range" }),
    ]);
  });

  it("asks for an explicit goal answer and keeps priority and minimum contribution optional", () => {
    expect(fieldIds(completeDraft({ goalChoice: "" }), 4)).toEqual([diagnosisFieldId("goalChoice")]);
    expect(fieldIds(completeDraft({ goalChoice: "some" }), 4)).toEqual([diagnosisFieldId("goalAdd")]);
    expect(fieldIds(completeDraft({ goalChoice: "some", goals: [goalRow()] }), 4)).toEqual([]);
    expect(fieldIds(completeDraft({
      goalChoice: "some",
      goals: [goalRow({ name: "", targetAmount: "", currentAmount: "", targetMonth: "" })],
    }), 4)).toEqual([
      diagnosisGoalFieldId(0, "name"),
      diagnosisGoalFieldId(0, "targetAmount"),
      diagnosisGoalFieldId(0, "currentAmount"),
      diagnosisGoalFieldId(0, "targetMonth"),
    ]);
    expect(validateDiagnosisStep(completeDraft({
      goalChoice: "some",
      goals: [goalRow({ targetAmount: "100", currentAmount: "200" })],
    }), 4)[0]).toMatchObject({ fieldId: diagnosisGoalFieldId(0, "targetAmount"), kind: "range" });
    expect(validateDiagnosisStep(completeDraft({
      goalChoice: "some",
      goals: [goalRow({ priority: "6" })],
    }), 4)[0]).toMatchObject({ fieldId: diagnosisGoalFieldId(0, "priority"), kind: "range" });
  });

  it("requires an analysis period within the run contract", () => {
    expect(validateDiagnosisStep(completeDraft({ horizonMonths: "" }), 5)[0]).toMatchObject({ kind: "missing" });
    expect(validateDiagnosisStep(completeDraft({ horizonMonths: "0" }), 5)[0]).toMatchObject({ kind: "range" });
    expect(validateDiagnosisStep(completeDraft({ horizonMonths: "1201" }), 5)[0]).toMatchObject({ kind: "range" });
    expect(fieldIds(completeDraft({ horizonMonths: "1" }), 5)).toEqual([]);
    expect(fieldIds(completeDraft({ horizonMonths: "1200" }), 5)).toEqual([]);
  });
});

describe("planning diagnosis submission payload", () => {
  it("never turns a blank into a saved zero", () => {
    expect(buildDiagnosisSubmission(completeDraft({ monthlyDiscretionaryExpenses: "" }))).toMatchObject({ ok: false });
    expect(() => buildDiagnosisProfileForm(completeDraft({ monthlyIncomeNet: "" }))).toThrow();
  });

  it("keeps an explicit zero as zero", () => {
    const result = buildDiagnosisSubmission(completeDraft({ monthlyIncomeNet: "0", liquidAssets: "0" }));
    expect(result).toMatchObject({ ok: true, profile: { monthlyIncomeNet: 0, liquidAssets: 0 } });
  });

  it("sends empty arrays for 'none' while the draft keeps the typed rows", () => {
    const draft = completeDraft({
      debtChoice: "none",
      goalChoice: "none",
      debts: [debtRow({ name: "" })],
      goals: [goalRow({ name: "" })],
    });
    const result = buildDiagnosisSubmission(draft);
    expect(result).toMatchObject({ ok: true, profile: { debts: [], goals: [] } });
    expect(draft.debts).toHaveLength(1);
    expect(draft.goals).toHaveLength(1);
  });

  it("carries explicit rows and optional values into the existing profile form", () => {
    const form = buildDiagnosisProfileForm(completeDraft({
      birthYear: "1990",
      gender: "F",
      sido: "서울특별시",
      debtChoice: "some",
      debts: [debtRow()],
      goalChoice: "some",
      goals: [goalRow()],
    }));
    expect(validateProfileForm(form).errors).toEqual([]);
    expect(form).toMatchObject({
      name: "내 프로필",
      birthYear: 1990,
      gender: "F",
      sido: "서울특별시",
      debts: [{ id: "debt-1", balance: 10_000_000, aprPct: 3.5, monthlyPayment: 200_000, remainingMonths: 60, repaymentType: "amortizing" }],
      goals: [{ id: "goal-1", targetAmount: 5_000_000, currentAmount: 0, targetMonth: 24, priority: 3, minimumMonthlyContribution: 0 }],
    });
    expect(listDiagnosisAppliedDefaults(completeDraft({ goalChoice: "some", goals: [goalRow()] })).join(" "))
      .toContain("우선순위 3");
    expect(listDiagnosisAppliedDefaults(completeDraft())).toEqual([]);
  });

  it("reports unit and rate warnings without blocking the draft", () => {
    const result = buildDiagnosisSubmission(completeDraft({ liquidAssets: "5,000" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.join(" ")).toContain("유동자산이 만원 단위");
    expect(result.warnings.join(" ")).not.toContain("UNIT_SUSPECTED:");
  });
});

describe("planning diagnosis example", () => {
  it("holds the approved synthetic household", () => {
    expect(DIAGNOSIS_EXAMPLE_DRAFT).toMatchObject({
      profileName: "예시 1인 가구",
      birthYear: "",
      gender: "",
      sido: "",
      sigungu: "",
      horizonMonths: "120",
    });
    const result = buildDiagnosisSubmission(DIAGNOSIS_EXAMPLE_DRAFT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile).toMatchObject({
      monthlyIncomeNet: 4_100_000,
      monthlyEssentialExpenses: 2_000_000,
      monthlyDiscretionaryExpenses: 700_000,
      liquidAssets: 20_000_000,
      investmentAssets: 30_000_000,
    });
    expect(result.form.debts).toEqual([expect.objectContaining({
      name: "예시 주거대출",
      balance: 60_000_000,
      aprPct: 4.5,
      remainingMonths: 120,
      repaymentType: "amortizing",
      monthlyPayment: 621_830,
    })]);
    expect(result.form.goals).toEqual([expect.objectContaining({
      name: "예시 목돈 마련",
      targetAmount: 30_000_000,
      currentAmount: 0,
      targetMonth: 36,
      priority: 3,
      minimumMonthlyContribution: 0,
    })]);
  });

  it("shows the monthly margin after the regular debt payment", () => {
    const rows = buildDiagnosisSummary(DIAGNOSIS_EXAMPLE_DRAFT);
    expect(rows).toContainEqual({ label: "월 운영여유", value: "778,170원" });
  });

  it("matches the regular payment with the existing estimator and needs complete inputs", () => {
    expect(estimateDiagnosisDebtPayment(DIAGNOSIS_EXAMPLE_DRAFT.debts[0]!)).toBe(621_830);
    expect(estimateDiagnosisDebtPayment(debtRow({ repaymentType: "" }))).toBeNull();
    expect(estimateDiagnosisDebtPayment(debtRow({ balance: "" }))).toBeNull();
  });
});

describe("planning diagnosis session state", () => {
  it("loads the example as an independent copy and keeps the badge through edits and back", () => {
    let state = apply(createInitialDiagnosisState(), { type: "loadExample" });
    expect(state.exampleLoaded).toBe(true);
    expect(state.draft).toEqual(DIAGNOSIS_EXAMPLE_DRAFT);
    expect(state.draft).not.toBe(DIAGNOSIS_EXAMPLE_DRAFT);

    state = apply(state,
      { type: "setField", field: "profileName", value: "수정한 이름" },
      { type: "updateDebt", index: 0, patch: { balance: "1,000,000" } },
      { type: "goToStep", step: 3 },
      { type: "goToStep", step: 2 });
    expect(state.exampleLoaded).toBe(true);
    expect(state.draft.profileName).toBe("수정한 이름");
    expect(state.draft.debts[0]?.balance).toBe("1,000,000");
    expect(DIAGNOSIS_EXAMPLE_DRAFT.debts[0]?.balance).toBe("60,000,000");
    expect(state.step).toBe(2);
  });

  it("restores debt and goal rows when the answer flips back to 'some'", () => {
    const state = apply(createInitialDiagnosisState(),
      { type: "setDebtChoice", value: "some" },
      { type: "addDebt" },
      { type: "updateDebt", index: 0, patch: { name: "학자금" } },
      { type: "setDebtChoice", value: "none" },
      { type: "setGoalChoice", value: "some" },
      { type: "addGoal" },
      { type: "updateGoal", index: 0, patch: { name: "여행" } },
      { type: "setGoalChoice", value: "none" });
    expect(state.draft.debts[0]?.name).toBe("학자금");
    expect(state.draft.goals[0]?.name).toBe("여행");

    const back = apply(state, { type: "setDebtChoice", value: "some" }, { type: "setGoalChoice", value: "some" });
    expect(back.draft.debts[0]?.name).toBe("학자금");
    expect(back.draft.goals[0]?.name).toBe("여행");
  });

  it("gives added rows unique ids and blocks 'some' after the last row is removed", () => {
    let state = apply(createInitialDiagnosisState(),
      { type: "setDebtChoice", value: "some" },
      { type: "addDebt" },
      { type: "addDebt" },
      { type: "removeDebt", index: 0 },
      { type: "addDebt" });
    expect(new Set(state.draft.debts.map((row) => row.id)).size).toBe(2);
    state = apply(state, { type: "removeDebt", index: 0 }, { type: "removeDebt", index: 0 });
    expect(state.draft.debts).toEqual([]);
    expect(fieldIds(state.draft, 3)).toContain(diagnosisFieldId("debtAdd"));
  });

  it("clears the district when the province changes", () => {
    const state = apply(createInitialDiagnosisState(),
      { type: "setField", field: "sido", value: "서울특별시" },
      { type: "setField", field: "sigungu", value: "종로구" },
      { type: "setField", field: "sido", value: "부산광역시" });
    expect(state.draft.sigungu).toBe("");
  });

  it("clears draft and badge only on an explicit reset", () => {
    const state = apply(createInitialDiagnosisState(), { type: "loadExample" }, { type: "goToStep", step: 4 });
    expect(apply(state, { type: "reset" })).toEqual(createInitialDiagnosisState());
  });

  it("blocks moving forward until the current step is complete and points at the first gap", () => {
    const blocked = resolveDiagnosisNext(createInitialDiagnosisState());
    expect(blocked).toEqual({ advance: false, focusFieldId: diagnosisFieldId("profileName") });

    const named = apply(createInitialDiagnosisState(), { type: "setField", field: "profileName", value: "이름" });
    expect(resolveDiagnosisNext(named)).toEqual({ advance: true, nextStep: 2 });
    expect(resolveDiagnosisNext({ ...named, step: 5 })).toMatchObject({ advance: false });
  });

  it("keeps the session across a remount through the shared store", () => {
    const store = createDiagnosisSessionStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.dispatch({ type: "loadExample" });
    store.dispatch({ type: "goToStep", step: 3 });
    unsubscribe();
    store.dispatch({ type: "goToStep", step: 4 });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.getState()).toMatchObject({ step: 4, exampleLoaded: true });
    expect(store.getServerState()).toEqual(createInitialDiagnosisState());
  });
});

describe("planning diagnosis unsaved warning", () => {
  it("stays quiet for the blank start and arms for any typed value, row, answer or example", () => {
    const initial = createInitialDiagnosisState();
    expect(isDiagnosisDirty(initial)).toBe(false);
    expect(isDiagnosisDirty(apply(initial, { type: "goToStep", step: 2 }))).toBe(false);
    expect(isDiagnosisDirty(apply(initial, { type: "setField", field: "liquidAssets", value: "0" }))).toBe(true);
    expect(isDiagnosisDirty(apply(initial, { type: "setDebtChoice", value: "none" }))).toBe(true);
    expect(isDiagnosisDirty(apply(initial, { type: "addGoal" }))).toBe(true);
    expect(isDiagnosisDirty(apply(initial, { type: "loadExample" }))).toBe(true);
  });

  it("registers one real listener that fulfils both browser contracts and removes it", () => {
    const target = new EventTarget();
    // Node's Event has the legacy boolean returnValue; a real BeforeUnloadEvent carries a string.
    const beforeUnload = () => {
      const event = new Event("beforeunload", { cancelable: true });
      Object.defineProperty(event, "returnValue", { value: "", writable: true });
      return event as BeforeUnloadEvent;
    };

    const quiet = syncDiagnosisBeforeUnload(target, false);
    const quietEvent = beforeUnload();
    target.dispatchEvent(quietEvent);
    expect(quietEvent.defaultPrevented).toBe(false);
    quiet();

    const cleanup = syncDiagnosisBeforeUnload(target, true);
    const armed = beforeUnload();
    target.dispatchEvent(armed);
    expect(armed.defaultPrevented).toBe(true);
    expect(typeof armed.returnValue).toBe("string");
    expect(armed.returnValue).not.toBe("");

    cleanup();
    const released = beforeUnload();
    target.dispatchEvent(released);
    expect(released.defaultPrevented).toBe(false);
    expect(released.returnValue).toBe("");
  });
});

describe("planning workspace entry", () => {
  const beginner = { beginnerMode: true, beginnerModeLoaded: true };

  it.each([
    ["blank visit", { initialSelectedProfileId: "", view: null, ...beginner }, "wizard"],
    ["unknown view", { initialSelectedProfileId: "", view: "other", ...beginner }, "wizard"],
    ["explicit full view", { initialSelectedProfileId: "", view: "full", ...beginner }, "full"],
    ["explicit profile", { initialSelectedProfileId: "profile-1", view: null, ...beginner }, "full"],
    ["advanced mode", { initialSelectedProfileId: "", view: null, beginnerMode: false, beginnerModeLoaded: true }, "full"],
    ["mode still loading", { initialSelectedProfileId: "", view: null, beginnerMode: true, beginnerModeLoaded: false }, "pending"],
    ["full view while loading", { initialSelectedProfileId: "", view: "full", beginnerMode: true, beginnerModeLoaded: false }, "full"],
    ["profile while loading", { initialSelectedProfileId: "profile-1", view: null, beginnerMode: true, beginnerModeLoaded: false }, "full"],
  ])("%s", (_name, input, expected) => {
    expect(resolvePlanningWorkspaceEntry(input)).toBe(expected);
  });
});

describe("PlanningDiagnosisWizard markup", () => {
  beforeEach(() => {
    planningDiagnosisSession.dispatch({ type: "reset" });
  });

  it("opens step one with both escape links, blank fields and a real disabled previous button", () => {
    const html = renderToStaticMarkup(createElement(PlanningDiagnosisWizard, { wizard: wizardFixture() }));

    expect(html).toContain("data-testid=\"planning-diagnosis-wizard\"");
    expect(html).toMatch(/<a [^>]*href="\/planning\?view=full"[^>]*>전체 입력 화면<\/a>/);
    expect(html).toMatch(/<a [^>]*href="\/planning\?view=full#planning-input-section"[^>]*>저장된 프로필 열기<\/a>/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>이전<\/button>/);
    expect(html).toMatch(/<button[^>]*aria-disabled="true"[^>]*>다음<\/button>/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>다음<\/button>/);
    expect(html).toContain("aria-required=\"true\"");
    expect(html).toContain("테스트 프로필 불러오기");
    expect(html).toContain("예시 데이터");
    expect(html).not.toContain("예시 데이터로 진행 중");
    expect(html).not.toMatch(/<input[^>]*value="[^"]+"/);
    expect(html).toContain("새로고침");
    expect(html).toContain("프로필 이름");
  });

  it("names what is missing above the button and marks the field after an attempt", () => {
    const html = renderToStaticMarkup(createElement(PlanningDiagnosisWizard, {
      wizard: wizardFixture({ showIssues: true }),
    }));

    expect(html).toContain("aria-invalid=\"true\"");
    expect(html).toContain("이 칸을 입력해 주세요.");
    expect(html).toContain("다음 단계로 가려면");
  });

  it("shows the badge once the example is loaded", () => {
    const state = apply(createInitialDiagnosisState(), { type: "loadExample" });
    const html = renderToStaticMarkup(createElement(PlanningDiagnosisWizard, {
      wizard: wizardFixture({ state, dirty: true, issues: [] }),
    }));

    expect(html).toContain("예시 데이터로 진행 중");
    expect(html).toContain("value=\"예시 1인 가구\"");
    expect(html).toMatch(/<button(?![^>]*aria-disabled="true")[^>]*>다음<\/button>/);
  });

  it("offers the final save only on the last step", () => {
    const state = apply(createInitialDiagnosisState(), { type: "loadExample" }, { type: "goToStep", step: 5 });
    const html = renderToStaticMarkup(createElement(PlanningDiagnosisWizard, {
      wizard: wizardFixture({
        state,
        issues: [],
        canSubmit: true,
        summary: buildDiagnosisSummary(state.draft),
        conditions: [{ label: "배분 정책", value: "균형형 (기본)" }],
      }),
    }));

    expect(html).toContain("진단 실행·저장");
    expect(html).toContain("778,170원");
    expect(html).toContain("균형형 (기본)");
    expect(html).toContain("참고용 계산");
    expect(html).not.toMatch(/>다음<\/button>/);
  });
});
