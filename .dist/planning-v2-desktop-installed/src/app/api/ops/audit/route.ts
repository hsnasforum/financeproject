import { NextResponse } from "next/server";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../lib/dev/onlyDev";
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
      return NextResponse.json({ ok: false, message: "요청 검증 중 오류가 발생했습니다." }, { status: 500 });
    }
    return NextResponse.json({ ok: false, message: guard.message }, { status: guard.status });
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

  try {
    const [items, eventTypeSource] = await Promise.all([
      listOpsAuditEvents({
        limit,
        ...(eventType ? { eventType } : {}),
      }),
      listOpsAuditEvents({ limit: 1000 }),
    ]);

    const types = Array.from(new Set(eventTypeSource.map((row) => row.eventType))).sort((a, b) => a.localeCompare(b));

    return NextResponse.json({
      ok: true,
      data: items,
      meta: {
        limit,
        ...(eventType ? { eventType } : {}),
        types,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "감사 로그를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
