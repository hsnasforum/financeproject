import {
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../../../lib/dev/devGuards";
import { jsonError } from "../../../../../../../lib/planning/api/response";
import { getCurrentUserReportMarkdownDownload } from "../../../../../../../lib/planning/server/reports/downloadRouteService";
import {
  planningAuthErrorResponse as toAuthErrorResponse,
  withPlanningRouteUser,
} from "../../../../../../../lib/planning/api/routeAuth";

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

  try {
    return await withPlanningRouteUser(request, async () => {
      try {
        const { id } = await context.params;
        const download = await getCurrentUserReportMarkdownDownload(id);
        if (!download) {
          return jsonError("NO_DATA", "리포트를 찾을 수 없습니다.");
        }

        return new Response(download.markdown, {
          status: 200,
          headers: {
            "content-type": "text/markdown; charset=utf-8",
            "content-disposition": `attachment; filename="${download.filename}"`,
            "cache-control": "no-store",
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "리포트 다운로드에 실패했습니다.";
        return jsonError("INTERNAL", message, { status: 500 });
      }
    });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) return authError;
    const message = error instanceof Error ? error.message : "리포트 다운로드에 실패했습니다.";
    return jsonError("INTERNAL", message, { status: 500 });
  }
}
