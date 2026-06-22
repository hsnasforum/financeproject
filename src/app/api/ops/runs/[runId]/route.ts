import { NextResponse } from "next/server";
import {
  requireCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { opsErrorResponse } from "../../../../../lib/ops/errorContract";
import { isPlanningRouteUser, planningUserMeta, requirePlanningRouteUser } from "../../../../../lib/planning/api/routeAuth";
import {
  auditOpsRunDeleteError,
  deleteOpsRun,
  opsRunsRouteMeta,
} from "../../../../../lib/planning/server/runs/opsRouteService";

type RouteParams = {
  runId: string;
};

type DeleteBody = {
  csrf?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function DELETE(request: Request, context: { params: Promise<RouteParams> }) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: DeleteBody = null;
  try {
    body = (await request.json()) as DeleteBody;
  } catch {
    body = null;
  }

  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    requireCsrf(request, body);
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return opsErrorResponse({
        code: "INTERNAL",
        message: "요청 검증 중 오류가 발생했습니다.",
        status: 500,
      });
    }
    return opsErrorResponse({
      code: guard.code,
      message: guard.message,
      status: guard.status,
    });
  }
  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) return currentUser;

  const { runId } = await context.params;
  const id = asString(runId);
  if (!id) {
    return opsErrorResponse({
      code: "VALIDATION",
      message: "runId를 입력하세요.",
      status: 400,
    });
  }

  try {
    const result = await deleteOpsRun(id);
    if (!result.deleted) {
      return opsErrorResponse({
        code: "VALIDATION",
        message: "실행 기록을 찾을 수 없습니다.",
        status: 404,
      });
    }

    return NextResponse.json({
      ok: true,
      data: result,
      meta: {
        ...planningUserMeta(currentUser),
        ...opsRunsRouteMeta(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "실행 기록 삭제에 실패했습니다.";
    await auditOpsRunDeleteError({
      runId: id,
      message,
    });
    return opsErrorResponse({
      code: "INTERNAL",
      message,
      status: 500,
    });
  }
}
