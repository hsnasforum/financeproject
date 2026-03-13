import {
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../../../lib/dev/devGuards";
import { jsonError } from "../../../../../../../lib/planning/api/response";
import { getRun } from "../../../../../../../lib/planning/server/store/runStore";
import { buildStandaloneReportArtifactsFromRun } from "../../../../../../planning/reports/_lib/standaloneReportArtifacts";

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

  const { id } = await context.params;

  try {
    const url = new URL(request.url);
    const run = await getRun(id);
    if (!run) {
      return jsonError("NO_DATA", "실행 기록을 찾을 수 없습니다.");
    }

    const viewMode = (url.searchParams.get("view") ?? "").trim().toLowerCase();
    const printView = viewMode === "print" || viewMode === "view";
    const { html } = buildStandaloneReportArtifactsFromRun(run, {
      printView,
    });

    const shouldDownload = url.searchParams.get("download") === "1";
    const fileName = `planning-run-report-${run.id}.html`;

    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        ...(shouldDownload ? { "content-disposition": `attachment; filename=\"${fileName}\"` } : {}),
      },
    });
  } catch {
    return jsonError("INTERNAL", "리포트 생성에 실패했습니다.", { status: 500 });
  }
}
