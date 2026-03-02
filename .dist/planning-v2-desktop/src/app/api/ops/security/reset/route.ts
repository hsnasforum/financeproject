import { NextResponse } from "next/server";
import { toGuardErrorResponse } from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { toOpsContractError } from "../../../../../lib/ops/errorContract";
import { appendOpsAuditEvent } from "../../../../../lib/ops/securityAuditLog";
import { consumeVaultCsrfOrThrow } from "../../../../../lib/planning/security/vaultCsrf";
import { resetVaultAndPlanningData } from "../../../../../lib/planning/security/vaultReset";
import { getVaultStatus } from "../../../../../lib/planning/security/vaultState";
import { asString, guardLocalRequest, withVaultCsrf } from "../_lib";

const RESET_CONFIRM_PHRASE = "RESET VAULT DATA";

function toClientError(error: unknown): { status: number; code: string; message: string } {
  const message = error instanceof Error ? error.message : "vault reset failed";
  if (message.startsWith("CONFIRM_MISMATCH")) {
    return {
      status: 400,
      code: "VALIDATION",
      message: `확인 문구를 정확히 입력해 주세요. (${RESET_CONFIRM_PHRASE})`,
    };
  }
  if (message.startsWith("VAULT_RESET_UNSAFE_PATH")) {
    return {
      status: 500,
      code: "RESET_PATH_UNSAFE",
      message: "리셋 경로 검증에 실패했습니다. 환경변수를 확인해 주세요.",
    };
  }
  return { status: 500, code: "RESET_FAILED", message: "Vault 데이터 초기화에 실패했습니다." };
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guard = guardLocalRequest(request);
  if (guard) return withVaultCsrf(request, guard);

  const body = await request.json().catch(() => null) as {
    csrf?: unknown;
    confirmText?: unknown;
    keepAudit?: unknown;
  } | null;

  try {
    consumeVaultCsrfOrThrow(request, asString(body?.csrf));
    const confirmText = asString(body?.confirmText);
    if (confirmText !== RESET_CONFIRM_PHRASE) {
      throw new Error("CONFIRM_MISMATCH");
    }

    const keepAudit = body?.keepAudit !== false;
    const reset = await resetVaultAndPlanningData({ keepAudit });
    const status = await getVaultStatus();

    if (keepAudit) {
      await appendOpsAuditEvent({
        eventType: "VAULT_RESET_SUCCESS",
        meta: {
          keepAudit,
          removedCount: reset.removed.length,
        },
      }).catch(() => undefined);
    }

    return withVaultCsrf(request, NextResponse.json({
      ok: true,
      data: status,
      meta: {
        reset,
      },
    }));
  } catch (error) {
    const guardError = toGuardErrorResponse(error);
    if (guardError) {
      const contractGuard = toOpsContractError({
        code: guardError.code,
        message: guardError.message,
        status: guardError.status,
      });
      return withVaultCsrf(request, NextResponse.json(contractGuard.body, { status: contractGuard.status }));
    }
    const client = toClientError(error);
    const contractError = toOpsContractError({
      code: client.code,
      message: client.message,
      status: client.status,
      details: {
        expectedConfirm: RESET_CONFIRM_PHRASE,
      },
    });
    await appendOpsAuditEvent({
      eventType: "VAULT_RESET_ERROR",
      meta: {
        code: contractError.body.error.code,
        status: contractError.status,
      },
    }).catch(() => undefined);
    return withVaultCsrf(request, NextResponse.json(contractError.body, { status: contractError.status }));
  }
}
