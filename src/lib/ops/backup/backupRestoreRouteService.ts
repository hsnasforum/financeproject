import { append as appendAuditLog } from "../../audit/auditLogStore";
import { consumeVaultCsrfOrThrow, ensureVaultCsrfCookie } from "../../planning/security/vaultCsrf";
import { resolvePlanningUserId } from "../../planning/store/namespace";
import { appendOpsMetricEvent } from "../metricsLog";
import { loadOpsPolicy } from "../opsPolicy";
import { appendOpsAuditEvent } from "../securityAuditLog";
import {
  formatBackupUploadLimit,
  toBackupArchiveClientError,
  type BackupClientError,
} from "./clientErrors";
import {
  RESTORE_NOT_COMMITTED_MESSAGE,
  decryptPlanningDataVaultArchive,
  restorePlanningDataVaultZip,
  type PlanningDataVaultScope,
  type VaultRestoreSummary,
} from "./planningDataVault";
import { readBackupPreviewSessionFromRequest } from "./previewSession";
import { consumeBackupPreviewToken, type BackupPreviewTokenVerification } from "./previewToken";
import { readUploadBufferViaTemp } from "./uploadTemp";

export type OpsBackupRestoreMode = "merge" | "replace";

export type OpsBackupRestoreValidationError = {
  status: number;
  code: string;
  message: string;
};

export type OpsBackupRestorePreviewRequired = {
  code: "PREVIEW_REQUIRED";
  details?: { retryPreviewToken: true };
  message: string;
  status: 428;
};

export type OpsBackupRestoreNotCommitted = {
  code: "RESTORE_NOT_COMMITTED";
  details: {
    issues: VaultRestoreSummary["issues"];
    warnings: VaultRestoreSummary["warnings"];
  };
  message: string;
  status: 409;
};

export type OpsBackupRestoreResult =
  | {
    ok: true;
    restored: VaultRestoreSummary;
  }
  | {
    ok: false;
    error: OpsBackupRestorePreviewRequired | OpsBackupRestoreNotCommitted;
  };

function appendBackupRestoreAudit(result: "SUCCESS" | "ERROR", detail: Record<string, unknown>): void {
  try {
    appendAuditLog({
      event: "OPS_BACKUP_RESTORE",
      route: "/api/ops/backup/restore",
      summary: `OPS_BACKUP_RESTORE ${result}`,
      details: {
        result,
        ...detail,
      },
    });
  } catch (error) {
    console.error("[audit] failed to append backup restore log", error);
  }
}

function previewRequiredError(reason: Exclude<BackupPreviewTokenVerification, { ok: true }>["reason"]): OpsBackupRestorePreviewRequired {
  const retryPreviewToken = reason === "archive-mismatch" || reason === "passphrase-mismatch";
  const message = reason === "expired"
    ? "미리보기 확인이 만료되었습니다. 다시 미리보기 확인 후 복원해 주세요."
    : retryPreviewToken
      ? "미리보기 확인과 현재 파일 또는 암호가 일치하지 않습니다. 선택한 파일과 암호를 확인한 뒤 다시 복원해 주세요."
      : reason === "session-mismatch"
        ? "현재 브라우저의 미리보기 확인 정보가 일치하지 않습니다. 다시 미리보기 확인 후 복원해 주세요."
        : "복원 전 미리보기 확인을 먼저 완료해 주세요.";

  return {
    code: "PREVIEW_REQUIRED",
    message,
    status: 428,
    ...(retryPreviewToken ? { details: { retryPreviewToken: true } } : {}),
  };
}

export function assertOpsBackupRestoreVaultCsrf(request: Request, csrfToken: string): void {
  consumeVaultCsrfOrThrow(request, csrfToken);
}

export function ensureOpsBackupRestoreVaultCsrfCookie<T extends Response>(request: Request, response: T): T {
  return ensureVaultCsrfCookie(request, response);
}

export function validateOpsBackupRestoreFile(fileValue: FormDataEntryValue | null): {
  ok: true;
  file: File;
} | {
  ok: false;
  error: OpsBackupRestoreValidationError;
} {
  if (!(fileValue instanceof File)) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: "암호화 백업 파일이 필요합니다.",
        status: 400,
      },
    };
  }
  if (fileValue.size < 1) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: "빈 파일은 복원할 수 없습니다.",
        status: 400,
      },
    };
  }

  const policy = loadOpsPolicy();
  if (fileValue.size > policy.backup.maxUploadBytes) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: `백업 파일이 너무 큽니다. 최대 ${formatBackupUploadLimit(policy.backup.maxUploadBytes)}까지 업로드할 수 있습니다.`,
        status: 413,
      },
    };
  }

  return { ok: true, file: fileValue };
}

export async function restoreOpsBackupArchive(input: {
  request: Request;
  file: File;
  mode: OpsBackupRestoreMode;
  passphrase: string;
  previewToken: string;
  startedAt: number;
  scope: PlanningDataVaultScope;
}): Promise<OpsBackupRestoreResult> {
  const policy = loadOpsPolicy();
  const encryptedBytes = await readUploadBufferViaTemp(input.file, "planning-backup-restore");
  const previewTokenResult = await consumeBackupPreviewToken(input.previewToken, {
    archiveBytes: encryptedBytes,
    passphrase: input.passphrase,
    sessionToken: readBackupPreviewSessionFromRequest(input.request),
  });

  if (!previewTokenResult.ok) {
    const previewError = previewRequiredError(previewTokenResult.reason);
    appendBackupRestoreAudit("ERROR", {
      fileName: input.file.name,
      fileSize: input.file.size,
      mode: input.mode,
      code: previewError.code,
      reason: previewTokenResult.reason,
    });
    await appendOpsAuditEvent({
      eventType: "OPS_BACKUP_RESTORE_ERROR",
      meta: {
        fileName: input.file.name,
        fileSize: input.file.size,
        mode: input.mode,
        code: previewError.code,
        reason: previewTokenResult.reason,
        status: previewError.status,
      },
    }).catch(() => undefined);
    await appendOpsMetricEvent({
      type: "BACKUP_RESTORE",
      meta: {
        status: "FAILED",
        mode: input.mode,
        durationMs: Math.max(0, Date.now() - input.startedAt),
        sizeBytes: input.file.size,
        code: previewError.code,
        reason: previewTokenResult.reason,
      },
    }).catch(() => undefined);

    return {
      ok: false,
      error: previewError,
    };
  }

  const zipBytes = await decryptPlanningDataVaultArchive(encryptedBytes, input.passphrase);
  const restored = await restorePlanningDataVaultZip(zipBytes, {
    mode: input.mode,
    maxEntries: policy.backup.maxEntries,
    maxBytes: policy.backup.maxUploadBytes,
    scope: input.scope,
    userId: resolvePlanningUserId(),
  });

  if (input.mode === "replace" && !restored.committed) {
    const error: OpsBackupRestoreNotCommitted = {
      code: "RESTORE_NOT_COMMITTED",
      message: RESTORE_NOT_COMMITTED_MESSAGE,
      status: 409,
      details: {
        issues: restored.issues,
        warnings: restored.warnings,
      },
    };
    appendBackupRestoreAudit("ERROR", {
      fileName: input.file.name,
      fileSize: input.file.size,
      mode: input.mode,
      code: error.code,
      issues: restored.issues.length,
      warnings: restored.warnings.length,
    });
    await appendOpsAuditEvent({
      eventType: "OPS_BACKUP_RESTORE_ERROR",
      meta: {
        fileName: input.file.name,
        fileSize: input.file.size,
        mode: input.mode,
        code: error.code,
        status: error.status,
        issues: restored.issues.length,
        warnings: restored.warnings.length,
      },
    }).catch(() => undefined);
    await appendOpsMetricEvent({
      type: "BACKUP_RESTORE",
      meta: {
        status: "FAILED",
        mode: input.mode,
        durationMs: Math.max(0, Date.now() - input.startedAt),
        sizeBytes: input.file.size,
        code: error.code,
        issues: restored.issues.length,
        warnings: restored.warnings.length,
      },
    }).catch(() => undefined);

    return {
      ok: false,
      error,
    };
  }

  appendBackupRestoreAudit("SUCCESS", {
    fileName: input.file.name,
    fileSize: input.file.size,
    mode: input.mode,
    imported: restored.imported,
    issues: restored.issues.length,
    warnings: restored.warnings.length,
  });
  await appendOpsAuditEvent({
    eventType: "OPS_BACKUP_RESTORE_SUCCESS",
    meta: {
      fileName: input.file.name,
      fileSize: input.file.size,
      mode: input.mode,
      issues: restored.issues.length,
      warnings: restored.warnings.length,
    },
  }).catch(() => undefined);
  await appendOpsMetricEvent({
    type: "BACKUP_RESTORE",
    meta: {
      status: "SUCCESS",
      mode: input.mode,
      durationMs: Math.max(0, Date.now() - input.startedAt),
      sizeBytes: input.file.size,
      issues: restored.issues.length,
      warnings: restored.warnings.length,
    },
  }).catch(() => undefined);

  return {
    ok: true,
    restored,
  };
}

export function toOpsBackupRestoreClientError(error: unknown): BackupClientError {
  return toBackupArchiveClientError(error, "restore");
}

export async function recordOpsBackupRestoreError(input: {
  file: File;
  mode: OpsBackupRestoreMode;
  code: string;
  message: string;
  status: number;
  startedAt: number;
}): Promise<void> {
  appendBackupRestoreAudit("ERROR", {
    fileName: input.file.name,
    fileSize: input.file.size,
    mode: input.mode,
    code: input.code,
    message: input.message,
  });
  await appendOpsAuditEvent({
    eventType: "OPS_BACKUP_RESTORE_ERROR",
    meta: {
      fileName: input.file.name,
      fileSize: input.file.size,
      mode: input.mode,
      code: input.code,
      status: input.status,
    },
  }).catch(() => undefined);
  await appendOpsMetricEvent({
    type: "BACKUP_RESTORE",
    meta: {
      status: "FAILED",
      mode: input.mode,
      durationMs: Math.max(0, Date.now() - input.startedAt),
      sizeBytes: input.file.size,
      code: input.code,
    },
  }).catch(() => undefined);
}
