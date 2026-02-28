import {
  assertLocalHost,
  toGuardErrorResponse,
} from "../../../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../../../lib/dev/onlyDev";
import { jsonError } from "../../../../../../../lib/http/apiResponse";
import { getReport } from "../../../../../../../lib/planning/server/reports/storage";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function withLocalReadGuard(request: Request) {
  try {
    assertLocalHost(request);
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

  try {
    const { id } = await context.params;
    const report = await getReport(id);
    if (!report) {
      return jsonError("NO_DATA", "리포트를 찾을 수 없습니다.");
    }

    return new Response(report.markdown, {
      status: 200,
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="planning-report-${report.meta.id}.md"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "리포트 다운로드에 실패했습니다.";
    return jsonError("INTERNAL", message, { status: 500 });
  }
}
