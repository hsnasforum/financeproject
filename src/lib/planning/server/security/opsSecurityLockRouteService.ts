import { appendOpsMetricEvent } from "../../../ops/metricsLog";
import { appendOpsAuditEvent } from "../../../ops/securityAuditLog";
import { invalidatePlanningStartupMigrationCache } from "../../migrations/manager";
import { consumeVaultCsrfOrThrow } from "../../security/vaultCsrf";
import {
  lockVault,
  unlockVault,
  type VaultStatus,
} from "../../security/vaultState";

export type OpsSecurityClientError = {
  status: number;
  code: string;
  message: string;
};

export function assertOpsSecurityVaultCsrf(request: Request, csrfToken: string): void {
  consumeVaultCsrfOrThrow(request, csrfToken);
}

export async function lockOpsSecurityVault(): Promise<VaultStatus> {
  const status = await lockVault();
  await appendOpsAuditEvent({
    eventType: "VAULT_LOCK_SUCCESS",
    meta: {
      unlocked: status.unlocked,
    },
  }).catch(() => undefined);
  return status;
}

export async function recordOpsSecurityLockError(input: {
  code: string;
  status: number;
}): Promise<void> {
  await appendOpsAuditEvent({
    eventType: "VAULT_LOCK_ERROR",
    meta: {
      code: input.code,
      status: input.status,
    },
  }).catch(() => undefined);
}

export function toOpsSecurityUnlockClientError(error: unknown): OpsSecurityClientError {
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

export async function unlockOpsSecurityVault(input: {
  passphrase: string;
  startedAt: number;
}): Promise<VaultStatus> {
  const status = await unlockVault(input.passphrase);
  invalidatePlanningStartupMigrationCache();
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
      durationMs: Math.max(0, Date.now() - input.startedAt),
    },
  }).catch(() => undefined);
  return status;
}

export async function recordOpsSecurityUnlockError(input: {
  code: string;
  status: number;
  startedAt: number;
}): Promise<void> {
  await appendOpsAuditEvent({
    eventType: "VAULT_UNLOCK_ERROR",
    meta: {
      code: input.code,
      status: input.status,
    },
  }).catch(() => undefined);
  await appendOpsMetricEvent({
    type: "VAULT_UNLOCK",
    meta: {
      status: "FAILED",
      durationMs: Math.max(0, Date.now() - input.startedAt),
      code: input.code,
    },
  }).catch(() => undefined);
}
