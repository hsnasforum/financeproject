import { NextResponse } from "next/server";
import { append as appendAuditLog } from "../../../../../lib/audit/auditLogStore";
import {
  requireCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { opsErrorResponse } from "../../../../../lib/ops/errorContract";
import { appendOpsMetricEvent } from "../../../../../lib/ops/metricsLog";
import { appendOpsAuditEvent } from "../../../../../lib/ops/securityAuditLog";
import { buildAssumptionsSnapshot } from "../../../../../lib/planning/assumptions/sync";
import { redactText } from "../../../../../lib/planning/privacy/redact";

type RefreshBody = {
  csrf?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function appendRefreshAudit(input: {
  result: "SUCCESS" | "ERROR";
  latestId?: string;
  message: string;
}) {
  try {
    appendAuditLog({
      event: "ASSUMPTIONS_REFRESH",
      route: "/api/ops/assumptions/refresh",
      summary: `ASSUMPTIONS_REFRESH ${input.result}: ${input.message}`,
      details: {
        result: input.result,
        latestId: input.latestId ?? null,
        message: input.message,
      },
    });
  } catch (error) {
    console.error("[audit] failed to append assumptions refresh log", error);
  }
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: RefreshBody = null;
  try {
    body = (await request.json()) as RefreshBody;
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

  const startedAt = Date.now();
  try {
    const refreshed = await buildAssumptionsSnapshot();
    const latestId = asString(refreshed.snapshotId);
    const warningsCount = Array.isArray(refreshed.snapshot.warnings) ? refreshed.snapshot.warnings.length : 0;
    const message = warningsCount > 0
      ? "가정 스냅샷을 새로고침했지만 일부 경고가 있습니다."
      : "가정 스냅샷을 새로고침했습니다.";

    appendRefreshAudit({
      result: "SUCCESS",
      latestId,
      message,
    });
    await appendOpsAuditEvent({
      eventType: "OPS_ASSUMPTIONS_REFRESH_SUCCESS",
      meta: {
        latestId,
        warningsCount,
      },
    }).catch(() => undefined);
    await appendOpsMetricEvent({
      type: "ASSUMPTIONS_REFRESH",
      meta: {
        status: "SUCCESS",
        latestId,
        warningsCount,
        durationMs: Math.max(0, Date.now() - startedAt),
      },
    }).catch(() => undefined);

    return NextResponse.json({
      ok: true,
      latestId,
      message,
      snapshot: {
        id: latestId,
        asOf: refreshed.snapshot.asOf,
        fetchedAt: refreshed.snapshot.fetchedAt,
        warningsCount,
      },
    });
  } catch (error) {
    const unsafeMessage = error instanceof Error ? error.message : "가정 스냅샷 새로고침에 실패했습니다.";
    const message = redactText(unsafeMessage) || "가정 스냅샷 새로고침에 실패했습니다.";

    appendRefreshAudit({
      result: "ERROR",
      message,
    });
    await appendOpsAuditEvent({
      eventType: "OPS_ASSUMPTIONS_REFRESH_ERROR",
      meta: {
        message,
      },
    }).catch(() => undefined);
    await appendOpsMetricEvent({
      type: "ASSUMPTIONS_REFRESH",
      meta: {
        status: "FAILED",
        code: "INTERNAL",
        durationMs: Math.max(0, Date.now() - startedAt),
      },
    }).catch(() => undefined);

    return opsErrorResponse({
      code: "INTERNAL",
      message,
      status: 500,
    });
  }
}
