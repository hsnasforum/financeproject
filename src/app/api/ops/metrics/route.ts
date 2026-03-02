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
import {
  type OpsMetricEventType,
  listOpsMetricEvents,
  summarizeOpsMetricEvents,
} from "../../../../lib/ops/metricsLog";
import { loadOpsPolicy } from "../../../../lib/ops/opsPolicy";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toSafeInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseType(value: unknown): OpsMetricEventType | undefined {
  const normalized = asString(value).toUpperCase();
  if (
    normalized === "RUN_STAGE"
    || normalized === "SCHEDULED_TASK"
    || normalized === "ASSUMPTIONS_REFRESH"
    || normalized === "BACKUP_EXPORT"
    || normalized === "BACKUP_PREVIEW"
    || normalized === "BACKUP_RESTORE"
    || normalized === "VAULT_UNLOCK"
    || normalized === "MIGRATION_ACTION"
  ) {
    return normalized;
  }
  return undefined;
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
  const type = parseType(searchParams.get("type"));

  try {
    const [rows, sourceRows] = await Promise.all([
      listOpsMetricEvents({
        limit,
        ...(type ? { type } : {}),
      }),
      listOpsMetricEvents({ limit: 5000 }),
    ]);

    const summary = summarizeOpsMetricEvents(sourceRows);
    const types = Array.from(new Set(sourceRows.map((row) => row.type))).sort((a, b) => a.localeCompare(b));
    const policy = loadOpsPolicy();

    return NextResponse.json({
      ok: true,
      data: rows,
      summary,
      meta: {
        limit,
        ...(type ? { type } : {}),
        types,
        thresholds: {
          failureRateWarnPct: policy.metrics.failureRateWarnPct,
          latencyRegressionWarnMs: policy.metrics.latencyRegressionWarnMs,
          refreshFailureWarnCount: policy.metrics.refreshFailureWarnCount,
        },
      },
    });
  } catch (error) {
    return opsErrorResponse({
      code: "STORAGE_CORRUPT",
      message: error instanceof Error ? error.message : "metrics 로그를 불러오지 못했습니다.",
      status: 500,
    });
  }
}
