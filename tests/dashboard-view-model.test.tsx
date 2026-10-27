import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { listRuns } from "../src/lib/planning/server/store/runStore";
import {
  DASHBOARD_REQUEST_TIMEOUT_MESSAGE,
  DashboardClient,
  fetchDashboardJson,
  getDashboardResourceLoadCopy,
} from "../src/components/DashboardClient";
import { loadDashboardViewModel } from "../src/app/dashboard/_lib/dashboardViewModel";
import { buildPlanningRunArtifacts } from "../src/lib/planning/server/v2/runArtifacts";
import { simulateMonthly } from "../src/lib/planning/v2/simulateMonthly";
import type { ProfileV2 } from "../src/lib/planning/v2/types";
import { getScopedPlanningUserId, runWithPlanningUserScope } from "../src/lib/planning/store/userScope";
import { computeProfileHash } from "../src/lib/planning/v2/reproducibility";
import { applyProfilePatch } from "../src/lib/planning/v2/profilePatch";

const mocks = vi.hoisted(() => ({ profiles: vi.fn(), runs: vi.fn(), index: vi.fn(), authFails: false }));
vi.mock("@/lib/planning/server/profiles/repository", () => ({ listCurrentUserProfilesWithDefault: mocks.profiles }));
vi.mock("@/lib/planning/server/runs/repository", () => ({ listCurrentUserRuns: mocks.runs, listCurrentUserRunIndexEntries: mocks.index }));
vi.mock("@/lib/planning/server/pageAuth", () => ({
  withCurrentPlanningPageUser: async <T,>(callback: () => Promise<T>) => {
    if (mocks.authFails) throw new Error("unauthenticated");
    return runWithPlanningUserScope({ userId: "dashboard-user" }, callback);
  },
}));

type PlanningRunRows = Awaited<ReturnType<typeof listRuns>>;

const currentProfile: ProfileV2 = {
  monthlyIncomeNet: 5_000_000,
  monthlyEssentialExpenses: 2_000_000,
  monthlyDiscretionaryExpenses: 800_000,
  liquidAssets: 10_000_000,
  investmentAssets: 20_000_000,
  debts: [
    { id: "loan-1", name: "대출 1", balance: 8_000_000, minimumPayment: 400_000, apr: 0 },
    { id: "loan-2", name: "대출 2", balance: 2_000_000, minimumPayment: 300_000, apr: 0 },
  ],
  goals: [{ id: "goal-1", name: "목표", targetAmount: 9_000_000, currentAmount: 3_000_000, targetMonth: 24 }],
};

const artifacts = buildPlanningRunArtifacts({
  profile: currentProfile,
  policyId: "balanced",
  snapshotMeta: { asOf: "2026-07-01" },
  healthSummary: {},
  simulatePlan: simulateMonthly(currentProfile, { inflation: 0, expectedReturn: 0 }, 24),
  scenariosOutput: null,
  monteCarloOutput: null,
  actionsOutput: null,
  debtStrategyOutput: null,
});

const sampleRun = {
  id: "run-1",
  profileId: "profile-1",
  title: "최근 플랜",
  createdAt: "2026-07-01T00:00:00.000Z",
  overallStatus: "SUCCESS",
  input: { horizonMonths: 24 },
  meta: { snapshot: { asOf: "2026-07-01" } },
  outputs: {
    ...artifacts.outputs,
    resultDto: artifacts.resultDto,
    actions: {
      actions: [
        {
          code: "emergency-fund",
          title: "비상금 먼저 점검",
          summary: "현금흐름을 먼저 확인합니다.",
          steps: ["고정지출 확인"],
          candidates: [],
        },
      ],
    },
  },
};

describe("dashboard view model", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("aligns hero with A while keeping the globally newer B in recent runs without mutating inputs", async () => {
    const rows = [
      { ...sampleRun, id: "run-b", profileId: "profile-b", createdAt: "2026-09-07T00:00:00.000Z",
        outputs: { resultDto: { summary: { endNetWorthKrw: 99_990_000 } } } },
      { ...sampleRun, id: "run-a", profileId: "current-profile" },
    ];
    const before = JSON.stringify(rows);
    const vm = await loadDashboardViewModel(async () => rows as unknown as PlanningRunRows);
    const html = renderToStaticMarkup(<DashboardClient initialViewModel={vm} />);
    expect(vm.currentProfile).toMatchObject({ state: "loaded", monthlyIncomeKrw: 5_000_000 });
    const hero = html.match(/<section aria-label="현재 프로필의 최근 플랜 결과"[\s\S]*?<\/section>/)?.[0];
    expect(hero).toBeDefined();
    expect(hero).not.toContain("9,999만원");
    expect(vm.currentPlan).toMatchObject({ state: "unverified", run: { id: "run-a" } });
    expect(vm.runs.map((run) => run.id)).toEqual(["run-b", "run-a"]);
    expect(html).toContain('href="/planning/reports?runId=run-b"');
    const nextAction = html.match(/<div[^>]*data-testid="dashboard-next-action"[\s\S]*?<\/div>/)?.[0];
    expect(nextAction).toContain("현재 프로필 현재 기본의 비상금 먼저 점검");
    expect(nextAction).not.toContain("profile-b");
    // profile-b is not in the authenticated profile list, so its label is unknown rather than its raw id.
    expect(html).toContain("최근 실행 최근 플랜 · 프로필 연결된 프로필을 확인할 수 없습니다 대상 액션입니다.");
    expect(JSON.stringify(rows)).toBe(before);
  });
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authFails = false;
    mocks.profiles.mockResolvedValue({
      defaultProfileId: "current-profile",
      profiles: [{ id: "current-profile", name: "현재 기본", profile: currentProfile, updatedAt: "2026-09-06T00:00:00.000Z" }],
    });
    mocks.runs.mockResolvedValue([sampleRun]);
    mocks.index.mockResolvedValue([]);
  });

  it("shows current surplus even though actual stored artifacts do not contain it", async () => {
    expect(artifacts.resultDto.summary).not.toHaveProperty("monthlySurplusKrw");
    expect(artifacts.outputs.simulate.summary).not.toHaveProperty("monthlySurplusKrw");
    const vm = await loadDashboardViewModel(async () => [sampleRun] as unknown as PlanningRunRows);
    const html = renderToStaticMarkup(<DashboardClient initialViewModel={vm} />);
    expect(html).toMatch(/월 잉여금<\/p><p[^>]*>150만원<\/p>/);
    expect(vm.currentProfile).toMatchObject({
      state: "loaded", monthlyIncomeKrw: 5_000_000, monthlyExpensesKrw: 2_800_000,
      monthlyDebtPaymentKrw: 700_000, monthlySurplusKrw: 1_500_000,
      totalDebtKrw: 10_000_000, netWorthKrw: 23_000_000,
    });
    expect(html.indexOf('aria-label="현재 재무 상태"')).toBeLessThan(html.indexOf(">최근 플랜 결과<"));
    expect(html).toContain("미래 시뮬레이션 결과");
  });
  it("keeps the primary workspace ahead of history and optional tools collapsed", async () => {
    const vm = await loadDashboardViewModel();
    const html = renderToStaticMarkup(<DashboardClient initialViewModel={vm} />);
    expect(html.indexOf('data-testid="dashboard-primary-workspace"')).toBeLessThan(html.indexOf('id="dashboard-recent-title"'));
    expect(html.indexOf('id="dashboard-recent-title"')).toBeLessThan(html.indexOf('data-testid="dashboard-secondary-tools"'));
    const tools = html.match(/<details[^>]*data-testid="dashboard-secondary-tools"[^>]*>/)?.[0];
    expect(tools).toBeDefined();
    expect(tools).not.toMatch(/\sopen(?:[=\s>])/);
    for (const href of ["/recommend", "/products/catalog", "/benefits", "/tools/fx", "/public/dart", "/settings/data-sources"]) expect(html).toContain(`href="${href}"`);
  });

  it("puts a stale plan's corrective action ahead of historical action advice", async () => {
    // A pinned snapshot is what makes the one-click rerun possible (see the unpinned cases below).
    mocks.runs.mockResolvedValue([{ ...sampleRun, profileId: "current-profile", input: { horizonMonths: 24, snapshotId: "old-snapshot" }, reproducibility: { profileHash: "previous-profile" } }]);
    const html = renderToStaticMarkup(<DashboardClient initialViewModel={await loadDashboardViewModel()} />);
    const action = html.match(/<div[^>]*data-testid="dashboard-next-action"[\s\S]*?<\/div>/)?.[0];
    expect(action).toContain("바뀐 재무 정보로 다시 계산하세요");
    expect(action).toContain("현재 프로필로 다시 계산");
    expect(action).not.toContain("비상금 먼저 점검");
    expect(html).toContain("기간·정책·가정은 이전 플랜 조건을 사용합니다.");
    expect(html).toContain('href="/planning?profileId=current-profile"');
  });

  it("keeps no-run and loaded state distinct", async () => {
    const vm = await loadDashboardViewModel(async () => [] as PlanningRunRows);

    expect(vm.runs).toEqual([]);
    expect(vm.runsLoadState).toBe("loaded");
  });

  it("sanitizes loaded runs for the dashboard client", async () => {
    const vm = await loadDashboardViewModel(async () => [sampleRun] as unknown as PlanningRunRows);

    expect(vm.runsLoadState).toBe("loaded");
    expect(vm.runs).toHaveLength(1);
    expect(vm.runs[0]?.title).toBe("최근 플랜");
    expect(vm.runs[0]?.outputs?.resultDto).toEqual({
      summary: artifacts.resultDto.summary,
    });
  });

  it("preserves load failure instead of returning a fake empty run list", async () => {
    const vm = await loadDashboardViewModel(async () => {
      throw new Error("store unavailable");
    });

    expect(vm.runs).toEqual([]);
    expect(vm.runsLoadState).toBe("failed");
    expect(vm.runsErrorMessage).toContain("최근 플랜 정보를 불러오지 못했습니다");
  });

  it("renders the dashboard load-failure state separately from no-run", () => {
    const html = renderToStaticMarkup(
      <DashboardClient
        initialViewModel={{
          runs: [],
          runsLoadState: "failed",
          runsErrorMessage: "테스트 실패",
          currentProfile: { state: "missing" },
          currentPlan: { state: "failed", message: "테스트 실패" },
        }}
      />,
    );

    expect(html).toContain("최근 실행 기록을 불러오지 못했습니다");
    expect(html).toContain("저장된 기록이 없다는 뜻은 아닙니다");
  });

  it("does not substitute another profile's run for the shown profile's next action", async () => {
    const vm = await loadDashboardViewModel(async () => [sampleRun] as unknown as PlanningRunRows);
    const html = renderToStaticMarkup(<DashboardClient initialViewModel={vm} />);
    const nextAction = html.match(/<div[^>]*data-testid="dashboard-next-action"[\s\S]*?<\/div>/)?.[0] ?? "";

    expect(vm.currentPlan).toEqual({ state: "missing" });
    expect(nextAction).toContain("다음에 할 한 가지");
    expect(nextAction).toContain("재무 상태 진단을 시작해 현재 입력 기준의 첫 리포트를 저장하세요.");
    expect(nextAction).not.toContain("비상금 먼저 점검");
    expect(nextAction).toContain('href="/planning?profileId=current-profile"');
    expect(html.replace(/<[^>]+>/g, " ")).not.toContain("profile-1");
    expect(html).toContain("주요 데이터 연결");
    expect(html).not.toContain("P0 데이터 연결");
  });

  it("aborts a dashboard resource request after the bounded timeout", async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      observedSignal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    });

    const pending = fetchDashboardJson("/api/test", {
      fetchImpl,
      timeoutMs: 100,
    });
    const rejection = pending.then(() => null, (error: unknown) => error);

    await vi.advanceTimersByTimeAsync(100);

    await expect(rejection).resolves.toMatchObject({
      name: "DashboardRequestTimeoutError",
      message: DASHBOARD_REQUEST_TIMEOUT_MESSAGE,
    });
    expect(observedSignal?.aborted).toBe(true);
  });

  it("distinguishes partial resource failure from complete resource failure", () => {
    expect(getDashboardResourceLoadCopy("partial")).toMatchObject({
      title: "일부 보조 정보를 불러오지 못했습니다.",
      guidance: expect.stringContaining("불러온 정보와 저장된 플랜은 계속 사용할 수 있습니다"),
    });
    expect(getDashboardResourceLoadCopy("failed")).toMatchObject({
      title: "대시보드 보조 정보를 불러오지 못했습니다.",
      guidance: expect.stringContaining("저장된 플랜은 그대로 사용할 수 있습니다"),
    });
    expect(getDashboardResourceLoadCopy("loaded")).toBeNull();
  });

  it("matches the simulation starting net worth including separately funded goals", async () => {
    const profile = { ...currentProfile, monthlyIncomeNet: 0, monthlyEssentialExpenses: 0, monthlyDiscretionaryExpenses: 0 };
    mocks.profiles.mockResolvedValue({ defaultProfileId: "p", profiles: [{ id: "p", profile }] });
    const vm = await loadDashboardViewModel();
    const first = simulateMonthly(profile, { inflation: 0, expectedReturn: 0 }, 1).timeline[0];
    expect(vm.currentProfile).toMatchObject({ state: "loaded", netWorthKrw: 23_000_000 });
    if (vm.currentProfile.state !== "loaded") throw new Error("profile missing");
    expect(vm.currentProfile.netWorthKrw).toBeCloseTo(first.netWorth - first.netWorthDelta, 2);
    expect(vm.currentProfile.netWorthKrw).toBeCloseTo(first.netWorth, 2);
  });

  it("uses the default profile, independently of list order and the latest run profile", async () => {
    mocks.profiles.mockResolvedValue({ defaultProfileId: "selected", profiles: [
      { id: "profile-1", profile: { ...currentProfile, monthlyIncomeNet: 99_000_000 } },
      { id: "selected", profile: { ...currentProfile, monthlyIncomeNet: 6_000_000 } },
    ] });
    const vm = await loadDashboardViewModel();
    expect(vm.currentProfile).toMatchObject({ monthlyIncomeKrw: 6_000_000, monthlySurplusKrw: 2_500_000 });
    expect(vm.runs[0].profileId).toBe("profile-1");
  });

  it("keeps missing profiles distinct from failures even with a saved run", async () => {
    mocks.profiles.mockResolvedValue({ profiles: [] });
    const vm = await loadDashboardViewModel();
    expect(vm.currentProfile).toEqual({ state: "missing" });
    const html = renderToStaticMarkup(<DashboardClient initialViewModel={vm} />);
    expect(html).toContain("재무 상태 진단 시작");
    const section = html.match(/<section aria-label="현재 재무 상태"[\s\S]*?<\/section>/)?.[0];
    expect(section).not.toContain("0원");
    expect(section).not.toContain("다시 불러오기");
  });

  it("preserves runs and actions when the profile load fails", async () => {
    mocks.profiles.mockRejectedValue(new Error("secret storage path"));
    const vm = await loadDashboardViewModel();
    expect(vm.currentProfile.state).toBe("failed");
    expect(vm.runsLoadState).toBe("loaded");
    expect(vm.currentPlan.state).toBe("failed");
    const html = renderToStaticMarkup(<DashboardClient initialViewModel={vm} />);
    expect(html).toContain("현재 프로필 다시 불러오기");
    expect(html).toContain("비상금 먼저 점검");
    expect(html).toContain("/planning/reports?runId=run-1");
    expect(html).not.toContain("secret storage path");
    expect(html).not.toContain("아직 입력된 재무 정보가 없습니다");
  });

  it("preserves current profile metrics when runs fail", async () => {
    mocks.runs.mockRejectedValue(new Error("run storage unavailable"));
    const vm = await loadDashboardViewModel();
    expect(vm.runsLoadState).toBe("failed");
    expect(vm.currentProfile.state).toBe("loaded");
    expect(vm.currentPlan.state).toBe("failed");
    const html = renderToStaticMarkup(<DashboardClient initialViewModel={vm} />);
    expect(html).toContain("150만원");
    expect(html).toContain("최근 실행 기록을 불러오지 못했습니다");
    expect(html).not.toContain("현재 프로필 다시 불러오기");
  });

  it.each([
    ["current", computeProfileHash(currentProfile), "현재 저장 프로필과 같은 조건으로 계산된 플랜입니다."],
    ["stale", computeProfileHash({ ...currentProfile, monthlyIncomeNet: 9_000_000 }), "현재 프로필이 이 플랜 이후 변경되었습니다."],
    ["unverified", undefined, "과거 실행이라 현재 프로필과 일치 여부를 자동 확인할 수 없습니다."],
  ])("compares canonical profile hashes: %s", async (state, profileHash, message) => {
    const profileBefore = JSON.stringify(currentProfile);
    mocks.runs.mockResolvedValue([{ ...sampleRun, profileId: "current-profile", input: { horizonMonths: 24, snapshotId: "old-snapshot" }, reproducibility: { profileHash } }]);
    const vm = await loadDashboardViewModel();
    expect(vm.currentPlan).toMatchObject({ state, run: { id: "run-1" } });
    const html = renderToStaticMarkup(<DashboardClient initialViewModel={vm} />);
    expect(html).toContain(message);
    if (state === "stale") {
      expect(html).toContain("현재 프로필로 다시 계산</button>");
      expect(html).toContain("기간·정책·가정은 이전 플랜 조건을 사용합니다.");
      expect(html).toContain('href="/planning?profileId=current-profile"');
    } else {
      expect(html).toMatch(/href="\/planning\?profileId=current-profile"[^>]*>현재 조건으로 다시 계산<\/a>/);
      expect(vm.currentPlan).not.toHaveProperty("rerunInput");
      expect(html).not.toContain("현재 프로필로 다시 계산</button>");
    }
    expect(JSON.stringify(vm)).not.toContain("profileHash");
    expect(JSON.stringify(currentProfile)).toBe(profileBefore);
  });

  it.each([
    ["no stored snapshot", { horizonMonths: 24 }],
    ["latest snapshot", { horizonMonths: 24, snapshotId: "latest" }],
    ["padded LATEST snapshot", { horizonMonths: 24, snapshotId: "  LATEST " }],
  ])("replaces the rerun button with a condition review for a stale plan with %s", async (_label, input) => {
    mocks.runs.mockResolvedValue([{ ...sampleRun, profileId: "current-profile", input, reproducibility: { profileHash: "previous-profile" } }]);
    const vm = await loadDashboardViewModel();
    expect(vm.currentPlan.state).toBe("stale");
    const html = renderToStaticMarkup(<DashboardClient initialViewModel={vm} />);
    const action = html.match(/<div[^>]*data-testid="dashboard-next-action"[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? "";
    expect(action).toContain("바뀐 재무 정보로 다시 계산하세요");
    expect(action).toContain("이전 플랜의 계산 기준 자료가 고정되어 있지 않아");
    expect(action).toMatch(/href="\/planning\?profileId=current-profile"[^>]*>계산 조건 검토 후 다시 계산<\/a>/);
    expect(html).not.toContain("현재 프로필로 다시 계산</button>");
    expect(html).not.toContain("이전 계산 조건으로 새 결과를 저장합니다.");
    expect(html).not.toContain("기간·정책·가정은 이전 플랜 조건을 사용합니다.");
    // The plan's report and the stale explanation stay available.
    expect(html).toContain("현재 프로필이 이 플랜 이후 변경되었습니다.");
    expect(html).toContain('href="/planning/reports?runId=run-1&amp;profileId=current-profile"');
  });

  it("keeps the one-click rerun for a stale plan pinned to a stored snapshot", async () => {
    mocks.runs.mockResolvedValue([{ ...sampleRun, profileId: "current-profile", input: { horizonMonths: 24, snapshotId: "2026-07-01_2026-07-01-00-00-00" }, reproducibility: { profileHash: "previous-profile" } }]);
    const html = renderToStaticMarkup(<DashboardClient initialViewModel={await loadDashboardViewModel()} />);
    expect(html).toContain("현재 프로필로 다시 계산</button>");
    expect(html).toContain("이전 계산 조건으로 새 결과를 저장합니다.");
    expect(html).not.toContain("계산 조건 검토 후 다시 계산");
  });

  it("copies all stored input settings only from the stale scoped run without changing the source", async () => {
    const input = {
      horizonMonths: 48, policyId: "balanced", snapshotId: "old-snapshot",
      assumptionsOverride: { inflationPct: 2.7 }, runScenarios: false, getActions: false, analyzeDebt: true,
      debtStrategy: { offers: [], options: { extraPaymentKrw: 30000, compareTermsMonths: [24, 36] } },
      includeProducts: true, monteCarlo: { paths: 100, seed: 88 },
      scenario: { title: "이전 시나리오", baseRunId: "base-a", patch: [{ op: "mul" as const, field: "monthlyIncomeNet" as const, value: 1.1 }] },
    };
    const source = { ...sampleRun, profileId: "current-profile", input, reproducibility: { profileHash: "old-hash" } };
    mocks.runs.mockResolvedValue([source]);
    const vm = await loadDashboardViewModel();
    expect(vm.currentPlan).toMatchObject({ state: "stale", rerunInput: input });
    if (vm.currentPlan.state !== "stale") throw new Error("expected stale");
    vm.currentPlan.rerunInput.debtStrategy!.options!.compareTermsMonths!.push(60);
    expect(input.debtStrategy.options.compareTermsMonths).toEqual([24, 36]);
    expect(vm.runs[0].input).toEqual({ horizonMonths: 48 });
  });

  it("compares scenario hashes against the patched current profile without mutating current metrics", async () => {
    const patch = [{ op: "mul" as const, field: "monthlyIncomeNet" as const, value: 1.1 }];
    mocks.runs.mockResolvedValue([{ ...sampleRun, profileId: "current-profile",
      input: { horizonMonths: 24, scenario: { patch } },
      reproducibility: { profileHash: computeProfileHash(applyProfilePatch(currentProfile, patch)) },
    }]);
    const vm = await loadDashboardViewModel();
    expect(vm.currentPlan.state).toBe("current");
    expect(vm.currentProfile).toMatchObject({ monthlyIncomeKrw: 5_000_000 });
    expect(currentProfile.monthlyIncomeNet).toBe(5_000_000);
  });

  it("keeps legacy scenario-only runs unverified with a planning handoff", async () => {
    mocks.runs.mockResolvedValue([{ ...sampleRun, profileId: "current-profile",
      scenario: { name: "과거 시나리오", patches: [{ path: "/monthlyIncomeNet", op: "multiply", value: 1.1 }] },
      reproducibility: { profileHash: "legacy-hash" },
    }]);
    const vm = await loadDashboardViewModel();
    expect(vm.currentPlan.state).toBe("unverified");
    expect(vm.currentPlan).not.toHaveProperty("rerunInput");
    const html = renderToStaticMarkup(<DashboardClient initialViewModel={vm} />);
    expect(html).not.toContain("현재 프로필로 다시 계산</button>");
    expect(html).toContain('href="/planning?profileId=current-profile"');
  });

  it("keeps an unappliable stored scenario stale for a safe create-run error and condition review", async () => {
    mocks.runs.mockResolvedValue([{ ...sampleRun, profileId: "current-profile",
      input: { horizonMonths: 24, snapshotId: "old-snapshot", scenario: { patch: [{ op: "debt.mulMinimumPayment", debtId: "removed-loan", value: 1.1 }] } },
      reproducibility: { profileHash: "old-hash" },
    }]);
    const vm = await loadDashboardViewModel();
    expect(vm.currentPlan.state).toBe("stale");
    expect(vm.currentProfile).toMatchObject({ monthlyIncomeKrw: 5_000_000 });
  });

  it("loads the current profile beyond the global six and skips failed/running runs across pages", async () => {
    mocks.runs.mockImplementation(async (options) => {
      expect(getScopedPlanningUserId()).toBe("dashboard-user");
      if (!options.profileId) return Array.from({ length: 6 }, (_, i) => ({ ...sampleRun, id: `other-${i}` }));
      expect(options.profileId).toBe("current-profile");
      if (!options.offset) return Array.from({ length: 100 }, (_, i) => ({ ...sampleRun, profileId: "current-profile", overallStatus: i % 2 ? "FAILED" : "RUNNING" }));
      return [{ ...sampleRun, id: "partial", profileId: "current-profile", overallStatus: "PARTIAL_SUCCESS" },
        { ...sampleRun, id: "older-success", profileId: "current-profile" }];
    });
    const vm = await loadDashboardViewModel();
    expect(vm.currentPlan).toMatchObject({ state: "unverified", run: { id: "partial" } });
    expect(vm.runs).toHaveLength(6);
    expect(mocks.runs).toHaveBeenCalledWith({ profileId: "current-profile", limit: 100, offset: 100 });
  });

  it.each(["FAILED", "RUNNING", undefined])("does not present %s outputs as a completed current plan", async (overallStatus) => {
    mocks.runs.mockResolvedValue([{ ...sampleRun, profileId: "current-profile", overallStatus }]);
    const vm = await loadDashboardViewModel();
    expect(vm.currentPlan.state).toBe("failed");
    expect(vm.currentPlan).not.toHaveProperty("run");
    expect(vm.runs).toHaveLength(1);
  });

  it("keeps a missing A plan distinct from existing B plans", async () => {
    const vm = await loadDashboardViewModel();
    expect(vm.currentPlan).toEqual({ state: "missing" });
    expect(renderToStaticMarkup(<DashboardClient initialViewModel={vm} />)).toContain("현재 프로필로 저장한 플랜이 없습니다.");
  });

  it("preserves recent runs if only the current profile run lookup fails", async () => {
    mocks.runs.mockImplementation(async (options) => {
      if (options.profileId) throw new Error("secret scoped run path");
      return [sampleRun];
    });
    const vm = await loadDashboardViewModel();
    expect(vm.currentPlan.state).toBe("failed");
    expect(vm.runsLoadState).toBe("loaded");
    expect(vm.currentProfile.state).toBe("loaded");
    expect(JSON.stringify(vm)).not.toContain("secret scoped run path");
  });

  it("preserves current metrics when hashing fails", async () => {
    mocks.runs.mockResolvedValue([{ ...sampleRun, profileId: "current-profile", reproducibility: { profileHash: "stored-hash" } }]);
    const cyclic = { ...currentProfile, extra: {} };
    cyclic.extra = cyclic;
    mocks.profiles.mockResolvedValue({ defaultProfileId: "current-profile", profiles: [{ id: "current-profile", profile: cyclic }] });
    const vm = await loadDashboardViewModel();
    expect(vm.currentProfile.state).toBe("loaded");
    expect(vm.currentPlan.state).toBe("failed");
  });

  it("keeps a verified current plan when only the global recent list fails", async () => {
    mocks.runs.mockImplementation(async (options) => {
      if (!options.profileId) throw new Error("global index unavailable");
      return [{ ...sampleRun, profileId: "current-profile", reproducibility: { profileHash: computeProfileHash(currentProfile) } }];
    });
    const vm = await loadDashboardViewModel();
    expect(vm.runsLoadState).toBe("failed");
    expect(vm.currentPlan.state).toBe("current");
    const html = renderToStaticMarkup(<DashboardClient initialViewModel={vm} />);
    expect(html).toContain("최근 플랜 리포트 보기");
    expect(html).toContain("최근 실행 기록을 불러오지 못했습니다");
  });

  it("selects the latest completed run even when its inline summary is absent", async () => {
    mocks.runs.mockResolvedValue([
      { ...sampleRun, id: "latest-compact", profileId: "current-profile", outputs: {}, reproducibility: { profileHash: computeProfileHash(currentProfile) } },
      { ...sampleRun, id: "older-summary", profileId: "current-profile" },
    ]);
    const vm = await loadDashboardViewModel();
    expect(vm.currentPlan).toMatchObject({ state: "current", run: { id: "latest-compact" } });
    const html = renderToStaticMarkup(<DashboardClient initialViewModel={vm} />);
    expect(html).toMatch(/말기 순자산<\/p><p[^>]*>-<\/p>/);
  });

  it("continues past metadata holes using index pagination instead of the filtered run count", async () => {
    mocks.runs.mockImplementation(async (options) => {
      if (!options.profileId) return [];
      return options.offset === 0
        ? Array.from({ length: 99 }, () => ({ ...sampleRun, profileId: "current-profile", overallStatus: "FAILED" }))
        : [{ ...sampleRun, id: "after-hole", profileId: "current-profile" }];
    });
    mocks.index.mockImplementation(async () => {
      expect(getScopedPlanningUserId()).toBe("dashboard-user");
      return Array.from({ length: 100 }, (_, i) => ({ id: `index-${i}`, profileId: "current-profile" }));
    });
    const vm = await loadDashboardViewModel();
    expect(vm.currentPlan).toMatchObject({ state: "unverified", run: { id: "after-hole" } });
    expect(mocks.index).toHaveBeenCalledWith({ profileId: "current-profile", limit: 100, offset: 0 });
  });

  it("does not treat an unresolved default profile as no profile", async () => {
    mocks.profiles.mockResolvedValue({ profiles: [], defaultProfileId: "missing-record" });
    expect((await loadDashboardViewModel()).currentProfile.state).toBe("failed");
  });

  it("keeps both repositories inside the current page user scope", async () => {
    mocks.profiles.mockImplementation(async () => {
      expect(getScopedPlanningUserId()).toBe("dashboard-user");
      return { profiles: [] };
    });
    mocks.runs.mockImplementation(async () => {
      expect(getScopedPlanningUserId()).toBe("dashboard-user");
      return [];
    });
    const vm = await loadDashboardViewModel();
    expect(vm.runsLoadState).toBe("loaded");
    expect(vm.currentProfile.state).toBe("missing");
    expect(mocks.runs).toHaveBeenCalledWith({ limit: 6 });
    expect(getScopedPlanningUserId()).toBeUndefined();
  });

  it("does not read either repository outside a failed user scope", async () => {
    mocks.authFails = true;
    const vm = await loadDashboardViewModel();
    expect(vm.runsLoadState).toBe("failed");
    expect(vm.currentProfile.state).toBe("failed");
    expect(mocks.runs).not.toHaveBeenCalled();
    expect(mocks.profiles).not.toHaveBeenCalled();
  });

  it("preserves saved run limit, report, history, rerun, and action links", async () => {
    // The rerun link needs the run's profile in the authenticated list (see dashboard-profile-selection tests).
    mocks.profiles.mockResolvedValue({
      defaultProfileId: "current-profile",
      profiles: [
        { id: "current-profile", name: "현재 기본", profile: currentProfile, updatedAt: "2026-09-06T00:00:00.000Z" },
        { id: "profile-1", name: "최근 플랜 프로필", profile: currentProfile, updatedAt: "2026-07-01T00:00:00.000Z" },
      ],
    });
    mocks.runs.mockResolvedValue(Array.from({ length: 8 }, (_, i) => ({ ...sampleRun, id: `run-${i}` })));
    const vm = await loadDashboardViewModel();
    expect(vm.runs).toHaveLength(6);
    const html = renderToStaticMarkup(<DashboardClient initialViewModel={vm} />);
    for (const text of ["/planning/runs", "/planning/reports?runId=run-0", "/planning?profileId=profile-1", "비상금 먼저 점검", "고정지출 확인", "액션 이어보기"]) {
      expect(html).toContain(text);
    }
  });

  it("keeps zero and negative current amounts meaningful without a run", async () => {
    mocks.runs.mockResolvedValue([]);
    mocks.profiles.mockResolvedValue({ defaultProfileId: "p", profiles: [{ id: "p", profile: {
      ...currentProfile, monthlyIncomeNet: 0, liquidAssets: 0, investmentAssets: 0, goals: [],
    } }] });
    expect((await loadDashboardViewModel()).currentProfile).toMatchObject({
      state: "loaded", monthlyIncomeKrw: 0, monthlySurplusKrw: -3_500_000, netWorthKrw: -10_000_000,
    });
  });

  it.each([
    { id: "default-profile", updatedAt: "2026-09-06T00:00:00.000Z", extra: {}, state: "missing" },
    { id: "user-created-zero", updatedAt: "2026-09-06T00:00:00.000Z", extra: {}, state: "loaded" },
    { id: "default-profile", updatedAt: "2026-09-06T01:00:00.000Z", extra: {}, state: "loaded" },
    { id: "default-profile", updatedAt: "2026-09-06T00:00:00.000Z", extra: { currentAge: 35 }, state: "loaded" },
  ])("distinguishes the untouched repository seed from saved zero input: $id / $state", async ({ id, updatedAt, extra, state }) => {
    mocks.profiles.mockResolvedValue({ defaultProfileId: id, profiles: [{
      id, name: "기본 프로필", createdAt: "2026-09-06T00:00:00.000Z", updatedAt,
      profile: { monthlyIncomeNet: 0, monthlyEssentialExpenses: 0, monthlyDiscretionaryExpenses: 0,
        liquidAssets: 0, investmentAssets: 0, debts: [], goals: [], ...extra },
    }] });
    const vm = await loadDashboardViewModel();
    expect(vm.currentProfile.state).toBe(state);
    if (state === "loaded") expect(vm.currentProfile).toMatchObject({ monthlySurplusKrw: 0, netWorthKrw: 0 });
  });
});
