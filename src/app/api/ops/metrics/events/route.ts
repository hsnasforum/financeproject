import { NextResponse } from "next/server";
import {
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { opsErrorResponse } from "@/lib/ops/errorContract";
import { readRecent, type MetricsEventType } from "@/lib/ops/metrics/metricsStore";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toSafeInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseType(value: unknown): MetricsEventType | undefined {
  const normalized = asString(value).toUpperCase();
  if (
    normalized === "RUN_STAGE"
    || normalized === "RUN_PIPELINE"
    || normalized === "ASSUMPTIONS_REFRESH"
    || normalized === "BACKUP_EXPORT"
    || normalized === "BACKUP_PREVIEW"
    || normalized === "BACKUP_RESTORE"
    || normalized === "VAULT_UNLOCK"
    || normalized === "MIGRATION_ACTION"
    || normalized === "SCHEDULED_TASK"
  ) {
    return normalized;
  }
  return undefined;
}

function guardReadRequest(request: Request): NextResponse | null {
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
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

  const guard = guardReadRequest(request);
  if (guard) return guard;

  const { searchParams } = new URL(request.url);
  const limit = toSafeInt(searchParams.get("limit"), 200, 1, 1000);
  const type = parseType(searchParams.get("type"));

  try {
    const rows = await readRecent({
      limit,
      ...(type ? { type } : {}),
    });
    const types = Array.from(new Set(rows.map((row) => row.type))).sort((a, b) => a.localeCompare(b));

    return NextResponse.json({
      ok: true,
      data: rows,
      meta: {
        limit,
        ...(type ? { type } : {}),
        types,
      },
    });
  } catch (error) {
    return opsErrorResponse({
      code: "STORAGE_CORRUPT",
      message: error instanceof Error ? error.message : "metrics 이벤트를 불러오지 못했습니다.",
      status: 500,
    });
  }
}
