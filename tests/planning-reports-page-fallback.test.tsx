import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  getDefaultProfileId: vi.fn(),
  getRun: vi.fn(),
  listRuns: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
  resolveRequestedReportRunContext: vi.fn(),
  resolveRequestedReportRunScope: vi.fn(),
  resolveFallbackReportRunScope: vi.fn(),
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

vi.mock("@/lib/planning/server/store/profileStore", () => ({
  getDefaultProfileId: mocked.getDefaultProfileId,
}));

vi.mock("@/lib/planning/server/store/runStore", () => ({
  getRun: mocked.getRun,
  listRuns: mocked.listRuns,
}));

vi.mock("@/lib/planning/reports/runSelection", () => ({
  DEFAULT_REPORT_RUN_SCOPE_LIMIT: 20,
  resolveRequestedReportRunContext: mocked.resolveRequestedReportRunContext,
  resolveRequestedReportRunScope: mocked.resolveRequestedReportRunScope,
  resolveFallbackReportRunScope: mocked.resolveFallbackReportRunScope,
}));

import PlanningReportsPage from "../src/app/planning/reports/page";
import PlanningReportsPrototypePage from "../src/app/planning/reports/prototype/page";

describe("planning reports page fallback", () => {
  const run = {
    id: "run-123",
    profileId: "profile-1",
    createdAt: "2026-03-12T08:00:00.000Z",
  };

  beforeEach(() => {
    mocked.getDefaultProfileId.mockReset();
    mocked.getRun.mockReset();
    mocked.listRuns.mockReset();
    mocked.redirect.mockClear();
    mocked.resolveRequestedReportRunContext.mockReset();
    mocked.resolveRequestedReportRunScope.mockReset();
    mocked.resolveFallbackReportRunScope.mockReset();

    mocked.getDefaultProfileId.mockResolvedValue("default-profile");
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
    expect(html).toContain("data-initial-load-notice=\"처음 리포트를 준비하는 중 일시적인 문제가 있어 실행 기록을 다시 불러오는 중입니다.\"");
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
    expect(html).toContain("data-initial-load-notice=\"처음 상담형 리포트를 준비하는 중 일시적인 문제가 있어 실행 기록을 다시 불러오는 중입니다.\"");
    expect(mocked.redirect).not.toHaveBeenCalled();
    expect(mocked.resolveFallbackReportRunScope).not.toHaveBeenCalled();
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

    expect(html).toContain("플래닝 리포트");
    expect(html).toContain("저장된 실행 결과를 다시 읽는 도착 화면이지만");
    expect(html).toContain("아직 저장된 실행이 없습니다");
    expect(html).toContain("먼저 /planning에서 실행을 저장해 두면");
    expect(html).toContain("실행 기록 화면과 비교할 수 있습니다.");
    expect(html).toContain("플래닝으로 돌아가 실행 저장하기");
    expect(html).toContain("href=\"/planning?profileId=profile-1\"");
  });
});
