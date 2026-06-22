import { NextResponse } from "next/server";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { setOpsLatestAssumptionsFromHistory } from "@/lib/ops/assumptions/assumptionsSetLatestRouteService";
import { opsErrorResponse } from "@/lib/ops/errorContract";
import {
  isPlanningRouteUser,
  requirePlanningRouteUser,
} from "@/lib/planning/api/routeAuth";
import { assumptionsUserMeta } from "../_lib";

type SetLatestBody = {
  csrf?: unknown;
  snapshotId?: unknown;
  confirm?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: SetLatestBody = null;
  try {
    body = (await request.json()) as SetLatestBody;
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

  const snapshotId = asString(body?.snapshotId);
  if (!snapshotId) {
    return opsErrorResponse({
      code: "VALIDATION",
      message: "snapshotId가 필요합니다.",
      status: 400,
      fixHref: "/ops/assumptions",
    });
  }

  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) return currentUser;

  const confirm = asString(body?.confirm);
  const result = await setOpsLatestAssumptionsFromHistory({
    confirm,
    currentUser,
    snapshotId,
  });
  if (result.kind === "validation-error") {
    return opsErrorResponse({
      code: "VALIDATION",
      message: result.message,
      status: 400,
      fixHref: "/ops/assumptions/history",
      details: {
        expectedConfirm: result.expectedConfirm,
      },
    });
  }
  if (result.kind === "missing") {
    return opsErrorResponse({
      code: "STALE_ASSUMPTIONS",
      message: result.message,
      status: 404,
      fixHref: "/ops/assumptions/history",
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
    message: result.message,
    snapshotRef: result.snapshotRef,
    meta: assumptionsUserMeta(currentUser, result.meta),
  });
}
