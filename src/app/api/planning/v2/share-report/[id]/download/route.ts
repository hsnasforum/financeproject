import {
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../../../lib/dev/devGuards";
import { jsonError } from "../../../../../../../lib/planning/api/response";
import { getShareReport } from "../../../../../../../lib/planning/server/share/storage";

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
    const { id } = await context.params;
    const report = await getShareReport(id);
    if (!report) {
      return jsonError("NO_DATA", "공유 리포트를 찾을 수 없습니다.");
    }
    return new Response(report.markdown, {
      status: 200,
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="planning-share-${report.meta.id}.md"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "공유 리포트 다운로드에 실패했습니다.";
    return jsonError("INTERNAL", message, { status: 500 });
  }
}
