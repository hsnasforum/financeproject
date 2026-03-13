import { NextResponse } from "next/server";
import {
  assertLocalHost,
  assertSameOrigin,
  assertDevUnlocked,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { opsErrorResponse } from "@/lib/ops/errorContract";
import { appendOpsAuditEvent } from "@/lib/ops/securityAuditLog";
import {
  readOpsSchedulerEvents,
  readSchedulerLogTail,
  resolveOpsSchedulerStderrLogPath,
  resolveOpsSchedulerStdoutLogPath,
  summarizeOpsSchedulerEvents,
} from "@/lib/ops/scheduler/eventLog";
import {
  deleteOpsSchedulerThresholdPolicy,
  inspectOpsSchedulerThresholdPolicy,
  loadOpsSchedulerThresholdPolicy,
  saveOpsSchedulerThresholdPolicy,
  validateOpsSchedulerThresholdPolicy,
} from "@/lib/ops/scheduler/policy";

function toSafeInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function toBoolean(value: unknown): boolean {
  if (value === true) return true;
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
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

function guardWriteRequest(request: Request, body: { csrf?: unknown } | null): NextResponse | null {
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    requireCsrf(request, body);
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
  const limit = toSafeInt(searchParams.get("limit"), 20, 1, 200);
  const includeLogs = (searchParams.get("includeLogs") ?? "").trim() === "1";
  const logLines = toSafeInt(searchParams.get("logLines"), 8, 1, 50);

  try {
    const rows = await readOpsSchedulerEvents({ limit });
    const summary = summarizeOpsSchedulerEvents(rows);
    const policyState = await inspectOpsSchedulerThresholdPolicy();
    const logs = includeLogs
      ? {
          stdout: await readSchedulerLogTail(resolveOpsSchedulerStdoutLogPath(), { lines: logLines }),
          stderr: await readSchedulerLogTail(resolveOpsSchedulerStderrLogPath(), { lines: logLines }),
        }
      : null;

    return NextResponse.json({
      ok: true,
      data: rows,
      meta: {
        limit,
        summary,
        policy: policyState.policy,
        policySource: policyState.source,
        policyValid: policyState.valid,
        policyErrors: policyState.errors,
        ...(includeLogs ? { logs } : {}),
      },
    });
  } catch (error) {
    return opsErrorResponse({
      code: "STORAGE_CORRUPT",
      message: error instanceof Error ? error.message : "scheduler 로그를 불러오지 못했습니다.",
      status: 500,
    });
  }
}

type SchedulerPolicyBody = {
  csrf?: unknown;
  warnConsecutiveFailures?: unknown;
  riskConsecutiveFailures?: unknown;
  resetToEnvDefaults?: unknown;
} | null;

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: SchedulerPolicyBody = null;
  try {
    body = (await request.json()) as SchedulerPolicyBody;
  } catch {
    body = null;
  }

  const guard = guardWriteRequest(request, body);
  if (guard) return guard;

  const current = await loadOpsSchedulerThresholdPolicy();
  const resetToEnvDefaults = toBoolean(body?.resetToEnvDefaults);

  if (resetToEnvDefaults) {
    try {
      const before = current;
      await deleteOpsSchedulerThresholdPolicy();
      const resetState = await inspectOpsSchedulerThresholdPolicy();
      await appendOpsAuditEvent({
        eventType: "OPS_SCHEDULER_POLICY_UPDATE",
        meta: {
          reset: true,
          source: resetState.source,
          before: {
            warnConsecutiveFailures: before.warnConsecutiveFailures,
            riskConsecutiveFailures: before.riskConsecutiveFailures,
          },
          after: {
            warnConsecutiveFailures: resetState.policy.warnConsecutiveFailures,
            riskConsecutiveFailures: resetState.policy.riskConsecutiveFailures,
          },
        },
      }).catch(() => undefined);
      return NextResponse.json({
        ok: true,
        data: resetState.policy,
        meta: {
          source: resetState.source,
          valid: resetState.valid,
          errors: resetState.errors,
        },
      });
    } catch (error) {
      return opsErrorResponse({
        code: "INTERNAL",
        message: error instanceof Error ? error.message : "scheduler 임계치 초기화에 실패했습니다.",
        status: 500,
      });
    }
  }

  const validated = validateOpsSchedulerThresholdPolicy({
    warnConsecutiveFailures: body?.warnConsecutiveFailures,
    riskConsecutiveFailures: body?.riskConsecutiveFailures,
  }, current);
  if (!validated.ok) {
    return opsErrorResponse({
      code: "VALIDATION",
      message: validated.errors[0] ?? "scheduler 임계치 값이 올바르지 않습니다.",
      status: 400,
    });
  }

  try {
    const saved = await saveOpsSchedulerThresholdPolicy(validated.data);
    const savedState = await inspectOpsSchedulerThresholdPolicy();
    await appendOpsAuditEvent({
      eventType: "OPS_SCHEDULER_POLICY_UPDATE",
      meta: {
        reset: false,
        source: savedState.source,
        before: {
          warnConsecutiveFailures: current.warnConsecutiveFailures,
          riskConsecutiveFailures: current.riskConsecutiveFailures,
        },
        after: {
          warnConsecutiveFailures: saved.warnConsecutiveFailures,
          riskConsecutiveFailures: saved.riskConsecutiveFailures,
        },
      },
    }).catch(() => undefined);
    return NextResponse.json({
      ok: true,
      data: saved,
      meta: {
        source: savedState.source,
        valid: savedState.valid,
        errors: savedState.errors,
      },
    });
  } catch (error) {
    return opsErrorResponse({
      code: "INTERNAL",
      message: error instanceof Error ? error.message : "scheduler 임계치 저장에 실패했습니다.",
      status: 500,
    });
  }
}
