import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { listRuns } from "../src/lib/planning/server/store/runStore";
import { DashboardClient } from "../src/components/DashboardClient";
import { loadDashboardViewModel } from "../src/app/dashboard/_lib/dashboardViewModel";

type PlanningRunRows = Awaited<ReturnType<typeof listRuns>>;

const sampleRun = {
  id: "run-1",
  profileId: "profile-1",
  title: "최근 플랜",
  createdAt: "2026-07-01T00:00:00.000Z",
  overallStatus: "SUCCESS",
  scenario: { name: "기본 시나리오" },
  input: { horizonMonths: 24 },
  meta: { snapshot: { asOf: "2026-07-01" } },
  outputs: {
    resultDto: {
      summary: {
        monthlySurplusKrw: 720000,
        endNetWorthKrw: 52000000,
        worstCashKrw: 2000000,
      },
    },
    simulate: {
      summary: {
        monthlySurplusKrw: 720000,
      },
    },
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
      summary: {
        monthlySurplusKrw: 720000,
        endNetWorthKrw: 52000000,
        worstCashKrw: 2000000,
      },
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
        }}
      />,
    );

    expect(html).toContain("최근 실행 기록을 불러오지 못했습니다");
    expect(html).toContain("기록 없음과 로드 실패를 구분");
  });
});
