import { append as appendAuditLog } from "../../audit/auditLogStore";
import { redactText } from "../../planning/privacy/redact";
import {
  appendStorageTransactionStep,
  beginStorageTransaction,
  endStorageTransaction,
} from "../../planning/storage/journal";
import { appendOpsMetricEvent } from "../metricsLog";
import { appendOpsAuditEvent } from "../securityAuditLog";
import { appendOpsActionLog } from "./actionLog";
import { consumeOpsActionPreviewToken } from "./previewToken";
import { getOpsActionDefinition, runOpsAction, validateOpsActionParams } from "./registry";
import {
  opsActionAuditEventType,
  opsActionAuditResult,
  resolveOpsActionRunStatus,
} from "./resultStatus";
import { type OpsActionId, type OpsActionParams } from "./types";

export type OpsActionRunRouteResult =
  | {
    kind: "completed";
    actionId: OpsActionId;
    ok: boolean;
    message: string;
    data?: Record<string, unknown>;
  }
  | {
    kind: "validation-error";
    message: string;
  }
  | {
    kind: "preview-required";
    message: string;
  }
  | {
    kind: "not-implemented";
    message: string;
  }
  | {
    kind: "internal-error";
    message: string;
  };

export type OpsActionRunRouteInput = {
  actionId: unknown;
  params: unknown;
  previewToken: unknown;
  startedAt?: number;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function appendActionAudit(result: "SUCCESS" | "PARTIAL_SUCCESS" | "ERROR", detail: Record<string, unknown>): void {
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

async function executeOpsAction(input: {
  actionId: OpsActionId;
  dangerous: boolean;
  params: OpsActionParams;
  previewToken: string;
  requirePreview: boolean;
  startedAt?: number;
}): Promise<OpsActionRunRouteResult> {
  const startedAt = input.startedAt ?? Date.now();
  const tx = await beginStorageTransaction("OPS_ACTION_RUN", {
    actionId: input.actionId,
    dangerous: input.dangerous,
    requirePreview: input.requirePreview,
  });

  try {
    await appendStorageTransactionStep(tx, "VALIDATED", {
      hasConfirmText: asString(input.params.confirmText).length > 0,
      hasPreviewToken: input.previewToken.length > 0,
    });
    const result = await runOpsAction(input.actionId, input.params);
    const runStatus = resolveOpsActionRunStatus(result);
    await appendStorageTransactionStep(tx, "ACTION_EXECUTED", {
      ok: result.ok,
      status: runStatus,
    });
    if (!result.ok && result.errorCode === "NOT_IMPLEMENTED") {
      await endStorageTransaction(tx, "ROLLBACK", result.message || "not implemented").catch(() => undefined);
      return {
        kind: "not-implemented",
        message: result.message || "지원하지 않는 actionId 입니다.",
      };
    }
    const safeMessage = redactText(result.message || "").slice(0, 500);
    const durationMs = Math.max(0, Date.now() - startedAt);

    appendActionAudit(opsActionAuditResult(runStatus), {
      actionId: input.actionId,
      dangerous: input.dangerous,
      message: safeMessage,
      durationMs,
    });
    await appendOpsAuditEvent({
      eventType: opsActionAuditEventType(runStatus),
      meta: {
        actionId: input.actionId,
        dangerous: input.dangerous,
        status: runStatus,
        durationMs,
      },
    }).catch(() => undefined);
    await appendOpsActionLog({
      actionId: input.actionId,
      at: new Date().toISOString(),
      status: runStatus,
      message: safeMessage || `${input.actionId} 완료`,
      durationMs,
      meta: {
        dangerous: input.dangerous,
      },
    }).catch(() => undefined);
    await appendOpsMetricEvent({
      type: "MIGRATION_ACTION",
      meta: {
        action: input.actionId,
        status: runStatus,
        durationMs,
        ...(runStatus === "FAILED" ? { code: "INTERNAL" } : {}),
      },
    }).catch(() => undefined);
    await endStorageTransaction(tx, "COMMIT");

    return {
      kind: "completed",
      actionId: input.actionId,
      ok: result.ok,
      message: safeMessage || `${input.actionId} 완료`,
      ...(result.data ? { data: result.data } : {}),
    };
  } catch (error) {
    const safeMessage = redactText(error instanceof Error ? error.message : "ops action 실행 실패")
      || "ops action 실행 실패";
    const durationMs = Math.max(0, Date.now() - startedAt);

    await appendStorageTransactionStep(tx, "ACTION_ERROR", {
      code: "INTERNAL",
    }).catch(() => undefined);
    await endStorageTransaction(tx, "ROLLBACK", safeMessage).catch(() => undefined);

    appendActionAudit("ERROR", {
      actionId: input.actionId,
      dangerous: input.dangerous,
      message: safeMessage,
      durationMs,
    });
    await appendOpsAuditEvent({
      eventType: "OPS_ACTION_RUN_ERROR",
      meta: {
        actionId: input.actionId,
        dangerous: input.dangerous,
        durationMs,
      },
    }).catch(() => undefined);
    await appendOpsActionLog({
      actionId: input.actionId,
      at: new Date().toISOString(),
      status: "FAILED",
      message: safeMessage,
      durationMs,
      meta: {
        dangerous: input.dangerous,
      },
    }).catch(() => undefined);
    await appendOpsMetricEvent({
      type: "MIGRATION_ACTION",
      meta: {
        action: input.actionId,
        status: "FAILED",
        durationMs,
        code: "INTERNAL",
      },
    }).catch(() => undefined);

    return {
      kind: "internal-error",
      message: safeMessage,
    };
  }
}

export async function runOpsActionRoute(input: OpsActionRunRouteInput): Promise<OpsActionRunRouteResult> {
  const definition = getOpsActionDefinition(asString(input.actionId));
  if (!definition) {
    return {
      kind: "not-implemented",
      message: "지원하지 않는 actionId 입니다.",
    };
  }

  const actionId = definition.id as OpsActionId;
  const params = validateOpsActionParams(actionId, input.params);
  const previewToken = asString(input.previewToken);

  if (definition.requirePreview) {
    const ok = consumeOpsActionPreviewToken(previewToken, actionId, params);
    if (!ok) {
      return {
        kind: "preview-required",
        message: "미리보기(preview) 후 발급된 실행 토큰이 필요합니다.",
      };
    }
  }

  if (definition.dangerous) {
    const required = asString(definition.confirmText);
    const provided = asString(params.confirmText);
    if (required && provided !== required) {
      return {
        kind: "validation-error",
        message: `확인 문구가 필요합니다: ${required}`,
      };
    }
  }

  return executeOpsAction({
    actionId,
    dangerous: Boolean(definition.dangerous),
    params,
    previewToken,
    requirePreview: Boolean(definition.requirePreview),
    startedAt: input.startedAt,
  });
}
