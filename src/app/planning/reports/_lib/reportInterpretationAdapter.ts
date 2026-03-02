import { type InterpretationInput } from "../../../../lib/planning/v2/insights/interpretationVm";
import { type ReportVM } from "./reportViewModel";

export function toInterpretationInputFromReportVM(vm: ReportVM): InterpretationInput {
  return {
    summary: vm.insight.summaryMetrics,
    aggregatedWarnings: vm.insight.aggregatedWarnings,
    goals: vm.insight.goals,
    outcomes: {
      ...vm.insight.outcomes,
      ...(vm.header.runId ? { runId: vm.header.runId } : {}),
    },
    summaryEvidence: vm.insight.summaryEvidence,
  };
}
