import { appendOpsAuditEvent } from "../../../ops/securityAuditLog";
import { invalidatePlanningStartupMigrationCache } from "../../migrations/manager";
import { consumeVaultCsrfOrThrow } from "../../security/vaultCsrf";
import {
  resetVaultAndPlanningData,
  type VaultResetResult,
} from "../../security/vaultReset";
import {
  getVaultStatus,
  type VaultStatus,
} from "../../security/vaultState";

export const OPS_SECURITY_RESET_CONFIRM_PHRASE = "RESET VAULT DATA";

export type OpsSecurityResetClientError = {
  status: number;
  code: string;
  message: string;
};

export type OpsSecurityResetPayload = {
  reset: VaultResetResult;
  status: VaultStatus;
};

export function assertOpsSecurityVaultCsrf(request: Request, csrfToken: string): void {
  consumeVaultCsrfOrThrow(request, csrfToken);
}

export function toOpsSecurityResetClientError(error: unknown): OpsSecurityResetClientError {
  const message = error instanceof Error ? error.message : "vault reset failed";
  if (message.startsWith("CONFIRM_MISMATCH")) {
    return {
      status: 400,
      code: "VALIDATION",
      message: `확인 문구를 정확히 입력해 주세요. (${OPS_SECURITY_RESET_CONFIRM_PHRASE})`,
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

export async function resetOpsSecurityVaultAndPlanningData(input: {
  confirmText: string;
  keepAudit: boolean;
}): Promise<OpsSecurityResetPayload> {
  if (input.confirmText !== OPS_SECURITY_RESET_CONFIRM_PHRASE) {
    throw new Error("CONFIRM_MISMATCH");
  }

  const reset = await resetVaultAndPlanningData({ keepAudit: input.keepAudit });
  const status = await getVaultStatus();
  invalidatePlanningStartupMigrationCache();

  if (input.keepAudit) {
    await appendOpsAuditEvent({
      eventType: "VAULT_RESET_SUCCESS",
      meta: {
        keepAudit: input.keepAudit,
        removedCount: reset.removed.length,
      },
    }).catch(() => undefined);
  }

  return {
    reset,
    status,
  };
}

export async function recordOpsSecurityResetError(input: {
  code: string;
  status: number;
}): Promise<void> {
  await appendOpsAuditEvent({
    eventType: "VAULT_RESET_ERROR",
    meta: {
      code: input.code,
      status: input.status,
    },
  }).catch(() => undefined);
}
