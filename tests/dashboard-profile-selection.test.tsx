import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardClient } from "../src/components/DashboardClient";
import DashboardPage from "../src/app/dashboard/page";
import { loadDashboardViewModel } from "../src/app/dashboard/_lib/dashboardViewModel";
import {
  buildDashboardAuthCallbackPath,
  parseDashboardProfileSelection,
} from "../src/app/dashboard/_lib/dashboardProfileSelection";
import { PlanningAuthError } from "../src/lib/planning/auth/currentUser";
import { buildPlanningRunArtifacts } from "../src/lib/planning/server/v2/runArtifacts";
import { simulateMonthly } from "../src/lib/planning/v2/simulateMonthly";
import { computeProfileHash } from "../src/lib/planning/v2/reproducibility";
import type { ProfileV2 } from "../src/lib/planning/v2/types";

const mocks = vi.hoisted(() => ({ profiles: vi.fn(), runs: vi.fn(), index: vi.fn(), authError: null as Error | null }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/planning/server/profiles/repository", () => ({ listCurrentUserProfilesWithDefault: mocks.profiles }));
vi.mock("@/lib/planning/server/runs/repository", () => ({ listCurrentUserRuns: mocks.runs, listCurrentUserRunIndexEntries: mocks.index }));
vi.mock("@/lib/planning/server/pageAuth", () => ({
  withCurrentPlanningPageUser: async <T,>(callback: () => Promise<T>) => {
    if (mocks.authError) throw mocks.authError;
    return callback();
  },
}));

const SEED_AT = "2026-10-18T00:00:00.000Z";
const savedId = "3f9c2b1e-1111-4222-8333-944455556666";
const otherId = "aa11bb22-3333-4444-8555-666677778888";
const zero = { monthlyIncomeNet: 0, monthlyEssentialExpenses: 0, monthlyDiscretionaryExpenses: 0, liquidAssets: 0, investmentAssets: 0, debts: [], goals: [] };
const saved: ProfileV2 = { ...zero, monthlyIncomeNet: 4_650_000, monthlyEssentialExpenses: 1_850_000, monthlyDiscretionaryExpenses: 550_000, liquidAssets: 3_200_000, investmentAssets: 2_100_000 };
const other: ProfileV2 = { ...zero, monthlyIncomeNet: 9_000_000 };

const seedRecord = { id: "default-profile", name: "기본 프로필", createdAt: SEED_AT, updatedAt: SEED_AT, profile: zero };
const savedRecord = { id: savedId, name: "통합검증 사용자 프로필", createdAt: "2026-10-18T01:00:00.000Z", updatedAt: "2026-10-18T01:00:00.000Z", profile: saved };
const otherRecord = { id: otherId, name: "  ", createdAt: "2026-10-18T02:00:00.000Z", updatedAt: "2026-10-18T02:00:00.000Z", profile: other };

function runFor(profileId: string, profile: ProfileV2, id: string) {
  const artifacts = buildPlanningRunArtifacts({
    profile, policyId: "balanced", snapshotMeta: { asOf: "2026-10-01" }, healthSummary: {},
    simulatePlan: simulateMonthly(profile, { inflation: 0, expectedReturn: 0 }, 12),
    scenariosOutput: null, monteCarloOutput: null, actionsOutput: null, debtStrategyOutput: null,
  });
  return {
    id, profileId, title: `${id} 플랜`, createdAt: "2026-10-18T03:00:00.000Z", overallStatus: "SUCCESS",
    input: { horizonMonths: 12, snapshotId: "snap-1" }, meta: { snapshot: { asOf: "2026-10-01" } },
    reproducibility: { profileHash: computeProfileHash(profile) },
    outputs: {
      ...artifacts.outputs, resultDto: artifacts.resultDto,
      actions: { actions: [{ code: "other-action", title: `${id} 액션`, summary: "요약", steps: [], candidates: [] }] },
    },
  };
}

function visibleText(html: string) {
  return html.replace(/<[^>]+>/g, " ");
}

const load = (request: Parameters<typeof parseDashboardProfileSelection>[0]) =>
  loadDashboardViewModel(undefined, undefined, undefined, parseDashboardProfileSelection(request));

describe("dashboard profile selection", () => {
  beforeEach(() => {
    mocks.authError = null;
    mocks.profiles.mockReset().mockResolvedValue({ defaultProfileId: "default-profile", profiles: [savedRecord, otherRecord, seedRecord] });
    mocks.runs.mockReset().mockImplementation(async ({ profileId }: { profileId?: string } = {}) => {
      const rows = [runFor(otherId, other, "run-other")];
      return profileId ? rows.filter((run) => run.profileId === profileId) : rows;
    });
    mocks.index.mockReset().mockResolvedValue([]);
  });

  it("parses only one well-formed id and keeps malformed or repeated values as explicit errors", () => {
    expect(parseDashboardProfileSelection(undefined)).toEqual({ kind: "none" });
    expect(parseDashboardProfileSelection(` ${savedId} `)).toEqual({ kind: "requested", profileId: savedId });
    for (const raw of ["", "   ", "../x", "https://evil.example", "a".repeat(129), [savedId, otherId]]) {
      expect(parseDashboardProfileSelection(raw)).toEqual({ kind: "invalid" });
    }
  });

  it("asks for a choice when the default is the untouched seed and saved profiles exist", async () => {
    const vm = await load(undefined);
    expect(vm.currentProfile).toEqual({ state: "selection-required" });
    expect(vm.currentPlan).toEqual({ state: "missing" });
    expect(vm.profileSelection?.options.map((option) => [option.id, option.isDefault])).toEqual([
      [savedId, false], [otherId, false], ["default-profile", true],
    ]);
    const html = renderToStaticMarkup(<DashboardClient initialViewModel={vm} />);
    expect(html).toContain('data-testid="dashboard-selection-required"');
    expect(html).toMatch(/<form[^>]*data-testid="dashboard-profile-selector"[^>]*action="\/dashboard" method="get"/);
    expect(html).toContain('<option value="" disabled="" selected="">프로필을 선택하세요</option>');
    expect(html).toContain('name="profileId"');
    expect(html).toContain("이 프로필 보기");
    // The other profile's run must not become the primary guidance.
    const nextAction = html.match(/<div[^>]*data-testid="dashboard-next-action"[\s\S]*?<\/div>/)?.[0] ?? "";
    expect(nextAction).toContain("표시할 프로필을 먼저 선택하세요");
    expect(nextAction).not.toContain("run-other");
    expect(html).not.toContain("아직 입력된 재무 정보가 없습니다");
    expect(visibleText(html)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it("shows the selected profile's metrics, plan and links without touching the default", async () => {
    mocks.runs.mockImplementation(async ({ profileId }: { profileId?: string } = {}) => {
      const rows = [runFor(otherId, other, "run-other"), runFor(savedId, saved, "run-saved")];
      return profileId ? rows.filter((run) => run.profileId === profileId) : rows;
    });
    const vm = await load(savedId);
    expect(vm.currentProfile).toMatchObject({
      state: "loaded", id: savedId, source: "selected", name: "통합검증 사용자 프로필",
      monthlyIncomeKrw: 4_650_000, monthlyExpensesKrw: 2_400_000, monthlySurplusKrw: 2_250_000, netWorthKrw: 5_300_000,
    });
    expect(vm.currentPlan).toMatchObject({ state: "current", run: { id: "run-saved", profileId: savedId } });
    expect(vm.profileSelection).toMatchObject({ selectedProfileId: savedId });
    expect(vm.profileSelection?.options.find((option) => option.isDefault)?.id).toBe("default-profile");
    const html = renderToStaticMarkup(<DashboardClient initialViewModel={vm} />);
    expect(html).toContain("선택한 프로필: 통합검증 사용자 프로필");
    expect(html).toContain(`href="/planning/reports?runId=run-saved&amp;profileId=${savedId}"`);
    expect(html).toContain(`href="/planning?profileId=${savedId}"`);
    expect(html).toContain(`<option value="${savedId}" selected="">`);
    expect(html).toContain("run-saved 액션");
    expect(visibleText(html)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it("keeps the selected profile without a run distinct from another profile's run", async () => {
    const vm = await load(savedId);
    expect(vm.currentProfile).toMatchObject({ state: "loaded", id: savedId });
    expect(vm.currentPlan).toEqual({ state: "missing" });
    const html = renderToStaticMarkup(<DashboardClient initialViewModel={vm} />);
    const nextAction = html.match(/<div[^>]*data-testid="dashboard-next-action"[\s\S]*?<\/div>/)?.[0] ?? "";
    expect(nextAction).toContain("첫 재무 진단을 시작하세요");
    expect(nextAction).toContain(`href="/planning?profileId=${savedId}"`);
    expect(nextAction).not.toContain("run-other");
    // The all-profile history stays, labelled with the real target name (blank names are labelled).
    expect(html).toContain("프로필: 이름 없는 프로필");
  });

  it.each([
    { name: "deleted or other-user id", request: "bb11cc22-3333-4444-8555-666677778888" },
    { name: "malformed id", request: "../etc" },
    { name: "empty id", request: "" },
    { name: "repeated id", request: [savedId, otherId] },
  ])("rejects a $name without falling back to the default or another profile", async ({ request }) => {
    const vm = await load(request);
    expect(vm.currentProfile.state).toBe("selection-invalid");
    expect(vm.currentPlan).toEqual({ state: "missing" });
    const html = renderToStaticMarkup(<DashboardClient initialViewModel={vm} />);
    expect(html).toContain('data-testid="dashboard-selection-invalid"');
    expect(html).toContain('data-testid="dashboard-profile-selector"');
    expect(html).not.toContain("월 순수입");
  });

  it("shows a user-created zero profile as real input", async () => {
    const zeroId = "cc11dd22-3333-4444-8555-666677778888";
    mocks.profiles.mockResolvedValue({ defaultProfileId: "default-profile", profiles: [
      seedRecord, { id: zeroId, name: "0원 프로필", createdAt: SEED_AT, updatedAt: SEED_AT, profile: zero },
    ] });
    expect((await load(zeroId)).currentProfile).toMatchObject({ state: "loaded", id: zeroId, monthlyIncomeKrw: 0, netWorthKrw: 0 });
    expect((await load(undefined)).currentProfile).toEqual({ state: "selection-required" });
  });

  it("keeps the seed alone as no input and an explicitly chosen seed as no input", async () => {
    mocks.profiles.mockResolvedValue({ defaultProfileId: "default-profile", profiles: [seedRecord] });
    expect((await load(undefined)).currentProfile).toEqual({ state: "missing" });
    mocks.profiles.mockResolvedValue({ defaultProfileId: "default-profile", profiles: [savedRecord, seedRecord] });
    expect((await load("default-profile")).currentProfile).toEqual({ state: "missing", id: "default-profile" });
  });

  it("keeps an explicitly chosen empty seed in its planning links when another profile is the default", async () => {
    mocks.profiles.mockResolvedValue({ defaultProfileId: savedId, profiles: [savedRecord, seedRecord] });
    const vm = await load("default-profile");
    expect(vm.currentProfile).toEqual({ state: "missing", id: "default-profile" });
    expect(vm.profileSelection?.selectedProfileId).toBe("default-profile");
    const html = renderToStaticMarkup(<DashboardClient initialViewModel={vm} />);
    expect(html).toContain('href="/planning?profileId=default-profile"');
    expect(html).not.toContain('href="/planning"');
    expect(html).not.toContain(`href="/planning?profileId=${savedId}"`);

    // Without an explicit selection the empty seed stays the default's plain planning entry.
    mocks.profiles.mockResolvedValue({ defaultProfileId: "default-profile", profiles: [seedRecord] });
    const plain = await load(undefined);
    expect(plain.currentProfile).toEqual({ state: "missing" });
    expect(renderToStaticMarkup(<DashboardClient initialViewModel={plain} />)).toContain('href="/planning"');
  });

  it("labels runs whose profile cannot be resolved without exposing the id", async () => {
    mocks.runs.mockResolvedValue([runFor("dd11ee22-3333-4444-8555-666677778888", other, "run-orphan")]);
    const vm = await load(savedId);
    expect(vm.runs[0]).toMatchObject({ profileLabel: "연결된 프로필을 확인할 수 없습니다" });
    const html = renderToStaticMarkup(<DashboardClient initialViewModel={vm} />);
    expect(html).toContain("프로필: 연결된 프로필을 확인할 수 없습니다");
    expect(visibleText(html)).not.toContain("dd11ee22");
  });

  it("offers recalculation only for recent runs whose profile is in the authenticated profile list", async () => {
    const deletedId = "dd11ee22-3333-4444-8555-666677778888";
    const recentSection = (html: string) => html.slice(html.indexOf('aria-labelledby="dashboard-recent-title"'), html.indexOf('data-testid="dashboard-secondary-tools"'));
    const recalc = (profileId: string) => `href="/planning?profileId=${profileId}"`;
    mocks.runs.mockImplementation(async ({ profileId }: { profileId?: string } = {}) => {
      const rows = [runFor(otherId, other, "run-other"), runFor(deletedId, other, "run-orphan")];
      return profileId ? rows.filter((run) => run.profileId === profileId) : rows;
    });

    // A linked run keeps its CTA even when another profile is the one shown; the orphan run does not get one.
    const linked = recentSection(renderToStaticMarkup(<DashboardClient initialViewModel={await load(savedId)} />));
    expect(linked).toContain(recalc(otherId));
    expect(linked).not.toContain(recalc(deletedId));
    expect(linked).toContain('href="/planning/reports?runId=run-other"');
    expect(linked).toContain('href="/planning/reports?runId=run-orphan"');

    // Neither a failed nor an empty profile list can confirm a link, so no run gets the CTA.
    for (const profiles of [
      () => mocks.profiles.mockRejectedValue(new Error("store unavailable")),
      () => mocks.profiles.mockResolvedValue({ profiles: [] }),
    ]) {
      profiles();
      const html = recentSection(renderToStaticMarkup(<DashboardClient initialViewModel={await load(undefined)} />));
      expect(html).not.toContain("같은 조건으로 다시 계산");
      expect(html).toContain('href="/planning/reports?runId=run-other"');
      expect(html).toContain('href="/planning/reports?runId=run-orphan"');
    }
  });

  it("reports a storage failure for an explicit selection as a failure, not a missing selection", async () => {
    mocks.profiles.mockRejectedValue(new Error("store unavailable"));
    const vm = await load(savedId);
    expect(vm.currentProfile.state).toBe("failed");
    expect(vm.currentPlan.state).toBe("failed");
    expect(vm.runs[0]).toMatchObject({ profileLabel: "연결된 프로필을 확인할 수 없습니다" });
  });

  it("keeps auth fail-closed and returns to the same validated selection only", async () => {
    mocks.authError = new PlanningAuthError("UNAUTHENTICATED", "데스크톱 세션을 확인하지 못했습니다.", 401, "desktop-launcher");
    await expect(load(savedId)).rejects.toBe(mocks.authError);
    expect(mocks.profiles).not.toHaveBeenCalled();
    const desktop = renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({ profileId: savedId }) }));
    expect(desktop).toContain(`href="/dashboard?profileId=${savedId}"`);
    expect(desktop).toContain('data-planning-navigation-state="/dashboard"');

    mocks.authError = new PlanningAuthError("UNAUTHENTICATED", "로그인이 필요합니다.", 401);
    const web = renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({ profileId: savedId }) }));
    expect(web).toContain(`/api/auth/signin?callbackUrl=${encodeURIComponent(`/dashboard?profileId=${savedId}`)}`);
    // An unusable explicit selection returns to an internal URL that is invalid again, never to the default.
    const invalidCallback = `/api/auth/signin?callbackUrl=${encodeURIComponent("/dashboard?profileId=")}"`;
    for (const profileId of ["https://evil.example/x", "", [savedId, otherId]]) {
      const html = renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({ profileId }) }));
      expect(html).toContain(invalidCallback);
      expect(html).not.toContain("evil.example");
      expect(html).not.toContain(otherId);
    }
    expect(buildDashboardAuthCallbackPath({ kind: "invalid" })).toBe("/dashboard?profileId=");
    expect(parseDashboardProfileSelection("")).toEqual({ kind: "invalid" });
    expect(buildDashboardAuthCallbackPath({ kind: "none" })).toBe("/dashboard");

    mocks.authError = new PlanningAuthError("UNAUTHENTICATED", "데스크톱 세션을 확인하지 못했습니다.", 401, "desktop-launcher");
    const desktopInvalid = renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({ profileId: [savedId, otherId] }) }));
    expect(desktopInvalid).toContain('href="/dashboard?profileId="');
  });

  it("distinguishes duplicate profile names in the selector", async () => {
    mocks.profiles.mockResolvedValue({ defaultProfileId: savedId, profiles: [
      savedRecord, { ...otherRecord, name: "통합검증 사용자 프로필" },
    ] });
    const html = renderToStaticMarkup(<DashboardClient initialViewModel={await load(undefined)} />);
    expect(html).toContain("통합검증 사용자 프로필 (1번째) · 기본 지정");
    expect(html).toContain("통합검증 사용자 프로필 (2번째)");
  });
});
