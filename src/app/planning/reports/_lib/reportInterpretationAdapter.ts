import { type InterpretationInput } from "../../../../lib/planning/v2/insights/interpretationVm";
import { buildEvidence } from "../../../../lib/planning/v2/insights/evidence";
import { type ReportVM } from "./reportViewModel";

export function toInterpretationInputFromReportVM(vm: ReportVM): InterpretationInput {
  return {
    summary: vm.insight.summaryMetrics,
    aggregatedWarnings: vm.insight.aggregatedWarnings,
    goals: vm.insight.goals.map((goal) => ({
      goalId: goal.name, // Use name as ID if no stable ID
      name: goal.name,
      achieved: goal.achieved,
      targetMonth: goal.targetMonth,
      progressPct: goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0,
      shortfallKrw: goal.shortfall,
      interpretation: goal.comment,
    })),
    outcomes: {
      ...vm.insight.outcomes,
      ...(vm.header.runId ? { runId: vm.header.runId } : {}),
    },
    summaryEvidence: buildEvidence(
      {
        summaryCards: vm.insight.summaryMetrics,
        evidence: {
          summary: vm.insight.summaryEvidence,
        },
      },
      undefined, // use default policy
      vm.insight.summaryEvidence,
    ),
  };
}
