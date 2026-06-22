import { NextResponse } from "next/server";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { opsErrorResponse } from "../../../../../lib/ops/errorContract";
import { exportOpsSupportBundle } from "../../../../../lib/ops/support/supportExportRouteService";
import { isPlanningRouteUser, requirePlanningRouteUser } from "../../../../../lib/planning/api/routeAuth";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function guardRequest(request: Request, csrf: string): NextResponse | null {
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    assertCsrf(request, { csrf });
    return null;
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
}

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const startedAt = Date.now();
  const { searchParams } = new URL(request.url);
  const csrf = asString(searchParams.get("csrf"));
  const guard = guardRequest(request, csrf);
  if (guard) return guard;

  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) return currentUser;

  const result = await exportOpsSupportBundle({
    currentUser,
    startedAt,
  });
  if (result.kind === "internal-error") {
    return opsErrorResponse({
      code: "INTERNAL",
      message: result.message,
      status: 500,
      fixHref: "/ops/support",
    });
  }

  const zipBody = Uint8Array.from(result.bytes).buffer;
  return new NextResponse(zipBody, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${result.fileName}"`,
      "cache-control": "no-store",
    },
  });
}
