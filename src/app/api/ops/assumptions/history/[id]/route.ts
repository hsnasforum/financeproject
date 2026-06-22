import { NextResponse } from "next/server";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { getOpsAssumptionsHistorySnapshot } from "@/lib/ops/assumptions/assumptionsHistoryRouteService";
import { opsErrorResponse } from "@/lib/ops/errorContract";
import {
  isPlanningRouteUser,
  requirePlanningRouteUser,
} from "@/lib/planning/api/routeAuth";
import { assumptionsUserMeta } from "../../_lib";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);
  const csrf = asString(searchParams.get("csrf"));

  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    assertCsrf(request, { csrf });
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

  const params = await context.params;
  const id = asString(params.id);
  if (!id) {
    return opsErrorResponse({
      code: "VALIDATION",
      message: "snapshot id가 필요합니다.",
      status: 400,
      fixHref: "/ops/assumptions",
    });
  }

  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) return currentUser;

  const result = await getOpsAssumptionsHistorySnapshot({
    currentUser,
    snapshotId: id,
  });
  if (result.kind === "missing") {
    return opsErrorResponse({
      code: "STALE_ASSUMPTIONS",
      message: "요청한 스냅샷을 찾을 수 없습니다.",
      status: 404,
    });
  }
  if (result.kind === "storage-corrupt") {
    return opsErrorResponse({
      code: "STORAGE_CORRUPT",
      message: result.message,
      status: 500,
    });
  }

  return NextResponse.json({
    ok: true,
    snapshotId: result.snapshotId,
    snapshot: result.snapshot,
    meta: assumptionsUserMeta(currentUser, result.meta),
  });
}
