import { appendOpsAuditEvent } from "../../../ops/securityAuditLog";
import { consumeVaultCsrfOrThrow } from "../../security/vaultCsrf";
import {
  updateVaultAutoLockMinutes,
  type VaultStatus,
} from "../../security/vaultState";

export type OpsSecurityAutoLockClientError = {
  status: number;
  code: string;
  message: string;
};

export function assertOpsSecurityVaultCsrf(request: Request, csrfToken: string): void {
  consumeVaultCsrfOrThrow(request, csrfToken);
}

export function toOpsSecurityAutoLockClientError(error: unknown): OpsSecurityAutoLockClientError {
  const message = error instanceof Error ? error.message : "vault auto lock update failed";
  if (message.startsWith("VAULT_NOT_CONFIGURED")) {
    return { status: 400, code: "VALIDATION", message: "먼저 vault 암호를 설정해 주세요." };
  }
  return { status: 500, code: "AUTO_LOCK_UPDATE_FAILED", message: "자동 잠금 시간을 저장하지 못했습니다." };
}

export async function updateOpsSecurityAutoLockMinutes(minutes: number): Promise<VaultStatus> {
  const status = await updateVaultAutoLockMinutes(minutes);
  await appendOpsAuditEvent({
    eventType: "VAULT_AUTOLOCK_UPDATE_SUCCESS",
    meta: {
      autoLockMinutes: status.autoLockMinutes,
    },
  }).catch(() => undefined);
  return status;
}

export async function recordOpsSecurityAutoLockError(input: {
  code: string;
  status: number;
}): Promise<void> {
  await appendOpsAuditEvent({
    eventType: "VAULT_AUTOLOCK_UPDATE_ERROR",
    meta: {
      code: input.code,
      status: input.status,
    },
  }).catch(() => undefined);
}
