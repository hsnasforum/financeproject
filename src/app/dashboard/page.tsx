import { DashboardClient, type DashboardRun } from "@/components/DashboardClient";
import { listRuns } from "@/lib/planning/server/store/runStore";

export const dynamic = "force-dynamic";

function sanitizeDashboardRuns(runs: Awaited<ReturnType<typeof listRuns>>): DashboardRun[] {
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

async function loadDashboardRuns(): Promise<DashboardRun[]> {
  try {
    const runs = await listRuns({ limit: 6 });
    return sanitizeDashboardRuns(runs);
  } catch {
    return [];
  }
}

export default async function DashboardPage() {
  const initialRuns = await loadDashboardRuns();
  return <DashboardClient initialRuns={initialRuns} />;
}
