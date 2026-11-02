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
  decryptPlanningDataVaultArchive,
  previewPlanningDataVaultZip,
  type PlanningDataVaultScope,
  type VaultPreviewSummary,
} from "./planningDataVault";
import {
  getOrCreateBackupPreviewSessionToken,
  setBackupPreviewSessionCookie,
} from "./previewSession";
import { createBackupPreviewToken } from "./previewToken";
import { readUploadBufferViaTemp } from "./uploadTemp";

export type OpsBackupPreviewValidationError = {
  status: number;
  code: string;
  message: string;
};

export type OpsBackupPreviewPayload = {
  summary: VaultPreviewSummary;
  previewToken: string;
  previewSessionToken: string;
};

function appendBackupPreviewAudit(result: "SUCCESS" | "ERROR", detail: Record<string, unknown>): void {
  try {
    appendAuditLog({
      event: "OPS_BACKUP_PREVIEW",
      route: "/api/ops/backup/preview",
      summary: `OPS_BACKUP_PREVIEW ${result}`,
      details: {
        result,
        ...detail,
      },
    });
  } catch (error) {
    console.error("[audit] failed to append backup preview log", error);
  }
}

export function assertOpsBackupPreviewVaultCsrf(request: Request, csrfToken: string): void {
  consumeVaultCsrfOrThrow(request, csrfToken);
}

export function ensureOpsBackupPreviewVaultCsrfCookie<T extends Response>(request: Request, response: T): T {
  return ensureVaultCsrfCookie(request, response);
}

export function setOpsBackupPreviewSessionCookie<T extends Response>(
  response: T,
  previewSessionToken: string,
): T {
  setBackupPreviewSessionCookie(response, previewSessionToken);
  return response;
}

export function validateOpsBackupPreviewFile(fileValue: FormDataEntryValue | null): {
  ok: true;
  file: File;
} | {
  ok: false;
  error: OpsBackupPreviewValidationError;
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
        message: "빈 파일은 미리보기할 수 없습니다.",
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

export async function previewOpsBackupArchive(input: {
  request: Request;
  file: File;
  passphrase: string;
  startedAt: number;
  scope: PlanningDataVaultScope;
}): Promise<OpsBackupPreviewPayload> {
  const policy = loadOpsPolicy();
  const encryptedBytes = await readUploadBufferViaTemp(input.file, "planning-backup-preview");
  const zipBytes = await decryptPlanningDataVaultArchive(encryptedBytes, input.passphrase);
  const summary = await previewPlanningDataVaultZip(zipBytes, {
    maxEntries: policy.backup.maxEntries,
    maxBytes: policy.backup.maxUploadBytes,
    maxPreviewIds: policy.backup.maxPreviewIds,
    scope: input.scope,
    userId: resolvePlanningUserId(),
  });

  appendBackupPreviewAudit("SUCCESS", {
    fileName: input.file.name,
    fileSize: input.file.size,
    counts: summary.actual,
    warningCount: summary.warnings.length,
  });
  await appendOpsAuditEvent({
    eventType: "OPS_BACKUP_PREVIEW_SUCCESS",
    meta: {
      fileName: input.file.name,
      fileSize: input.file.size,
      warningCount: summary.warnings.length,
    },
  }).catch(() => undefined);
  await appendOpsMetricEvent({
    type: "BACKUP_PREVIEW",
    meta: {
      status: "SUCCESS",
      durationMs: Math.max(0, Date.now() - input.startedAt),
      sizeBytes: input.file.size,
      warningCount: summary.warnings.length,
    },
  }).catch(() => undefined);

  const previewSessionToken = getOrCreateBackupPreviewSessionToken(input.request);
  const previewToken = await createBackupPreviewToken({
    archiveBytes: encryptedBytes,
    passphrase: input.passphrase,
    sessionToken: previewSessionToken,
  });

  return {
    summary,
    previewToken,
    previewSessionToken,
  };
}

export function toOpsBackupPreviewClientError(error: unknown): BackupClientError {
  return toBackupArchiveClientError(error, "preview");
}

export async function recordOpsBackupPreviewError(input: {
  file: File;
  code: string;
  message: string;
  status: number;
  startedAt: number;
}): Promise<void> {
  appendBackupPreviewAudit("ERROR", {
    fileName: input.file.name,
    fileSize: input.file.size,
    message: input.message,
    code: input.code,
  });
  await appendOpsAuditEvent({
    eventType: "OPS_BACKUP_PREVIEW_ERROR",
    meta: {
      fileName: input.file.name,
      fileSize: input.file.size,
      code: input.code,
      status: input.status,
    },
  }).catch(() => undefined);
  await appendOpsMetricEvent({
    type: "BACKUP_PREVIEW",
    meta: {
      status: "FAILED",
      durationMs: Math.max(0, Date.now() - input.startedAt),
      sizeBytes: input.file.size,
      code: input.code,
    },
  }).catch(() => undefined);
}
