import {
  assertLocalHost,
  requireCsrf,
  toGuardErrorResponse,
} from "../../../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../../../lib/dev/onlyDev";
import { jsonError } from "../../../../../../../lib/planning/api/response";
import { getPlanningFeatureFlags } from "../../../../../../../lib/planning/config";
import { getRun } from "../../../../../../../lib/planning/server/store/runStore";
import { PdfReportError, renderPdfReport } from "../../../../../../../lib/planning/v2/report/pdfReport";
import { buildResultDtoV1FromRunRecord, isResultDtoV1 } from "../../../../../../../lib/planning/v2/resultDto";
import { type ResultDtoV1 } from "../../../../../../../lib/planning/v2/resultDto";

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

    const outputs = run.outputs && typeof run.outputs === "object" ? run.outputs : {};
    const rawResultDto = (outputs as Record<string, unknown>).resultDto;
    const resultDto: ResultDtoV1 = isResultDtoV1(rawResultDto)
      ? rawResultDto
      : buildResultDtoV1FromRunRecord(run);

    const pdf = await renderPdfReport(resultDto, {
      title: run.title ? `${run.title} - 재무설계 결과 리포트` : "재무설계 결과 리포트",
    });
    const pdfBody = Uint8Array.from(pdf).buffer;

    return new Response(pdfBody, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="planning-run-${run.id}.pdf"`,
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
