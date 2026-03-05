import {
  assertLocalHost,
  toGuardErrorResponse,
} from "../../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../../lib/dev/onlyDev";
import { buildReportInputContractFromRun } from "../../../../../../lib/planning/reports/reportInputContract";
import { renderStandaloneHtml } from "../../../../../../lib/planning/reports/standaloneHtmlReport";
import { getRun } from "../../../../../../lib/planning/server/store/runStore";
import { buildInterpretationVM } from "../../../../../../lib/planning/v2/insights/interpretationVm";
import { toInterpretationInputFromReportVM } from "../../../../../planning/reports/_lib/reportInterpretationAdapter";
import { buildReportVMFromContract } from "../../../../../planning/reports/_lib/reportViewModel";

type RouteContext = {
  params: Promise<{ runId: string }>;
};

function withLocalReadGuard(request: Request): Response | null {
  try {
    assertLocalHost(request);
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return Response.json({ ok: false, message: "요청 검증 중 오류가 발생했습니다." }, { status: 500 });
    }
    return Response.json({ ok: false, message: guard.message }, { status: guard.status });
  }
}

export async function GET(request: Request, context: RouteContext) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guardFailure = withLocalReadGuard(request);
  if (guardFailure) return guardFailure;

  const { runId } = await context.params;
  const viewMode = (new URL(request.url).searchParams.get("view") ?? "").trim().toLowerCase();
  const printView = viewMode === "print" || viewMode === "view";
  try {
    const run = await getRun(runId);
    if (!run) {
      return Response.json({ ok: false, message: "실행 기록을 찾을 수 없습니다." }, { status: 404 });
    }

    const reportInput = buildReportInputContractFromRun(run, {
      allowLegacyEngineFallback: true,
      allowLegacyResultDtoFallback: true,
    });
    const vm = buildReportVMFromContract(reportInput, run, {
      id: run.id,
      createdAt: run.createdAt,
      runId: run.id,
    });
    const interpretation = buildInterpretationVM(toInterpretationInputFromReportVM(vm));

    const html = renderStandaloneHtml({
      runId: run.id,
      reportId: vm.header.reportId,
      createdAt: vm.header.createdAt,
      summaryCards: {
        monthlySurplusKrw: vm.summaryCards.monthlySurplusKrw,
        dsrPct: vm.summaryCards.dsrPct,
        emergencyFundMonths: vm.summaryCards.emergencyFundMonths,
        debtTotalKrw: vm.summaryCards.debtTotalKrw,
      },
      warnings: vm.warningAgg.slice(0, 20).map((warning) => ({
        title: warning.title,
        code: warning.code,
        severityMax: warning.severityMax,
        count: warning.count,
        periodMinMax: warning.periodMinMax,
        plainDescription: warning.plainDescription,
      })),
      goals: vm.goalsTable.slice(0, 20),
      actions: vm.topActions.slice(0, 3).map((action) => ({
        title: action.title,
        summary: action.summary,
        steps: action.steps.slice(0, 3),
      })),
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
      printView,
      ...(vm.reproducibility
        ? {
          reproducibility: vm.reproducibility,
        }
        : {}),
    });

    const fileName = `planning-run-${run.id}-report.html`;
    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-disposition": printView
          ? `inline; filename=\"${fileName}\"`
          : `attachment; filename=\"${fileName}\"`,
      },
    });
  } catch {
    return Response.json({ ok: false, message: "HTML export 생성에 실패했습니다." }, { status: 500 });
  }
}
