import { NextResponse } from "next/server";
import { toGuardErrorResponse } from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { opsErrorResponse, toOpsContractError } from "../../../../../lib/ops/errorContract";
import { appendOpsMetricEvent } from "../../../../../lib/ops/metricsLog";
import { appendOpsAuditEvent } from "../../../../../lib/ops/securityAuditLog";
import { consumeVaultCsrfOrThrow } from "../../../../../lib/planning/security/vaultCsrf";
import { unlockVault } from "../../../../../lib/planning/security/vaultState";
import { asString, guardLocalRequest, withVaultCsrf } from "../_lib";

function toClientError(error: unknown): { status: number; code: string; message: string } {
  const message = error instanceof Error ? error.message : "vault unlock failed";
  if (message.startsWith("VAULT_NOT_CONFIGURED")) {
    return { status: 400, code: "VALIDATION", message: "먼저 vault 암호를 설정해 주세요." };
  }
  if (message.startsWith("VAULT_PASSPHRASE_REQUIRED")) {
    return { status: 400, code: "VALIDATION", message: "암호를 입력해 주세요." };
  }
  if (message.startsWith("VAULT_UNLOCK_BACKOFF")) {
    return { status: 423, code: "LOCKED", message: "잠시 후 다시 시도해 주세요." };
  }
  if (message.startsWith("VAULT_PASSPHRASE_INVALID")) {
    return { status: 401, code: "VALIDATION", message: "암호를 확인해 주세요." };
  }
  return { status: 500, code: "UNLOCK_FAILED", message: "Vault 잠금 해제에 실패했습니다." };
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const startedAt = Date.now();
  const guard = guardLocalRequest(request);
  if (guard) return withVaultCsrf(request, guard);

  const body = await request.json().catch(() => null) as {
    csrf?: unknown;
    passphrase?: unknown;
  } | null;

  try {
    consumeVaultCsrfOrThrow(request, asString(body?.csrf));
    const status = await unlockVault(asString(body?.passphrase));
    await appendOpsAuditEvent({
      eventType: "VAULT_UNLOCK_SUCCESS",
      meta: {
        unlocked: status.unlocked,
      },
    }).catch(() => undefined);
    await appendOpsMetricEvent({
      type: "VAULT_UNLOCK",
      meta: {
        status: "SUCCESS",
        durationMs: Math.max(0, Date.now() - startedAt),
      },
    }).catch(() => undefined);
    return withVaultCsrf(request, NextResponse.json({ ok: true, data: status }));
  } catch (error) {
    const guardError = toGuardErrorResponse(error);
    if (guardError) {
      return withVaultCsrf(request, opsErrorResponse({
        code: guardError.code,
        message: guardError.message,
        status: guardError.status,
      }));
    }
    const client = toClientError(error);
    const contractError = toOpsContractError({
      code: client.code,
      message: client.message,
      status: client.status,
    });
    await appendOpsAuditEvent({
      eventType: "VAULT_UNLOCK_ERROR",
      meta: {
        code: contractError.body.error.code,
        status: contractError.status,
      },
    }).catch(() => undefined);
    await appendOpsMetricEvent({
      type: "VAULT_UNLOCK",
      meta: {
        status: "FAILED",
        durationMs: Math.max(0, Date.now() - startedAt),
        code: contractError.body.error.code,
      },
    }).catch(() => undefined);
    return withVaultCsrf(request, NextResponse.json(contractError.body, { status: contractError.status }));
  }
}
