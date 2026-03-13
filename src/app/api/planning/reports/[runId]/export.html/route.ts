import {
  assertLocalHost,
  toGuardErrorResponse,
} from "../../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../../lib/dev/onlyDev";
import { getRun } from "../../../../../../lib/planning/server/store/runStore";
import { buildStandaloneReportArtifactsFromRun } from "../../../../../planning/reports/_lib/standaloneReportArtifacts";

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
  const url = new URL(request.url);
  const viewMode = (url.searchParams.get("view") ?? "").trim().toLowerCase();
  const printView = viewMode === "print" || viewMode === "view";
  try {
    const run = await getRun(runId);
    if (!run) {
      return Response.json({ ok: false, message: "실행 기록을 찾을 수 없습니다." }, { status: 404 });
    }

    const { html } = buildStandaloneReportArtifactsFromRun(run, {
      printView,
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
