import {
  buildReportInputContractFromRun,
  type BuildReportInputContractOptions,
} from "../../../../lib/planning/reports/reportInputContract";
import { renderStandaloneHtml } from "../../../../lib/planning/reports/standaloneHtmlReport";
import { type PlanningRunRecord } from "../../../../lib/planning/store/types";
import { buildInterpretationVM } from "../../../../lib/planning/v2/insights/interpretationVm";
import { toInterpretationInputFromReportVM } from "./reportInterpretationAdapter";
import {
  buildReportVMFromContract,
  type ReportVM,
} from "./reportViewModel";

type StandaloneReportBuildOptions = {
  contractOptions?: BuildReportInputContractOptions;
  printView?: boolean;
  report?: {
    id?: string;
    createdAt?: string;
    runId?: string;
  };
};

export type StandaloneReportArtifacts = {
  html: string;
  interpretation: ReturnType<typeof buildInterpretationVM>;
  reportInput: ReturnType<typeof buildReportInputContractFromRun>;
  vm: ReportVM;
};

export function buildStandaloneReportArtifactsFromRun(
  run: PlanningRunRecord,
  options: StandaloneReportBuildOptions = {},
): StandaloneReportArtifacts {
  const reportInput = buildReportInputContractFromRun(run, options.contractOptions);
  const vm = buildReportVMFromContract(reportInput, run, {
    id: run.id,
    createdAt: run.createdAt,
    runId: run.id,
    ...(options.report ?? {}),
  });
  const interpretation = buildInterpretationVM(toInterpretationInputFromReportVM(vm));
  const html = renderStandaloneHtml({
    runId: run.id,
    reportId: vm.header.reportId,
    createdAt: vm.header.createdAt,
    assumptionsLines: vm.assumptionsLines,
    summaryCards: {
      monthlySurplusKrw: vm.summaryCards.monthlySurplusKrw,
      dsrPct: vm.summaryCards.dsrPct,
      emergencyFundMonths: vm.summaryCards.emergencyFundMonths,
      debtTotalKrw: vm.summaryCards.debtTotalKrw,
      totalMonthlyDebtPaymentKrw: vm.summaryCards.totalMonthlyDebtPaymentKrw,
      endNetWorthKrw: vm.summaryCards.endNetWorthKrw,
      worstCashKrw: vm.summaryCards.worstCashKrw,
      goalsAchieved: vm.summaryCards.goalsAchieved,
      totalWarnings: vm.summaryCards.totalWarnings,
    },
    ...(vm.monthlyOperatingGuide ? { monthlyOperatingGuide: vm.monthlyOperatingGuide } : {}),
    warnings: vm.warningAgg.slice(0, 20).map((warning) => ({
      title: warning.title,
      code: warning.code,
      severityMax: warning.severityMax,
      count: warning.count,
      periodMinMax: warning.periodMinMax,
      plainDescription: warning.plainDescription,
    })),
    goals: vm.goalsTable.slice(0, 20),
    actions: vm.actionRows.slice(0, 5).map((action) => ({
      title: action.title,
      summary: action.summary,
      severity: action.severity,
      steps: action.steps.slice(0, 3),
    })),
    ...(vm.scenarioRows.length > 0
      ? {
        scenarios: vm.scenarioRows.map((row) => ({
          title: row.title,
          endNetWorthKrw: row.endNetWorthKrw,
          worstCashKrw: row.worstCashKrw,
          goalsAchievedCount: row.goalsAchievedCount,
          warningsCount: row.warningsCount,
          interpretation: row.interpretation,
        })),
      }
      : {}),
    ...((vm.monteProbabilityRows.length > 0 || vm.montePercentileRows.length > 0)
      ? {
        monteCarlo: {
          probabilities: vm.monteProbabilityRows,
          percentiles: vm.montePercentileRows,
        },
      }
      : {}),
    ...(vm.debtSummaryRows.length > 0
      ? {
        debtSummary: vm.debtSummaryRows.map((row) => ({
          name: row.name,
          repaymentType: row.repaymentType,
          principalKrw: row.principalKrw,
          aprPct: row.aprPct,
          monthlyPaymentKrw: row.monthlyPaymentKrw,
          monthlyInterestKrw: row.monthlyInterestKrw,
          totalInterestRemainingKrw: row.totalInterestRemainingKrw,
          payoffMonthIndex: row.payoffMonthIndex,
        })),
      }
      : {}),
    verdict: {
      label: interpretation.verdict.label,
      headline: interpretation.verdict.headline,
    },
    diagnostics: interpretation.diagnostics.slice(0, 3).map((diag) => ({
      title: diag.title,
      evidence: diag.evidence,
      description: diag.description,
      ...(diag.evidenceDetail ? { evidenceDetail: diag.evidenceDetail } : {}),
    })),
    ...(options.printView ? { printView: true } : {}),
    ...(vm.reproducibility
      ? {
        reproducibility: vm.reproducibility,
      }
      : {}),
  });

  return {
    html,
    interpretation,
    reportInput,
    vm,
  };
}
