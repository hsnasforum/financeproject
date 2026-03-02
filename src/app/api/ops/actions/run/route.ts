import { NextResponse } from "next/server";
import { append as appendAuditLog } from "../../../../../lib/audit/auditLogStore";
import {
  assertLocalHost,
  assertSameOrigin,
  assertDevUnlocked,
  requireCsrf,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { opsErrorResponse } from "../../../../../lib/ops/errorContract";
import { appendOpsAuditEvent } from "../../../../../lib/ops/securityAuditLog";
import { appendOpsMetricEvent } from "../../../../../lib/ops/metricsLog";
import { getOpsActionDefinition, runOpsAction, validateOpsActionParams } from "../../../../../lib/ops/actions/registry";
import { appendOpsActionLog } from "../../../../../lib/ops/actions/actionLog";
import { consumeOpsActionPreviewToken } from "../../../../../lib/ops/actions/previewToken";
import { type OpsActionId } from "../../../../../lib/ops/actions/types";
import { redactText } from "../../../../../lib/planning/privacy/redact";
import {
  appendStorageTransactionStep,
  beginStorageTransaction,
  endStorageTransaction,
} from "../../../../../lib/planning/storage/journal";

type ActionRunBody = {
  csrf?: unknown;
  actionId?: unknown;
  params?: unknown;
  previewToken?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function guardRequest(request: Request, csrf: string): NextResponse | null {
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    requireCsrf(request, { csrf });
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

function appendActionAudit(result: "SUCCESS" | "ERROR", detail: Record<string, unknown>): void {
  try {
    appendAuditLog({
      event: "OPS_ACTION_RUN",
      route: "/api/ops/actions/run",
      summary: `OPS_ACTION_RUN ${result}`,
      details: {
        result,
        ...detail,
      },
    });
  } catch (error) {
    console.error("[audit] failed to append ops action log", error);
  }
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: ActionRunBody = null;
  try {
    body = (await request.json()) as ActionRunBody;
  } catch {
    body = null;
  }

  const csrf = asString(body?.csrf);
  const guard = guardRequest(request, csrf);
  if (guard) return guard;

  const actionIdRaw = asString(body?.actionId);
  const definition = getOpsActionDefinition(actionIdRaw);
  if (!definition) {
    return opsErrorResponse({
      code: "VALIDATION",
      message: "지원하지 않는 actionId 입니다.",
      status: 400,
      fixHref: "/ops",
    });
  }

  const actionId = definition.id as OpsActionId;
  const params = validateOpsActionParams(actionId, body?.params);
  const previewToken = asString(body?.previewToken);

  if (definition.requirePreview) {
    const ok = consumeOpsActionPreviewToken(previewToken, actionId, params);
    if (!ok) {
      return opsErrorResponse({
        code: "VALIDATION",
        message: "미리보기(preview) 후 발급된 실행 토큰이 필요합니다.",
        status: 400,
        fixHref: "/ops",
      });
    }
  }

  if (definition.dangerous) {
    const required = asString(definition.confirmText);
    const provided = asString(params.confirmText);
    if (required && provided !== required) {
      return opsErrorResponse({
        code: "VALIDATION",
        message: `확인 문구가 필요합니다: ${required}`,
        status: 400,
        fixHref: "/ops",
      });
    }
  }

  const startedAt = Date.now();
  const tx = await beginStorageTransaction("OPS_ACTION_RUN", {
    actionId,
    dangerous: Boolean(definition.dangerous),
    requirePreview: Boolean(definition.requirePreview),
  });
  try {
    await appendStorageTransactionStep(tx, "VALIDATED", {
      hasConfirmText: asString(params.confirmText).length > 0,
      hasPreviewToken: previewToken.length > 0,
    });
    const result = await runOpsAction(actionId, params);
    await appendStorageTransactionStep(tx, "ACTION_EXECUTED", {
      ok: result.ok,
    });
    const safeMessage = redactText(result.message || "").slice(0, 500);

    appendActionAudit(result.ok ? "SUCCESS" : "ERROR", {
      actionId,
      dangerous: Boolean(definition.dangerous),
      message: safeMessage,
      durationMs: Math.max(0, Date.now() - startedAt),
    });
    await appendOpsAuditEvent({
      eventType: result.ok ? "OPS_ACTION_RUN_SUCCESS" : "OPS_ACTION_RUN_ERROR",
      meta: {
        actionId,
        dangerous: Boolean(definition.dangerous),
        durationMs: Math.max(0, Date.now() - startedAt),
      },
    }).catch(() => undefined);
    await appendOpsActionLog({
      actionId,
      at: new Date().toISOString(),
      status: result.ok ? "SUCCESS" : "FAILED",
      message: safeMessage || `${actionId} 완료`,
      durationMs: Math.max(0, Date.now() - startedAt),
      meta: {
        dangerous: Boolean(definition.dangerous),
      },
    }).catch(() => undefined);
    await appendOpsMetricEvent({
      type: "MIGRATION_ACTION",
      meta: {
        action: actionId,
        status: result.ok ? "SUCCESS" : "FAILED",
        durationMs: Math.max(0, Date.now() - startedAt),
        ...(result.ok ? {} : { code: "INTERNAL" }),
      },
    }).catch(() => undefined);
    await endStorageTransaction(tx, "COMMIT");

    return NextResponse.json({
      ok: result.ok,
      message: safeMessage || `${actionId} 완료`,
      data: {
        actionId,
        ...(result.data ? result.data : {}),
      },
    });
  } catch (error) {
    const safeMessage = redactText(error instanceof Error ? error.message : "ops action 실행 실패")
      || "ops action 실행 실패";
    await appendStorageTransactionStep(tx, "ACTION_ERROR", {
      code: "INTERNAL",
    }).catch(() => undefined);
    await endStorageTransaction(tx, "ROLLBACK", safeMessage).catch(() => undefined);

    appendActionAudit("ERROR", {
      actionId,
      dangerous: Boolean(definition.dangerous),
      message: safeMessage,
      durationMs: Math.max(0, Date.now() - startedAt),
    });
    await appendOpsAuditEvent({
      eventType: "OPS_ACTION_RUN_ERROR",
      meta: {
        actionId,
        dangerous: Boolean(definition.dangerous),
        durationMs: Math.max(0, Date.now() - startedAt),
      },
    }).catch(() => undefined);
    await appendOpsActionLog({
      actionId,
      at: new Date().toISOString(),
      status: "FAILED",
      message: safeMessage,
      durationMs: Math.max(0, Date.now() - startedAt),
      meta: {
        dangerous: Boolean(definition.dangerous),
      },
    }).catch(() => undefined);
    await appendOpsMetricEvent({
      type: "MIGRATION_ACTION",
      meta: {
        action: actionId,
        status: "FAILED",
        durationMs: Math.max(0, Date.now() - startedAt),
        code: "INTERNAL",
      },
    }).catch(() => undefined);

    return opsErrorResponse({
      code: "INTERNAL",
      message: safeMessage,
      status: 500,
      fixHref: "/ops",
    });
  }
}
