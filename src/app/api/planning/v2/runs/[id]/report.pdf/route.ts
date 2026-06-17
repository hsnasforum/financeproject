import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "../../../../../../../lib/dev/devGuards";
import { jsonError } from "../../../../../../../lib/planning/api/response";
import { getPlanningFeatureFlags } from "../../../../../../../lib/planning/config";
import { getCurrentUserRun } from "../../../../../../../lib/planning/server/runs/repository";
import {
  PdfReportError,
  renderPdfReportFromHtml,
} from "../../../../../../../lib/planning/v2/report/pdfReport";
import { buildStandaloneReportArtifactsFromRun } from "../../../../../../planning/reports/_lib/standaloneReportArtifacts";
import {
  isPlanningRouteUser,
  planningUserMeta,
  requirePlanningRouteUser,
} from "../../../../../../../lib/planning/api/routeAuth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function withReadGuard(request: Request) {
  try {
    assertSameOrigin(request);
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
  const guardFailure = withReadGuard(request);
  if (guardFailure) return guardFailure;
  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) return currentUser;
  const userMeta = planningUserMeta(currentUser);

  const flags = getPlanningFeatureFlags();
  if (!flags.pdfEnabled) {
    return jsonError("DISABLED", "서버 설정으로 PDF 리포트 기능이 비활성화되어 있습니다.", {
      status: 403,
      meta: userMeta,
    });
  }

  const { id } = await context.params;

  try {
    const run = await getCurrentUserRun(id);
    if (!run) {
      return jsonError("NO_DATA", "실행 기록을 찾을 수 없습니다.", { meta: userMeta });
    }

    const { html } = buildStandaloneReportArtifactsFromRun(run);

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
        return jsonError("INTERNAL", error.message, { status: 503, meta: userMeta });
      }
      return jsonError("INTERNAL", error.message, { status: 500, meta: userMeta });
    }
    return jsonError("INTERNAL", "PDF 리포트 생성에 실패했습니다.", { status: 500, meta: userMeta });
  }
}
