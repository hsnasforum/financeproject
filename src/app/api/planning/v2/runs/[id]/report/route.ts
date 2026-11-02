import {
  assertSameOrigin,
  toGuardErrorResponse,
  } from "../../../../../../../lib/dev/devGuards";
import { jsonError } from "../../../../../../../lib/planning/api/response";
import {
  planningUserMeta,
  withPlanningRouteUser,
} from "../../../../../../../lib/planning/api/routeAuth";
import {
  getCurrentUserRunComparisonReportHtml,
  getCurrentUserRunReportHtml,
} from "../../../../../../../lib/planning/server/reports/runReportRouteService";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function withReadGuard(request: Request) {
  try {
    assertSameOrigin(request);
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
  return await withPlanningRouteUser(request, async (currentUser) => {
    const userMeta = planningUserMeta(currentUser);

    const { id } = await context.params;

    try {
      const url = new URL(request.url);
      const viewMode = (url.searchParams.get("view") ?? "").trim().toLowerCase();
      const printView = viewMode === "print" || viewMode === "view";
      const compareToValues = url.searchParams.getAll("compareTo");
      if (compareToValues.length > 1 || (compareToValues.length === 1 && !compareToValues[0].trim())) {
        return jsonError("INPUT", "compareTo에는 비교할 실행 ID 하나가 필요합니다.", {
          status: 400,
          meta: userMeta,
        });
      }

      let report;
      if (compareToValues.length === 1) {
        const comparison = await getCurrentUserRunComparisonReportHtml({
          runId: id,
          compareToRunId: compareToValues[0],
          printView,
        });
        if (!comparison.ok) {
          if (comparison.reason === "INVALID_COMPARE_RUN_ID") {
            return jsonError("INPUT", "compareTo 실행 ID 형식이 올바르지 않습니다.", { status: 400, meta: userMeta });
          }
          if (comparison.reason === "SELF_COMPARE") {
            return jsonError("INPUT", "같은 실행끼리는 비교할 수 없습니다.", { status: 400, meta: userMeta });
          }
          if (comparison.reason === "COMPARE_RUN_NOT_FOUND") {
            return jsonError("NO_DATA", "비교 기준 실행 기록을 찾을 수 없습니다.", { status: 404, meta: userMeta });
          }
          return jsonError("NO_DATA", "실행 기록을 찾을 수 없습니다.", { status: 404, meta: userMeta });
        }
        report = comparison.report;
      } else {
        report = await getCurrentUserRunReportHtml({
          runId: id,
          printView,
        });
      }
      if (!report) {
        return jsonError("NO_DATA", "실행 기록을 찾을 수 없습니다.", { status: 404, meta: userMeta });
      }

      const shouldDownload = url.searchParams.get("download") === "1";

      return new Response(report.html, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          ...(shouldDownload ? { "content-disposition": `attachment; filename=\"${report.htmlFilename}\"` } : {}),
        },
      });
    } catch {
      return jsonError("INTERNAL", "리포트 생성에 실패했습니다.", { status: 500, meta: userMeta });
    }
  });
}
