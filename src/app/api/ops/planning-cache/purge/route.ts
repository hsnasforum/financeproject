import { NextResponse } from "next/server";
import { append as appendAuditLog } from "@/lib/audit/auditLogStore";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { opsErrorResponse } from "@/lib/ops/errorContract";
import { purgeExpired } from "@/lib/planning/cache/storage";
import {
  isPlanningRouteUser,
  planningUserMeta,
  requirePlanningRouteUser,
  type PlanningRouteUser,
} from "@/lib/planning/api/routeAuth";
import { isPlanningNamespaceEnabled } from "@/lib/planning/store/namespace";

type PurgeBody = {
  csrf?: unknown;
} | null;

function appendPurgeAudit(input: {
  result: "SUCCESS" | "ERROR";
  purged?: number;
  message: string;
  user?: PlanningRouteUser;
}) {
  try {
    appendAuditLog({
      event: "PLANNING_CACHE_PURGE",
      route: "/api/ops/planning-cache/purge",
      summary: `PLANNING_CACHE_PURGE ${input.result}: ${input.message}`,
      details: {
        result: input.result,
        purged: input.purged ?? null,
        message: input.message,
        ...(input.user ? {
          planningUserId: input.user.id,
          authSource: input.user.source,
          ...(isPlanningNamespaceEnabled() ? { planningNamespaceEnabled: true } : {}),
        } : {}),
      },
    });
  } catch (error) {
    console.error("[audit] failed to append planning cache purge log", error);
  }
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: PurgeBody = null;
  try {
    body = (await request.json()) as PurgeBody;
  } catch {
    body = null;
  }

  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    assertCsrf(request, body);
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

  try {
    const result = await purgeExpired();
    const message = `만료 캐시 ${result.purged}건을 정리했습니다.`;

    appendPurgeAudit({
      result: "SUCCESS",
      purged: result.purged,
      message,
      user: currentUser,
    });

    return NextResponse.json({
      ok: true,
      data: result,
      meta: {
        ...planningUserMeta(currentUser),
        ...(isPlanningNamespaceEnabled() ? { planningNamespaceEnabled: true } : {}),
      },
      message,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "캐시 정리에 실패했습니다.";
    appendPurgeAudit({
      result: "ERROR",
      message,
      user: currentUser,
    });

    return opsErrorResponse({
      code: "STORAGE_CORRUPT",
      message,
      status: 500,
    });
  }
}
