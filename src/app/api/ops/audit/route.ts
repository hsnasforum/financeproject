import { NextResponse } from "next/server";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../lib/dev/onlyDev";
import { opsErrorResponse } from "../../../../lib/ops/errorContract";
import { listOpsAuditEvents } from "../../../../lib/ops/securityAuditLog";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toSafeInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
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

  const { searchParams } = new URL(request.url);
  const csrf = asString(searchParams.get("csrf"));
  const guard = guardRequest(request, csrf);
  if (guard) return guard;

  const limit = toSafeInt(searchParams.get("limit"), 200, 1, 1000);
  const eventType = asString(searchParams.get("eventType")).toUpperCase();
  const taskName = asString(searchParams.get("taskName")).toUpperCase();

  try {
    const [sourceItems, eventTypeSource] = await Promise.all([
      listOpsAuditEvents({
        limit: taskName ? 1000 : limit,
        ...(eventType ? { eventType } : {}),
      }),
      listOpsAuditEvents({ limit: 1000 }),
    ]);

    const filteredByTaskName = taskName
      ? sourceItems.filter((row) => {
          const meta = row.meta && typeof row.meta === "object" ? row.meta : null;
          const currentTaskName = asString((meta as Record<string, unknown> | null)?.taskName).toUpperCase();
          return currentTaskName === taskName;
        })
      : sourceItems;
    const items = filteredByTaskName.slice(0, limit);

    const types = Array.from(new Set(eventTypeSource.map((row) => row.eventType))).sort((a, b) => a.localeCompare(b));
    const taskNames = Array.from(
      new Set(
        eventTypeSource
          .map((row) => {
            const meta = row.meta && typeof row.meta === "object" ? row.meta : null;
            return asString((meta as Record<string, unknown> | null)?.taskName).toUpperCase();
          })
          .filter((row) => row.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b));

    return NextResponse.json({
      ok: true,
      data: items,
      meta: {
        limit,
        ...(eventType ? { eventType } : {}),
        ...(taskName ? { taskName } : {}),
        types,
        taskNames,
      },
    });
  } catch (error) {
    return opsErrorResponse({
      code: "STORAGE_CORRUPT",
      message: error instanceof Error ? error.message : "감사 로그를 불러오지 못했습니다.",
      status: 500,
    });
  }
}
