import {
  NextResponse } from "next/server";
import {
  requireCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
  } from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { opsErrorResponse } from "../../../../../lib/ops/errorContract";
import {
  planningUserMeta,
  withPlanningRouteUser,
} from "../../../../../lib/planning/api/routeAuth";
import {
  auditOpsRunsCleanupError,
  cleanupOpsRuns,
  opsRunsRouteMeta,
} from "../../../../../lib/planning/server/runs/opsRouteService";

type CleanupBody = {
  csrf?: unknown;
  keepDays?: unknown;
  keepCount?: unknown;
  profileId?: unknown;
  dryRun?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: CleanupBody = null;
  try {
    body = (await request.json()) as CleanupBody;
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
  return await withPlanningRouteUser(request, async (currentUser) => {

    const profileId = asString(body?.profileId);

    try {
      const result = await cleanupOpsRuns({
        keepDays: body?.keepDays,
        keepCount: body?.keepCount,
        profileId,
        dryRun: body?.dryRun,
      });

      return NextResponse.json({
        ok: true,
        message: result.message,
        data: result.data,
        meta: {
          ...planningUserMeta(currentUser),
          ...opsRunsRouteMeta(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "runs cleanup 실행에 실패했습니다.";
      await auditOpsRunsCleanupError({
        profileId,
        keepDays: body?.keepDays,
        keepCount: body?.keepCount,
        dryRun: body?.dryRun,
        message,
      });
      return opsErrorResponse({
        code: "INTERNAL",
        message,
        status: 500,
      });
    }
  });
}
