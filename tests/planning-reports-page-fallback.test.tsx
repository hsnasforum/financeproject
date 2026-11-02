import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  getDefaultProfileId: vi.fn(),
  getReport: vi.fn(),
  getRun: vi.fn(),
  getRunActionProgress: vi.fn(),
  summarizeRunActionProgressByRunId: vi.fn(),
  listProfiles: vi.fn(),
  listProfilesWithDefault: vi.fn(),
  listRuns: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
  resolveRequestedReportRunContext: vi.fn(),
  resolveRequestedReportRunScope: vi.fn(),
  resolveFallbackReportRunScope: vi.fn(),
  pageScopeCallCount: 0,
  pageScopeDepth: 0,
}));

vi.mock("next/link", () => ({
  default: (props: { href: string; children: React.ReactNode }) => <a href={props.href}>{props.children}</a>,
}));

vi.mock("next/navigation", () => ({
  redirect: mocked.redirect,
}));

vi.mock("@/components/PlanningReportsDashboardBoundary", () => ({
  default: (props: {
    initialRuns?: unknown[];
    initialProfileId?: string;
    initialRunId?: string;
    initialLoadNotice?: string;
  }) => (
    <div
      data-initial-load-notice={props.initialLoadNotice ?? ""}
      data-initial-profile-id={props.initialProfileId ?? ""}
      data-initial-run-id={props.initialRunId ?? ""}
      data-runs-count={String(props.initialRuns?.length ?? 0)}
      data-testid="report-boundary"
    />
  ),
}));

vi.mock("@/components/PlanningReportsPrototypeClient", () => ({
  default: (props: {
    initialRuns?: unknown[];
    initialProfileId?: string;
    initialRunId?: string;
    initialLoadNotice?: string;
  }) => (
    <div
      data-initial-load-notice={props.initialLoadNotice ?? ""}
      data-initial-profile-id={props.initialProfileId ?? ""}
      data-initial-run-id={props.initialRunId ?? ""}
      data-runs-count={String(props.initialRuns?.length ?? 0)}
      data-testid="report-prototype"
    />
  ),
}));

vi.mock("@/components/PlanningReportDetailClient", () => ({
  default: (props: {
    id: string;
    initialError?: string;
    initialReport?: { id?: string; runId?: string } | null;
    initialRun?: { id?: string } | null;
  }) => (
    <div
      data-initial-error={props.initialError ?? ""}
      data-initial-report-id={props.initialReport?.id ?? ""}
      data-initial-report-run-id={props.initialReport?.runId ?? ""}
      data-initial-run-id={props.initialRun?.id ?? ""}
      data-report-id={props.id}
      data-testid="report-detail"
    />
  ),
}));

vi.mock("@/components/PlanningRunsClient", () => ({
  default: (props: {
    initialActionProgressSummaryByRunId?: Record<string, unknown>;
    initialFilterProfileId?: string;
    initialLoadNotice?: string;
    initialProfiles?: unknown[];
    initialProfilesReady?: boolean;
    initialRuns?: unknown[];
    initialRunsReady?: boolean;
    initialSelectedRunId?: string;
  }) => (
    <div
      data-action-progress-count={String(Object.keys(props.initialActionProgressSummaryByRunId ?? {}).length)}
      data-filter-profile-id={props.initialFilterProfileId ?? ""}
      data-initial-load-notice={props.initialLoadNotice ?? ""}
      data-profiles-count={String(props.initialProfiles?.length ?? 0)}
      data-profiles-ready={String(Boolean(props.initialProfilesReady))}
      data-runs-count={String(props.initialRuns?.length ?? 0)}
      data-runs-ready={String(Boolean(props.initialRunsReady))}
      data-selected-run-id={props.initialSelectedRunId ?? ""}
      data-testid="planning-runs"
    />
  ),
}));

vi.mock("@/lib/planning/server/pageAuth", () => ({
  withCurrentPlanningPageUser: async (callback: (user: { id: string; source: string }) => unknown) => {
    mocked.pageScopeCallCount += 1;
    mocked.pageScopeDepth += 1;
    try {
      return await callback({ id: "test-user", source: "test" });
    } finally {
      mocked.pageScopeDepth -= 1;
    }
  },
  toPlanningPageLoadMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock("@/lib/planning/server/profiles/repository", () => ({
  getCurrentUserDefaultProfileId: mocked.getDefaultProfileId,
  listCurrentUserProfiles: mocked.listProfiles,
  listCurrentUserProfilesWithDefault: mocked.listProfilesWithDefault,
}));

vi.mock("@/lib/planning/server/reports/repository", () => ({
  getCurrentUserReport: mocked.getReport,
}));

vi.mock("@/lib/planning/server/runs/repository", () => ({
  getCurrentUserRun: mocked.getRun,
  getCurrentUserRunActionProgress: mocked.getRunActionProgress,
  listCurrentUserRuns: mocked.listRuns,
  summarizeCurrentUserRunActionProgressByRunId: mocked.summarizeRunActionProgressByRunId,
  summarizeCurrentUserRunActionProgress: vi.fn(() => ({
    total: 1,
    done: 1,
    doing: 0,
    todo: 0,
    snoozed: 0,
    completionPct: 100,
  })),
}));

vi.mock("@/lib/planning/reports/runSelection", () => ({
  DEFAULT_REPORT_RUN_SCOPE_LIMIT: 20,
  resolveRequestedReportRunContext: mocked.resolveRequestedReportRunContext,
  resolveRequestedReportRunScope: mocked.resolveRequestedReportRunScope,
  resolveFallbackReportRunScope: mocked.resolveFallbackReportRunScope,
}));

import PlanningReportsPage from "../src/app/planning/reports/page";
import PlanningReportDetailPage from "../src/app/planning/reports/[id]/page";
import PlanningReportsPrototypePage from "../src/app/planning/reports/prototype/page";
import PlanningRunsPage from "../src/app/planning/runs/page";

describe("planning reports page fallback", () => {
  const run = {
    id: "run-123",
    profileId: "profile-1",
    createdAt: "2026-03-12T08:00:00.000Z",
  };
  const profile = {
    id: "profile-1",
    name: "기본 프로필",
    profile: {},
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
  };
  const report = {
    meta: {
      id: "report-123",
      createdAt: "2026-03-12T09:00:00.000Z",
      kind: "run",
      runId: run.id,
    },
    markdown: "# Report",
  };

  beforeEach(() => {
    mocked.getDefaultProfileId.mockReset();
    mocked.getReport.mockReset();
    mocked.getRun.mockReset();
    mocked.getRunActionProgress.mockReset();
    mocked.summarizeRunActionProgressByRunId.mockReset();
    mocked.listProfiles.mockReset();
    mocked.listProfilesWithDefault.mockReset();
    mocked.listRuns.mockReset();
    mocked.redirect.mockClear();
    mocked.resolveRequestedReportRunContext.mockReset();
    mocked.resolveRequestedReportRunScope.mockReset();
    mocked.resolveFallbackReportRunScope.mockReset();
    mocked.pageScopeCallCount = 0;
    mocked.pageScopeDepth = 0;

    mocked.getDefaultProfileId.mockImplementation(async () => {
      expect(mocked.pageScopeDepth).toBeGreaterThan(0);
      return "default-profile";
    });
    mocked.getReport.mockImplementation(async (id: string) => {
      expect(mocked.pageScopeDepth).toBeGreaterThan(0);
      return id === report.meta.id ? report : null;
    });
    mocked.getRun.mockImplementation(async (id: string) => {
      expect(mocked.pageScopeDepth).toBeGreaterThan(0);
      return id === run.id ? run : null;
    });
    mocked.getRunActionProgress.mockImplementation(async (id: string) => {
      expect(mocked.pageScopeDepth).toBeGreaterThan(0);
      return id === run.id ? { runId: id, items: [] } : null;
    });
    mocked.listProfiles.mockImplementation(async () => {
      expect(mocked.pageScopeDepth).toBeGreaterThan(0);
      return [profile];
    });
    mocked.listProfilesWithDefault.mockImplementation(async () => {
      expect(mocked.pageScopeDepth).toBeGreaterThan(0);
      return {
        defaultProfileId: "default-profile",
        profiles: [profile],
      };
    });
    mocked.listRuns.mockImplementation(async () => {
      expect(mocked.pageScopeDepth).toBeGreaterThan(0);
      return [run];
    });
    mocked.resolveRequestedReportRunContext.mockRejectedValue(new SyntaxError("Unexpected end of JSON input"));
    mocked.resolveRequestedReportRunScope.mockResolvedValue({
      effectiveProfileId: "profile-1",
      requestedRun: null,
      runs: [run],
      initialRunId: run.id,
    });
    mocked.resolveFallbackReportRunScope.mockResolvedValue({
      effectiveProfileId: "profile-1",
      requestedRun: null,
      runs: [],
      initialRunId: "",
    });
  });

  it("keeps /planning/reports on client fallback when requested run context lookup fails", async () => {
    const html = renderToStaticMarkup(await PlanningReportsPage({
      searchParams: Promise.resolve({
        profileId: "profile-1",
        runId: "run-123",
      }),
    }));

    expect(html).toContain("data-testid=\"report-boundary\"");
    expect(html).toContain("data-runs-count=\"1\"");
    expect(html).toContain("data-initial-run-id=\"run-123\"");
    expect(html).toContain("data-initial-load-notice=\"처음 리포트를 준비하는 중 일시적인 문제가 있어 상담 기록을 다시 불러오는 중입니다.\"");
    expect(mocked.resolveRequestedReportRunScope).toHaveBeenCalledWith(expect.objectContaining({
      requestedRun: null,
      requestedRunId: "run-123",
    }));
    expect(mocked.resolveFallbackReportRunScope).not.toHaveBeenCalled();
  });

  it("keeps preview mode on client fallback when requested run context lookup fails", async () => {
    const html = renderToStaticMarkup(await PlanningReportsPrototypePage({
      searchParams: Promise.resolve({
        preview: "1",
        profileId: "profile-1",
        runId: "run-123",
      }),
    }));

    expect(html).toContain("data-testid=\"report-prototype\"");
    expect(html).toContain("data-runs-count=\"1\"");
    expect(html).toContain("data-initial-run-id=\"run-123\"");
    expect(html).toContain("data-initial-load-notice=\"처음 상담형 리포트를 준비하는 중 일시적인 문제가 있어 상담 기록을 다시 불러오는 중입니다.\"");
    expect(mocked.redirect).not.toHaveBeenCalled();
    expect(mocked.resolveFallbackReportRunScope).not.toHaveBeenCalled();
  });

  it("runs injected report selection readers inside one pageAuth scope", async () => {
    const observedScopeDepths: number[] = [];
    mocked.getRun.mockImplementation(async (id: string) => {
      observedScopeDepths.push(mocked.pageScopeDepth);
      return id === run.id ? run : null;
    });
    mocked.listRuns.mockImplementation(async () => {
      observedScopeDepths.push(mocked.pageScopeDepth);
      return [run];
    });
    mocked.resolveRequestedReportRunContext.mockImplementation(async (options: {
      getRun: (id: string) => Promise<typeof run | null>;
    }) => {
      const requestedRun = await options.getRun("run-123");
      return {
        requestedRun,
        effectiveProfileId: requestedRun?.profileId ?? "",
      };
    });
    mocked.resolveRequestedReportRunScope.mockImplementation(async (options: {
      requestedRun?: typeof run | null;
      requestedRunId?: string;
      listRuns: (input?: { profileId?: string; limit?: number }) => Promise<typeof run[]>;
    }) => {
      const runs = await options.listRuns({ profileId: "profile-1", limit: 20 });
      return {
        effectiveProfileId: "profile-1",
        requestedRun: options.requestedRun ?? null,
        runs,
        initialRunId: options.requestedRunId ?? runs[0]?.id ?? "",
      };
    });

    const html = renderToStaticMarkup(await PlanningReportsPage({
      searchParams: Promise.resolve({
        profileId: "profile-1",
        runId: "run-123",
      }),
    }));

    expect(html).toContain("data-testid=\"report-boundary\"");
    expect(mocked.pageScopeCallCount).toBe(1);
    expect(observedScopeDepths).toEqual([1, 1]);
  });

  it("loads report detail and linked run inside one pageAuth scope", async () => {
    const observedScopeDepths: number[] = [];
    mocked.getReport.mockImplementation(async (id: string) => {
      observedScopeDepths.push(mocked.pageScopeDepth);
      return id === report.meta.id ? report : null;
    });
    mocked.getRun.mockImplementation(async (id: string) => {
      observedScopeDepths.push(mocked.pageScopeDepth);
      return id === run.id ? run : null;
    });

    const html = renderToStaticMarkup(await PlanningReportDetailPage({
      params: Promise.resolve({ id: report.meta.id }),
    }));

    expect(html).toContain("data-testid=\"report-detail\"");
    expect(html).toContain("data-initial-report-id=\"report-123\"");
    expect(html).toContain("data-initial-report-run-id=\"run-123\"");
    expect(html).toContain("data-initial-run-id=\"run-123\"");
    expect(mocked.pageScopeCallCount).toBe(1);
    expect(observedScopeDepths).toEqual([1, 1]);
  });

  it("loads planning runs initial data inside one pageAuth scope", async () => {
    const observedScopeDepths: number[] = [];
    mocked.getDefaultProfileId.mockImplementation(async () => {
      observedScopeDepths.push(mocked.pageScopeDepth);
      return profile.id;
    });
    mocked.listProfilesWithDefault.mockImplementation(async () => {
      observedScopeDepths.push(mocked.pageScopeDepth);
      return {
        defaultProfileId: profile.id,
        profiles: [profile],
      };
    });
    mocked.listRuns.mockImplementation(async () => {
      observedScopeDepths.push(mocked.pageScopeDepth);
      return [run];
    });
    mocked.summarizeRunActionProgressByRunId.mockImplementation(async (runs: Array<{ id?: string }>) => {
      observedScopeDepths.push(mocked.pageScopeDepth);
      return runs.some((entry) => entry.id === run.id)
        ? {
          [run.id]: {
            total: 1,
            done: 1,
            doing: 0,
            todo: 0,
            snoozed: 0,
            completionPct: 100,
          },
        }
        : {};
    });

    const html = renderToStaticMarkup(await PlanningRunsPage({
      searchParams: Promise.resolve({
        selected: run.id,
      }),
    }));

    expect(html).toContain("data-testid=\"planning-runs\"");
    expect(html).toContain("data-selected-run-id=\"run-123\"");
    expect(html).toContain("data-filter-profile-id=\"profile-1\"");
    expect(html).toContain("data-profiles-ready=\"true\"");
    expect(html).toContain("data-runs-ready=\"true\"");
    expect(html).toContain("data-action-progress-count=\"1\"");
    expect(mocked.pageScopeCallCount).toBe(1);
    expect(mocked.getDefaultProfileId).not.toHaveBeenCalled();
    expect(observedScopeDepths).toEqual([1, 1, 1]);
    expect(mocked.listRuns).toHaveBeenCalledWith({ profileId: "profile-1", limit: 200 });
  });

  it("renders stable destination empty state when no saved runs exist yet", async () => {
    mocked.resolveRequestedReportRunContext.mockResolvedValue({
      requestedRun: null,
      effectiveProfileId: "profile-1",
    });
    mocked.resolveRequestedReportRunScope.mockResolvedValue({
      effectiveProfileId: "profile-1",
      requestedRun: null,
      runs: [],
      initialRunId: "",
    });

    const html = renderToStaticMarkup(await PlanningReportsPage({
      searchParams: Promise.resolve({
        profileId: "profile-1",
      }),
    }));

    expect(html).toContain("재무설계 리포트");
    expect(html).toContain("저장한 재무 진단을 다시 확인하는 곳입니다.");
    expect(html).toContain("아직 저장된 상담 기록이 없습니다");
    expect(html).toContain("아직 보관된 결과가 없습니다. 재무 진단에서 첫 결과를 저장해 주세요.");
    expect(html).toContain("재무 진단 시작");
    expect(html).toContain("href=\"/planning?profileId=profile-1\"");
  });
});
