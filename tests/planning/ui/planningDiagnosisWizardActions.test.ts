import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlanningDiagnosisWizard } from "../../../src/components/planning/PlanningDiagnosisWizard";
import {
  buildDiagnosisParsedRunInputs,
  buildDiagnosisRunBody,
  buildDiagnosisRunConditions,
  usePlanningDiagnosisWizard,
  type DiagnosisRunConfig,
  type PlanningDiagnosisWizardController,
} from "../../../src/components/planning/workspace/usePlanningDiagnosisWizard";
import {
  DIAGNOSIS_EXAMPLE_DRAFT,
  buildDiagnosisResultLinks,
  buildDiagnosisSubmission,
  canResetDiagnosis,
  createDiagnosisSessionStore,
  createInitialDiagnosisState,
  isDiagnosisDirty,
  planningDiagnosisSession,
  submitDiagnosisDraft,
  type DiagnosisGuard,
  type DiagnosisRunRecord,
  type DiagnosisSessionStore,
  type DiagnosisSubmitDeps,
  type PlanningWriteResult,
} from "../../../src/lib/planning/ui/planningDiagnosisWizard";

const NO_GUARD: DiagnosisGuard = { blockers: [], warnings: [], signature: "" };

function storeWithExample(): DiagnosisSessionStore {
  const store = createDiagnosisSessionStore();
  store.dispatch({ type: "loadExample" });
  store.dispatch({ type: "goToStep", step: 5 });
  return store;
}

function okDeps(overrides: Partial<DiagnosisSubmitDeps> = {}) {
  const calls: string[] = [];
  const deps = {
    saveProfile: vi.fn(async (_input: { name: string; profile: unknown }): Promise<PlanningWriteResult<{ id: string }>> => {
      calls.push("profile");
      return { status: "ok", record: { id: "profile-new" } };
    }),
    runDiagnosis: vi.fn(async (_profileId: string): Promise<PlanningWriteResult<DiagnosisRunRecord>> => {
      calls.push("run");
      return { status: "ok", record: { id: "run-new", overallStatus: "SUCCESS" } };
    }),
    saveReport: vi.fn(async (_runId: string): Promise<PlanningWriteResult<{ id: string }>> => {
      calls.push("report");
      return { status: "ok", record: { id: "report-new" } };
    }),
    ...overrides,
  };
  return { deps, calls };
}

const runConfig: DiagnosisRunConfig = {
  policyId: "balanced",
  runTitle: "기본 실행",
  assumptionsForm: { inflationPct: 2, expectedReturnPct: 5, cashReturnPct: 2, withdrawalRatePct: 4 },
  assumptionsExtraOverrides: {},
  effectiveSnapshotSelection: { mode: "latest" },
  selectedSnapshotId: undefined,
  selectedSnapshotItem: undefined,
  effectiveRunScenariosEnabled: true,
  effectiveRunMonteCarloEnabled: false,
  effectiveRunActionsEnabled: true,
  effectiveRunDebtEnabled: true,
  effectiveIncludeProducts: false,
  maxCandidatesPerAction: "5",
  monteCarloPaths: "2000",
  monteCarloSeed: "12345",
  debtExtraPaymentKrw: "0",
};

describe("planning diagnosis example loading", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("copies constants into the draft with no network write", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const store = createDiagnosisSessionStore();
    store.dispatch({ type: "loadExample" });
    store.dispatch({ type: "setField", field: "profileName", value: "고친 이름" });
    store.dispatch({ type: "goToStep", step: 3 });
    store.dispatch({ type: "goToStep", step: 1 });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.getState().draft.profileName).toBe("고친 이름");
    expect(store.getState().submission.status).toBe("idle");
  });
});

describe("planning diagnosis save pipeline", () => {
  it("saves the new profile, runs that id and archives that run in order", async () => {
    const store = storeWithExample();
    const { deps, calls } = okDeps();
    const submission = buildDiagnosisSubmission(store.getState().draft);

    await submitDiagnosisDraft({ store, guard: NO_GUARD, deps });

    expect(calls).toEqual(["profile", "run", "report"]);
    expect(deps.saveProfile).toHaveBeenCalledWith({
      name: "예시 1인 가구",
      profile: submission.ok ? submission.profile : null,
    });
    expect(deps.runDiagnosis).toHaveBeenCalledWith("profile-new");
    expect(deps.saveReport).toHaveBeenCalledWith("run-new");
    expect(store.getState().submission).toMatchObject({
      status: "complete",
      profileId: "profile-new",
      runId: "run-new",
      reportId: "report-new",
      runStatus: "SUCCESS",
    });
  });

  it("releases the unsaved warning only when every save is done and keeps the badge", async () => {
    const store = storeWithExample();
    expect(isDiagnosisDirty(store.getState())).toBe(true);

    await submitDiagnosisDraft({ store, guard: NO_GUARD, deps: okDeps().deps });

    expect(isDiagnosisDirty(store.getState())).toBe(false);
    expect(store.getState().exampleLoaded).toBe(true);
    expect(store.getState().draft).toEqual(DIAGNOSIS_EXAMPLE_DRAFT);
  });

  it("sends one pipeline for a double click", async () => {
    const store = storeWithExample();
    const { deps } = okDeps();

    await Promise.all([
      submitDiagnosisDraft({ store, guard: NO_GUARD, deps }),
      submitDiagnosisDraft({ store, guard: NO_GUARD, deps }),
    ]);

    expect(deps.saveProfile).toHaveBeenCalledTimes(1);
    expect(deps.runDiagnosis).toHaveBeenCalledTimes(1);
    expect(deps.saveReport).toHaveBeenCalledTimes(1);
  });

  it("does not create a second report once one exists", async () => {
    const store = storeWithExample();
    const { deps } = okDeps();

    await submitDiagnosisDraft({ store, guard: NO_GUARD, deps });
    await submitDiagnosisDraft({ store, guard: NO_GUARD, deps });

    expect(deps.saveProfile).toHaveBeenCalledTimes(1);
    expect(deps.saveReport).toHaveBeenCalledTimes(1);
  });

  it("archives a partially successful run and records that status", async () => {
    const store = storeWithExample();
    const { deps } = okDeps({
      runDiagnosis: vi.fn(async () => ({
        status: "ok" as const,
        record: { id: "run-partial", overallStatus: "PARTIAL_SUCCESS" as const },
      })),
    });

    await submitDiagnosisDraft({ store, guard: NO_GUARD, deps });

    expect(deps.saveReport).toHaveBeenCalledWith("run-partial");
    expect(store.getState().submission).toMatchObject({ status: "complete", runStatus: "PARTIAL_SUCCESS" });
  });

  it("does not archive a failed run and keeps the confirmed ids and draft", async () => {
    const store = storeWithExample();
    const { deps } = okDeps({
      runDiagnosis: vi.fn(async () => ({
        status: "failed" as const,
        message: "계산에 실패했습니다.",
        recordId: "run-failed",
      })),
    });

    await submitDiagnosisDraft({ store, guard: NO_GUARD, deps });

    expect(deps.saveReport).not.toHaveBeenCalled();
    expect(store.getState().submission).toMatchObject({
      status: "partial",
      failedStage: "run",
      profileId: "profile-new",
      runId: "run-failed",
      reportId: "",
      message: "계산에 실패했습니다.",
    });
    expect(store.getState().draft).toEqual(DIAGNOSIS_EXAMPLE_DRAFT);
    expect(isDiagnosisDirty(store.getState())).toBe(true);
  });

  it("keeps profile and run ids when the report step fails, with no retry", async () => {
    const store = storeWithExample();
    const { deps } = okDeps({
      saveReport: vi.fn(async () => ({ status: "failed" as const, message: "리포트 저장 실패" })),
    });

    await submitDiagnosisDraft({ store, guard: NO_GUARD, deps });

    expect(deps.saveProfile).toHaveBeenCalledTimes(1);
    expect(deps.runDiagnosis).toHaveBeenCalledTimes(1);
    expect(deps.saveReport).toHaveBeenCalledTimes(1);
    expect(store.getState().submission).toMatchObject({
      status: "partial",
      failedStage: "report",
      profileId: "profile-new",
      runId: "run-new",
    });
  });

  it.each([
    ["profile", { saveProfile: vi.fn(async () => ({ status: "unknown" as const, message: "응답 확인 불가" })) }, { profileId: "", runId: "" }, 0, 0],
    ["run", { runDiagnosis: vi.fn(async () => ({ status: "unknown" as const, message: "응답 확인 불가", recordId: "run-maybe" })) }, { profileId: "profile-new", runId: "run-maybe" }, 1, 0],
    ["report", { saveReport: vi.fn(async () => ({ status: "unknown" as const, message: "응답 확인 불가" })) }, { profileId: "profile-new", runId: "run-new" }, 1, 1],
  ])("stops at an unclear %s response and never sends the same submission again", async (stage, overrides, ids, runCalls, reportCalls) => {
    Object.values(overrides).forEach((mock) => mock.mockClear());
    const store = storeWithExample();
    const { deps } = okDeps(overrides as Partial<DiagnosisSubmitDeps>);

    await submitDiagnosisDraft({ store, guard: NO_GUARD, deps });
    await submitDiagnosisDraft({ store, guard: NO_GUARD, deps });

    expect(store.getState().submission).toMatchObject({ status: "unknown", failedStage: stage, ...ids });
    expect(deps.saveProfile).toHaveBeenCalledTimes(1);
    expect(deps.runDiagnosis).toHaveBeenCalledTimes(runCalls);
    expect(deps.saveReport).toHaveBeenCalledTimes(reportCalls);
  });

  it("treats a thrown adapter as an unclear result", async () => {
    const store = storeWithExample();
    const { deps } = okDeps({
      runDiagnosis: vi.fn(async () => {
        throw new TypeError("connection reset");
      }),
    });

    await submitDiagnosisDraft({ store, guard: NO_GUARD, deps });

    expect(store.getState().submission).toMatchObject({
      status: "unknown",
      failedStage: "run",
      profileId: "profile-new",
    });
    expect(deps.saveReport).not.toHaveBeenCalled();
  });

  it("ignores input changes after a failure, so nothing reaches the server", async () => {
    const store = storeWithExample();
    const { deps } = okDeps({
      saveReport: vi.fn(async () => ({ status: "failed" as const, message: "실패" })),
    });

    await submitDiagnosisDraft({ store, guard: NO_GUARD, deps });
    store.dispatch({ type: "setField", field: "profileName", value: "바꾼 이름" });
    store.dispatch({ type: "loadExample" });
    await submitDiagnosisDraft({ store, guard: NO_GUARD, deps });

    expect(store.getState().draft.profileName).toBe("예시 1인 가구");
    expect(deps.saveProfile).toHaveBeenCalledTimes(1);
  });

  it("lets the user fix input after a definite profile rejection, as a new explicit click", async () => {
    const store = storeWithExample();
    const saveProfile = vi.fn()
      .mockResolvedValueOnce({ status: "failed", message: "입력을 확인하세요." })
      .mockResolvedValueOnce({ status: "ok", record: { id: "profile-second" } });
    const { deps } = okDeps({ saveProfile });

    await submitDiagnosisDraft({ store, guard: NO_GUARD, deps });

    expect(store.getState().submission).toMatchObject({ status: "rejected", failedStage: "profile", profileId: "" });
    expect(deps.runDiagnosis).not.toHaveBeenCalled();

    store.dispatch({ type: "setField", field: "profileName", value: "고친 이름" });
    expect(store.getState().draft.profileName).toBe("고친 이름");
    await submitDiagnosisDraft({ store, guard: NO_GUARD, deps });

    expect(saveProfile).toHaveBeenCalledTimes(2);
    expect(store.getState().submission).toMatchObject({ status: "complete", profileId: "profile-second" });
  });

  it("stays off the network while blockers, unconfirmed warnings or blanks remain", async () => {
    const { deps } = okDeps();

    await submitDiagnosisDraft({
      store: storeWithExample(),
      guard: { blockers: ["금리를 확인하세요."], warnings: [], signature: "" },
      deps,
    });
    await submitDiagnosisDraft({
      store: storeWithExample(),
      guard: { blockers: [], warnings: ["단위를 확인하세요."], signature: "unit" },
      deps,
    });
    await submitDiagnosisDraft({ store: createDiagnosisSessionStore(), guard: NO_GUARD, deps });

    expect(deps.saveProfile).not.toHaveBeenCalled();
  });

  it("runs once the current warnings are confirmed and asks again when they change", async () => {
    const guard: DiagnosisGuard = { blockers: [], warnings: ["단위를 확인하세요."], signature: "unit" };
    const { deps } = okDeps();

    const stale = storeWithExample();
    stale.dispatch({ type: "confirmWarnings", signature: "older" });
    await submitDiagnosisDraft({ store: stale, guard, deps });
    expect(deps.saveProfile).not.toHaveBeenCalled();

    const store = storeWithExample();
    store.dispatch({ type: "confirmWarnings", signature: "unit" });
    await submitDiagnosisDraft({ store, guard, deps });
    expect(deps.saveProfile).toHaveBeenCalledTimes(1);
  });
});

describe("planning diagnosis recovery paths", () => {
  it("links the exact confirmed ids and offers no invented target", () => {
    expect(buildDiagnosisResultLinks({
      ...createInitialDiagnosisState().submission,
      profileId: "profile new",
      runId: "run/1",
      reportId: "report 1",
    })).toEqual({
      reportHref: "/planning/reports/report%201",
      runHref: "/planning/runs?selected=run%2F1&profileId=profile%20new",
      profileHref: "/planning?profileId=profile%20new",
    });
    expect(buildDiagnosisResultLinks({
      ...createInitialDiagnosisState().submission,
    })).toEqual({
      reportHref: "",
      runHref: "/planning/runs",
      profileHref: "/planning?view=full#planning-input-section",
    });
  });

  it("requires acknowledgement before a new diagnosis after a partial or unclear result", async () => {
    const store = storeWithExample();
    const { deps } = okDeps({
      saveProfile: vi.fn(async () => ({ status: "unknown" as const, message: "응답 확인 불가" })),
    });
    expect(canResetDiagnosis(store.getState(), false)).toBe(true);

    await submitDiagnosisDraft({ store, guard: NO_GUARD, deps });

    expect(canResetDiagnosis(store.getState(), false)).toBe(false);
    expect(canResetDiagnosis(store.getState(), true)).toBe(true);
  });

  it("keeps reset away while the pipeline is running", () => {
    const state = createInitialDiagnosisState();
    expect(canResetDiagnosis({
      ...state,
      submission: { ...state.submission, status: "running" },
    }, true)).toBe(false);
  });

  it("renders the failed stage, confirmed ids and links instead of a retry button", async () => {
    const store = storeWithExample();
    const { deps } = okDeps({
      runDiagnosis: vi.fn(async () => ({ status: "failed" as const, message: "계산에 실패했습니다.", recordId: "run-failed" })),
    });
    await submitDiagnosisDraft({ store, guard: NO_GUARD, deps });

    const html = renderToStaticMarkup(createElement(PlanningDiagnosisWizard, {
      wizard: wizardController(store),
    }));

    expect(html).toContain("진단 실행 단계에서 멈췄습니다");
    expect(html).toContain("profile-new");
    expect(html).toContain("run-failed");
    expect(html).toContain("href=\"/planning?profileId=profile-new\"");
    expect(html).toContain("계산에 실패했습니다.");
    expect(html).not.toContain(">진단 실행·저장</button>");
    expect(html).not.toContain("저장된 리포트 열기");
  });

  it("says plainly when a save could not be confirmed", async () => {
    const store = storeWithExample();
    const { deps } = okDeps({
      saveProfile: vi.fn(async () => ({ status: "unknown" as const, message: "응답 확인 불가" })),
    });
    await submitDiagnosisDraft({ store, guard: NO_GUARD, deps });

    const html = renderToStaticMarkup(createElement(PlanningDiagnosisWizard, {
      wizard: wizardController(store),
    }));

    expect(html).toContain("저장 여부 미확인");
    expect(html).toContain("기존 저장 여부를 확인했습니다");
    expect(html).not.toContain(">진단 실행·저장</button>");
  });

  it("shows completion with both result links and keeps the example badge", async () => {
    const store = storeWithExample();
    await submitDiagnosisDraft({ store, guard: NO_GUARD, deps: okDeps().deps });

    const html = renderToStaticMarkup(createElement(PlanningDiagnosisWizard, {
      wizard: wizardController(store),
    }));

    expect(html).toContain("저장 완료");
    expect(html).toMatch(/<a [^>]*href="\/planning\/reports\/report-new"[^>]*>저장된 리포트 열기<\/a>/);
    expect(html).toMatch(/<a [^>]*href="\/planning\/runs\?selected=run-new&amp;profileId=profile-new"[^>]*>실행 기록 보기<\/a>/);
    expect(html).toContain("예시 데이터로 진행 중");
  });
});

describe("usePlanningDiagnosisWizard submit wiring", () => {
  function captureController(loadProfiles: () => Promise<void>): PlanningDiagnosisWizardController {
    let captured: PlanningDiagnosisWizardController | null = null;
    function Probe() {
      captured = usePlanningDiagnosisWizard({ locale: "ko-KR", config: runConfig, loadProfiles });
      return null;
    }
    renderToStaticMarkup(createElement(Probe));
    if (!captured) throw new Error("hook did not render");
    return captured;
  }

  beforeEach(() => {
    planningDiagnosisSession.dispatch({ type: "reset" });
  });

  afterEach(() => {
    planningDiagnosisSession.dispatch({ type: "reset" });
    vi.unstubAllGlobals();
  });

  it("posts profile, run and report with the returned ids and only refreshes the profile list", async () => {
    const loadProfiles = vi.fn(async () => undefined);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: { id: "profile-new" } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: { id: "run-new", overallStatus: "SUCCESS" } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: { id: "report-new" } }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    planningDiagnosisSession.dispatch({ type: "loadExample" });
    planningDiagnosisSession.dispatch({ type: "goToStep", step: 5 });

    await captureController(loadProfiles).submit();

    const calls = fetchMock.mock.calls as Array<[string, RequestInit]>;
    expect(calls.map(([url, init]) => [init.method, url])).toEqual([
      ["POST", "/api/planning/v2/profiles"],
      ["POST", "/api/planning/v2/runs"],
      ["POST", "/api/planning/v2/reports"],
    ]);
    expect(JSON.parse(String(calls[0]?.[1].body))).toMatchObject({
      name: "예시 1인 가구",
      profile: { monthlyIncomeNet: 4_100_000 },
    });
    expect(JSON.parse(String(calls[1]?.[1].body))).toMatchObject({
      profileId: "profile-new",
      input: { horizonMonths: 120, policyId: "balanced" },
    });
    expect(JSON.parse(String(calls[2]?.[1].body))).toMatchObject({ runId: "run-new" });
    expect(loadProfiles).toHaveBeenCalledTimes(1);
    expect(loadProfiles).toHaveBeenCalledWith();
    expect(planningDiagnosisSession.getState().submission).toMatchObject({
      status: "complete",
      profileId: "profile-new",
      runId: "run-new",
      reportId: "report-new",
    });
  });

  it("stays off the network and marks the attempt when the final step is incomplete", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { requestAnimationFrame: (callback: () => void) => callback() });
    planningDiagnosisSession.dispatch({ type: "loadExample" });
    planningDiagnosisSession.dispatch({ type: "setField", field: "horizonMonths", value: "" });
    planningDiagnosisSession.dispatch({ type: "goToStep", step: 5 });

    await captureController(vi.fn(async () => undefined)).submit();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(planningDiagnosisSession.getState().attemptedStep).toBe(5);
    expect(planningDiagnosisSession.getState().submission.status).toBe("idle");
  });
});

describe("planning diagnosis run input", () => {
  let submission: ReturnType<typeof buildDiagnosisSubmission>;

  beforeEach(() => {
    submission = buildDiagnosisSubmission(DIAGNOSIS_EXAMPLE_DRAFT);
  });

  it("builds the run from the wizard period and existing options, not the legacy form", () => {
    const parsed = buildDiagnosisParsedRunInputs({
      draft: DIAGNOSIS_EXAMPLE_DRAFT,
      profile: submission.ok ? submission.profile : {},
      config: runConfig,
    });

    expect(parsed).toMatchObject({
      ok: true,
      parsed: {
        horizon: 120,
        policyId: "balanced",
        actions: { includeProducts: false, maxCandidatesPerAction: 5 },
        debt: { offers: [], options: {} },
      },
    });
  });

  it("targets the explicit new profile id", () => {
    const parsed = buildDiagnosisParsedRunInputs({
      draft: DIAGNOSIS_EXAMPLE_DRAFT,
      profile: submission.ok ? submission.profile : {},
      config: runConfig,
    });
    if (!parsed.ok) throw new Error(parsed.message);

    expect(buildDiagnosisRunBody({ profileId: "profile-new", parsed: parsed.parsed, config: runConfig })).toMatchObject({
      profileId: "profile-new",
      title: "기본 실행",
      input: {
        horizonMonths: 120,
        policyId: "balanced",
        runScenarios: true,
        getActions: true,
        analyzeDebt: true,
        includeProducts: false,
      },
    });
  });

  it("reports an unusable run option instead of sending it", () => {
    expect(buildDiagnosisParsedRunInputs({
      draft: DIAGNOSIS_EXAMPLE_DRAFT,
      profile: {},
      config: { ...runConfig, maxCandidatesPerAction: "99" },
    })).toMatchObject({ ok: false });
  });

  it("discloses the applied conditions, including the snapshot basis", () => {
    const conditions = buildDiagnosisRunConditions({
      draft: DIAGNOSIS_EXAMPLE_DRAFT,
      config: {
        ...runConfig,
        selectedSnapshotItem: { id: "snap-1", asOf: "2026-10-01", fetchedAt: "2026-10-02T00:00:00.000Z" },
      },
    });
    const text = conditions.map((row) => `${row.label}:${row.value}`).join("\n");

    expect(text).toContain("분석 기간:120개월");
    expect(text).toContain("배분 정책:균형형 (기본)");
    expect(text).toContain("물가상승률 2%");
    expect(text).toContain("2026-10-01");
    expect(text).toContain("추가상환:0원");
  });

  it("says when no dated snapshot backs the run", () => {
    const text = buildDiagnosisRunConditions({ draft: DIAGNOSIS_EXAMPLE_DRAFT, config: runConfig })
      .map((row) => `${row.label}:${row.value}`)
      .join("\n");

    expect(text).toContain("기준 데이터:");
    expect(text).toContain("기준일 없음");
  });
});

function wizardController(store: DiagnosisSessionStore): PlanningDiagnosisWizardController {
  const state = store.getState();
  return {
    state,
    dirty: isDiagnosisDirty(state),
    issues: [],
    showIssues: false,
    guard: NO_GUARD,
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
  };
}
