import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlanningAuthError } from "../src/lib/planning/auth/currentUser";
import { loadDashboardViewModel } from "../src/app/dashboard/_lib/dashboardViewModel";
import DashboardPage from "../src/app/dashboard/page";
import {
  describeDashboardExchangeFailure,
  describeDashboardFxFailure,
  fetchDashboardJson,
  formatDashboardDateTime,
  parseDashboardExchange,
  parseDashboardFx,
} from "../src/components/dashboard/dashboardClientModel";
import { DashboardFxSection } from "../src/components/dashboard/DashboardFxSection";

const mocks = vi.hoisted(() => ({
  profiles: vi.fn(),
  runs: vi.fn(),
  index: vi.fn(),
  authError: null as Error | null,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/planning/server/profiles/repository", () => ({ listCurrentUserProfilesWithDefault: mocks.profiles }));
vi.mock("@/lib/planning/server/runs/repository", () => ({ listCurrentUserRuns: mocks.runs, listCurrentUserRunIndexEntries: mocks.index }));
vi.mock("@/lib/planning/server/pageAuth", () => ({
  withCurrentPlanningPageUser: async <T,>(callback: () => Promise<T>) => {
    if (mocks.authError) throw mocks.authError;
    return callback();
  },
}));

const NOW = new Date("2026-10-18T03:00:00.000Z");

describe("dashboard session recovery", () => {
  beforeEach(() => {
    mocks.authError = null;
    mocks.profiles.mockReset().mockResolvedValue({ profiles: [], defaultProfileId: "" });
    mocks.runs.mockReset().mockResolvedValue([]);
    mocks.index.mockReset().mockResolvedValue([]);
  });

  it("propagates a desktop session error instead of turning it into a retryable storage failure", async () => {
    mocks.authError = new PlanningAuthError(
      "UNAUTHENTICATED",
      "데스크톱 세션을 확인하지 못했습니다. 앱 실행 아이콘이나 시작 명령으로 다시 열어 주세요.",
      401,
      "desktop-launcher",
    );
    await expect(loadDashboardViewModel()).rejects.toBe(mocks.authError);
    expect(mocks.runs).not.toHaveBeenCalled();
    expect(mocks.profiles).not.toHaveBeenCalled();
  });

  it("keeps non-auth failures as the existing temporary storage failure", async () => {
    mocks.authError = new Error("store unavailable");
    const vm = await loadDashboardViewModel();
    expect(vm.runsLoadState).toBe("failed");
    expect(vm.currentProfile.state).toBe("failed");
  });

  it("renders launcher recovery with a /dashboard return instead of a reload loop", async () => {
    mocks.authError = new PlanningAuthError("UNAUTHENTICATED", "데스크톱 세션을 확인하지 못했습니다.", 401, "desktop-launcher");
    const html = renderToStaticMarkup(await DashboardPage({}));
    expect(html).toContain("앱 실행 경로로 다시 열어 주세요.");
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain("세션 다시 확인");
    expect(html).not.toContain("최근 플랜 다시 불러오기");
    expect(html).not.toContain("/api/auth/signin");
    expect(html).not.toContain("dashboard-root");
  });

  it("routes web sign-in back to /dashboard and storage-mode setup errors to the setup state", async () => {
    mocks.authError = new PlanningAuthError("UNAUTHENTICATED", "로그인이 필요합니다.", 401);
    expect(renderToStaticMarkup(await DashboardPage({}))).toContain("/api/auth/signin?callbackUrl=%2Fdashboard");

    mocks.authError = new PlanningAuthError("INVALID_STORAGE_MODE", "저장소 모드가 올바르지 않습니다.", 500);
    const html = renderToStaticMarkup(await DashboardPage({}));
    expect(html).toContain("로컬 실행 설정 확인 필요");
    expect(html).not.toContain("/api/auth/signin");
  });

  it("keeps the normal dashboard for an authenticated session", async () => {
    const html = renderToStaticMarkup(await DashboardPage({}));
    expect(html).toContain('data-testid="dashboard-root"');
    expect(html).not.toContain("앱 실행 경로로 다시 열어 주세요.");
  });
});

describe("dashboard FX provenance", () => {
  const items = [{ currency: "USD", amount: 1000, rate: 1380.5, asOfDate: "2026-10-17", krw: 1_380_500 }];

  it("labels a live KEXIM response with its source and quote date", () => {
    const fx = parseDashboardFx({
      ok: true,
      data: { items },
      meta: { cache: "miss", provenance: { mode: "live", degraded: false, asOf: "2026-10-17", source: "한국수출입은행" } },
    }, NOW);
    expect(fx.items).toHaveLength(1);
    expect(fx.status).toMatchObject({
      state: "live",
      label: "실시간 원천 조회",
      sourceLabel: "한국수출입은행",
      asOf: "2026-10-17",
      isExample: false,
    });
  });

  it("marks env-missing mock quotes as example data that needs setup, not as KEXIM values", () => {
    const fx = parseDashboardFx({
      ok: true,
      data: { items },
      meta: { cache: "miss", provenance: { mode: "mock", degraded: true, degradedReason: "env-missing", asOf: "2026-06-22", source: "한국수출입은행" } },
    }, NOW);
    expect(fx.status).toMatchObject({ state: "mock", label: "예시 데이터", isExample: true, setupRequired: true });
    expect(fx.status.sourceLabel).toContain("예시");
    expect(fx.status.sourceLabel).not.toBe("한국수출입은행");
    expect(fx.status.notice).toContain("설정");

    const html = renderToStaticMarkup(<DashboardFxSection fx={fx} exchange={null} loading={false} />);
    expect(html).toContain("예시 데이터");
    expect(html).toContain("실제 환율이 아닙니다");
    expect(html).toContain('href="/settings/data-sources"');
    expect(html).toContain('href="/tools/fx"');
    expect(html).not.toContain("실시간 원천 조회");
  });

  it("distinguishes an upstream failure replaced by example quotes from missing setup", () => {
    const fx = parseDashboardFx({
      ok: true,
      data: { items },
      meta: { cache: "hit", provenance: { mode: "mock", degraded: true, degradedReason: "timeout", asOf: "2026-06-22", source: "한국수출입은행" } },
    }, NOW);
    expect(fx.status).toMatchObject({ state: "mock", isExample: true, setupRequired: false });
    expect(fx.status.notice).toContain("조회하지 못해");
  });

  it("reports cached real quotes as cached and keeps their source", () => {
    const fx = parseDashboardFx({
      ok: true,
      data: { items },
      meta: { cache: "hit", provenance: { mode: "live", degraded: false, asOf: "2026-10-17", source: "한국수출입은행" } },
    }, NOW);
    expect(fx.status).toMatchObject({ state: "cache", label: "응답 캐시 사용", sourceLabel: "한국수출입은행", isExample: false });
  });

  it("does not present quotes without verifiable provenance as real values", () => {
    const fx = parseDashboardFx({ ok: true, data: { items }, meta: {} }, NOW);
    expect(fx.status).toMatchObject({ state: "unavailable", isExample: false });
    const html = renderToStaticMarkup(<DashboardFxSection fx={fx} exchange={null} loading={false} />);
    expect(html).toContain("출처 확인 필요");
  });

  it("separates FX setup failures from transient request failures", async () => {
    const configError = await fetchDashboardJson("/api/public/fx", {
      fetchImpl: async () => new Response(JSON.stringify({ ok: false, error: { code: "CONFIG", message: "KEXIM_API_KEY 설정이 필요합니다." } }), { status: 503 }),
    }).then(() => null, (error: unknown) => error);
    expect(describeDashboardFxFailure(configError)).toMatchObject({ state: "setup-required", items: [] });
    expect(describeDashboardFxFailure(configError).status.notice).not.toContain("KEXIM_API_KEY");

    const upstream = await fetchDashboardJson("/api/public/fx", {
      fetchImpl: async () => new Response(JSON.stringify({ ok: false, error: { code: "UPSTREAM", message: "fail" } }), { status: 502 }),
    }).then(() => null, (error: unknown) => error);
    expect(describeDashboardFxFailure(upstream)).toMatchObject({ state: "failed", items: [] });

    const html = renderToStaticMarkup(<DashboardFxSection fx={describeDashboardFxFailure(configError)} exchange={null} loading={false} />);
    expect(html).toContain("환율 연결 설정 필요");
    expect(html).not.toContain("= -");
  });

  const realNumbers = ["138만원", "1,380.5"];

  it.each([
    { name: "source missing", meta: { cache: "miss", provenance: { mode: "live", degraded: false, asOf: "2026-10-17" } } },
    { name: "unknown mode with a cache hit", meta: { cache: "hit", provenance: { mode: "replay", asOf: "2026-10-17", source: "한국수출입은행" } } },
    { name: "synthesized legacy cache provenance", meta: { cache: "hit", provenance: { mode: "cache", degraded: true, degradedReason: "legacy-cache" } } },
    { name: "meta missing", meta: undefined },
  ])("hides FX numbers when provenance cannot be verified: $name", ({ meta }) => {
    const fx = parseDashboardFx({ ok: true, data: { items }, ...(meta ? { meta } : {}) }, NOW);
    expect(fx.state).toBe("unavailable");
    expect(fx.status).toMatchObject({ label: "출처 확인 필요", isExample: false });
    const html = renderToStaticMarkup(<DashboardFxSection fx={fx} exchange={null} loading={false} />);
    for (const value of realNumbers) expect(html).not.toContain(value);
    expect(html).not.toContain("실시간 원천 조회");
    expect(html).not.toContain("응답 캐시 사용");
    expect(html).toContain('href="/settings/data-sources"');
  });

  it("keeps explicit mock quotes visible only with the example marker, even without a source", () => {
    const fx = parseDashboardFx({
      ok: true,
      data: { items },
      meta: { cache: "miss", provenance: { mode: "mock", degraded: true, degradedReason: "env-missing", asOf: "2026-06-22" } },
    }, NOW);
    const html = renderToStaticMarkup(<DashboardFxSection fx={fx} exchange={null} loading={false} />);
    expect(html).toContain("[예시]");
    expect(html).toContain("138만원");
    expect(html).not.toContain("출처 한국수출입은행");
  });

  const cachedExchange = (reason: string, nextRetryAt?: string) => ({
    ok: true,
    data: { asOf: "2026-10-16", base: "KRW", rates: { USD: 1380 }, rawMeta: { source: "EXIM" } },
    meta: { cache: "hit", fallback: { mode: "CACHE", sourceKey: "exchange", reason, ...(nextRetryAt ? { nextRetryAt } : {}) } },
  });

  it("separates a normal cache hit from degraded cache fallbacks on screen", () => {
    const nextRetryAt = "2026-10-18T03:02:00.000Z";
    const retryText = formatDashboardDateTime(nextRetryAt);
    const normal = parseDashboardExchange(cachedExchange("cache_hit"));
    const liveFailed = parseDashboardExchange(cachedExchange("live_failed_cache_hit", nextRetryAt));
    const cooldown = parseDashboardExchange(cachedExchange("cooldown_cache_hit", nextRetryAt));

    expect(normal).toMatchObject({ state: "cache", label: "응답 캐시 사용", nextRetryAt: null });
    expect(liveFailed).toMatchObject({ state: "degraded-cache", usdRate: 1380, asOf: "2026-10-16", sourceLabel: "한국수출입은행", nextRetryAt });
    expect(cooldown).toMatchObject({ state: "degraded-cache", usdRate: 1380, nextRetryAt });
    expect(liveFailed.label).toContain("조회 실패");
    expect(cooldown.label).toContain("재시도 대기");

    const render = (exchange: ReturnType<typeof parseDashboardExchange>) =>
      renderToStaticMarkup(<DashboardFxSection fx={null} exchange={exchange} loading={false} />);
    const normalHtml = render(normal);
    expect(normalHtml).toContain("USD 1 = 1,380원");
    expect(normalHtml).not.toContain("조회 실패");
    expect(normalHtml).not.toContain('href="/settings/data-sources"');

    for (const [exchange, phrase] of [[liveFailed, "조회 실패"], [cooldown, "재시도 대기"]] as const) {
      const html = render(exchange);
      expect(html).toContain("USD 1 = 1,380원");
      expect(html).toContain("2026-10-16");
      expect(html).toContain("한국수출입은행");
      expect(html).toContain(phrase);
      expect(html).toContain(retryText);
      expect(html).toContain('href="/settings/data-sources"');
    }
  });

  it("omits the retry time when the degraded response does not carry one", () => {
    const exchange = parseDashboardExchange(cachedExchange("live_failed_cache_hit"));
    expect(exchange).toMatchObject({ state: "degraded-cache", nextRetryAt: null });
    expect(exchange.notice).not.toContain("다음 조회 가능 시각");
  });

  it("shows the market reference rate with source and keeps failures explicit", async () => {
    const live = parseDashboardExchange({
      ok: true,
      data: { asOf: "2026-10-17", base: "KRW", rates: { USD: 1381.2 }, rawMeta: { source: "EXIM" } },
      meta: { cache: "miss", fallback: { mode: "LIVE", sourceKey: "exchange", reason: "live_ok" } },
    });
    expect(live).toMatchObject({ state: "live", usdRate: 1381.2, asOf: "2026-10-17", sourceLabel: "한국수출입은행" });

    const cached = parseDashboardExchange({
      ok: true,
      data: { asOf: "2026-10-16", base: "KRW", rates: { USD: 1380 }, rawMeta: { source: "EXIM" } },
      meta: { cache: "hit", fallback: { mode: "CACHE", sourceKey: "exchange", reason: "live_failed_cache_hit" } },
    });
    // A live failure served from cache is degraded, not a normal cache hit (see the degraded-cache test).
    expect(cached).toMatchObject({ state: "degraded-cache", usdRate: 1380 });

    const missing = await fetchDashboardJson("/api/public/exchange", {
      fetchImpl: async () => new Response(JSON.stringify({ ok: false, error: { code: "ENV_MISSING", message: "EXIM 환율 API 설정이 필요합니다." } }), { status: 503 }),
    }).then(() => null, (error: unknown) => error);
    const exchange = describeDashboardExchangeFailure(missing);
    expect(exchange).toMatchObject({ state: "setup-required", usdRate: null });

    const html = renderToStaticMarkup(<DashboardFxSection fx={null} exchange={exchange} loading={false} />);
    expect(html).toContain("시장 기준 환율");
    expect(html).toContain("설정");
    expect(html).not.toContain("USD 1 = -");
  });
});
