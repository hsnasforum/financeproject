import type { DashboardInitialViewModel, DashboardRun } from "@/components/DashboardClient";
import { listRuns } from "@/lib/planning/server/store/runStore";

type DashboardRunSource = Awaited<ReturnType<typeof listRuns>>[number];
type ListRunsForDashboard = (options: { limit: number }) => Promise<DashboardRunSource[]>;

export function sanitizeDashboardRuns(runs: DashboardRunSource[]): DashboardRun[] {
  return runs.slice(0, 6).map((run) => ({
    id: run.id,
    profileId: run.profileId,
    title: run.title?.trim() || run.scenario?.name?.trim() || "플래닝 실행",
    createdAt: run.createdAt,
    overallStatus: run.overallStatus,
    input: {
      horizonMonths: run.input.horizonMonths,
    },
    meta: {
      snapshot: {
        asOf: run.meta.snapshot?.asOf,
      },
    },
    outputs: {
      resultDto: run.outputs.resultDto ? {
        summary: run.outputs.resultDto.summary,
      } : undefined,
      simulate: run.outputs.simulate ? {
        summary: run.outputs.simulate.summary,
      } : undefined,
      actions: run.outputs.actions ? {
        actions: Array.isArray(run.outputs.actions.actions)
          ? run.outputs.actions.actions.map((action) => ({
            code: action.code,
            title: action.title,
            summary: action.summary,
            steps: action.steps,
            candidates: Array.isArray(action.candidates)
              ? action.candidates.map((candidate) => ({
                kind: candidate.kind,
                company: candidate.company,
                name: candidate.name,
                termMonths: candidate.termMonths,
                rateMinPct: candidate.rateMinPct,
                rateMaxPct: candidate.rateMaxPct,
                notes: candidate.notes,
                whyThis: candidate.whyThis,
              }))
              : [],
          }))
          : [],
      } : undefined,
    },
  }));
}

export async function loadDashboardViewModel(
  listRunsForDashboard: ListRunsForDashboard = listRuns,
): Promise<DashboardInitialViewModel> {
  try {
    const runs = await listRunsForDashboard({ limit: 6 });
    return {
      runs: sanitizeDashboardRuns(runs),
      runsLoadState: "loaded",
    };
  } catch {
    return {
      runs: [],
      runsLoadState: "failed",
      runsErrorMessage: "최근 플랜 정보를 불러오지 못했습니다. 저장된 데이터는 유지되며, 잠시 뒤 다시 시도해 주세요.",
    };
  }
}
