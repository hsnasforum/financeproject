import {
  assertLocalHost,
  requireCsrf,
  toGuardErrorResponse,
} from "../../../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../../../lib/dev/onlyDev";
import { jsonError } from "../../../../../../../lib/planning/api/response";
import { getPlanningFeatureFlags } from "../../../../../../../lib/planning/config";
import { buildReportInputContractFromRun } from "../../../../../../../lib/planning/reports/reportInputContract";
import { renderStandaloneHtml } from "../../../../../../../lib/planning/reports/standaloneHtmlReport";
import { getRun } from "../../../../../../../lib/planning/server/store/runStore";
import { buildInterpretationVM } from "../../../../../../../lib/planning/v2/insights/interpretationVm";
import {
  PdfReportError,
  renderPdfReportFromHtml,
} from "../../../../../../../lib/planning/v2/report/pdfReport";
import { toInterpretationInputFromReportVM } from "../../../../../../planning/reports/_lib/reportInterpretationAdapter";
import { buildReportVMFromContract } from "../../../../../../planning/reports/_lib/reportViewModel";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function withLocalReadGuard(request: Request) {
  try {
    assertLocalHost(request);
    const url = new URL(request.url);
    const csrf = (url.searchParams.get("csrf") ?? "").trim();
    requireCsrf(request, { csrf }, { allowWhenCookieMissing: true });
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) return jsonError("INTERNAL", "요청 검증 중 오류가 발생했습니다.");
    return jsonError(guard.code, guard.message, { status: guard.status });
  }
}

export async function GET(request: Request, context: RouteContext) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guardFailure = withLocalReadGuard(request);
  if (guardFailure) return guardFailure;

  const flags = getPlanningFeatureFlags();
  if (!flags.pdfEnabled) {
    return jsonError("DISABLED", "서버 설정으로 PDF 리포트 기능이 비활성화되어 있습니다.", { status: 403 });
  }

  const { id } = await context.params;

  try {
    const run = await getRun(id);
    if (!run) {
      return jsonError("NO_DATA", "실행 기록을 찾을 수 없습니다.");
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
      ...(vm.reproducibility
        ? {
          reproducibility: vm.reproducibility,
        }
        : {}),
    });

    const pdf = await renderPdfReportFromHtml(html);
    const pdfBody = Uint8Array.from(pdf).buffer;

    return new Response(pdfBody, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename=\"planning-run-${run.id}.pdf\"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof PdfReportError) {
      if (error.code === "PDF_FONT_MISSING" || error.code === "PDF_ENGINE_MISSING") {
        return jsonError("INTERNAL", error.message, { status: 503 });
      }
      return jsonError("INTERNAL", error.message, { status: 500 });
    }
    return jsonError("INTERNAL", "PDF 리포트 생성에 실패했습니다.", { status: 500 });
  }
}
