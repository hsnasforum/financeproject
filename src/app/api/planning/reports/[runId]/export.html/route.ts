import {
  assertLocalHost,
  toGuardErrorResponse,
  } from "../../../../../../lib/dev/devGuards";
import {
  planningUserMeta,
  withPlanningRouteUser,
} from "../../../../../../lib/planning/api/routeAuth";
import { getCurrentUserRunStandaloneReportHtml } from "../../../../../../lib/planning/server/reports/exportHtmlRouteService";

type RouteContext = {
  params: Promise<{ runId: string }>;
};

function createStyleNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

function buildStandaloneHtmlContentSecurityPolicy(printView: boolean, styleNonce: string): string {
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'none'",
    `script-src ${printView ? "'self'" : "'none'"}`,
    `style-src 'self' 'nonce-${styleNonce}'`,
    "style-src-attr 'none'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'none'",
  ].join("; ");
}

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
  const guardFailure = withLocalReadGuard(request);
  if (guardFailure) return guardFailure;
  return await withPlanningRouteUser(request, async (currentUser) => {
    const userMeta = planningUserMeta(currentUser);

    const { runId } = await context.params;
    const url = new URL(request.url);
    const viewMode = (url.searchParams.get("view") ?? "").trim().toLowerCase();
    const printView = viewMode === "print" || viewMode === "view";
    const styleNonce = createStyleNonce();
    try {
      const reportHtml = await getCurrentUserRunStandaloneReportHtml({
        runId,
        printView,
        styleNonce,
      });
      if (!reportHtml) {
        return Response.json({
          ok: false,
          message: "실행 기록을 찾을 수 없습니다.",
          meta: userMeta,
        }, { status: 404 });
      }

      return new Response(reportHtml.html, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "content-security-policy": buildStandaloneHtmlContentSecurityPolicy(printView, styleNonce),
          "content-disposition": printView
            ? `inline; filename=\"${reportHtml.filename}\"`
            : `attachment; filename=\"${reportHtml.filename}\"`,
        },
      });
    } catch {
      return Response.json({
        ok: false,
        message: "HTML export 생성에 실패했습니다.",
        meta: userMeta,
      }, { status: 500 });
    }
  });
}
