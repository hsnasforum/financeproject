import { append as appendAuditLog } from "../../audit/auditLogStore";
import { consumeVaultCsrfOrThrow, ensureVaultCsrfCookie } from "../../planning/security/vaultCsrf";
import { appendOpsMetricEvent } from "../metricsLog";
import { appendOpsAuditEvent } from "../securityAuditLog";
import { toBackupExportClientError, type BackupClientError } from "./clientErrors";
import { buildPlanningDataVaultZip, encryptPlanningDataVaultArchive } from "./planningDataVault";

export type OpsBackupExportMode = "full" | "delta";

export type OpsBackupExportPayload = {
  encryptedBytes: Buffer;
  fileName: string;
  mode: OpsBackupExportMode;
  gzipRequested: boolean;
  rawSizeBytes: number;
  encryptedSizeBytes: number;
};

function appendBackupExportAudit(result: "SUCCESS" | "ERROR", detail: Record<string, unknown>): void {
  try {
    appendAuditLog({
      event: "OPS_BACKUP_EXPORT",
      route: "/api/ops/backup/export",
      summary: `OPS_BACKUP_EXPORT ${result}`,
      details: {
        result,
        ...detail,
      },
    });
  } catch (error) {
    console.error("[audit] failed to append backup export log", error);
  }
}

export function assertOpsBackupExportVaultCsrf(request: Request, csrfToken: string): void {
  consumeVaultCsrfOrThrow(request, csrfToken);
}

export function ensureOpsBackupExportVaultCsrfCookie<T extends Response>(request: Request, response: T): T {
  return ensureVaultCsrfCookie(request, response);
}

export async function exportOpsBackupArchive(input: {
  passphrase: string;
  mode: OpsBackupExportMode;
  gzipRequested: boolean;
  startedAt: number;
}): Promise<OpsBackupExportPayload> {
  const exported = await buildPlanningDataVaultZip({ mode: input.mode });
  const encryptedBytes = await encryptPlanningDataVaultArchive(exported.bytes, input.passphrase);
  const stamp = exported.fileName.replace(/\.zip$/i, "");
  const fileName = `${stamp}.enc.json`;

  appendBackupExportAudit("SUCCESS", {
    fileName,
    mode: input.mode,
    gzipRequested: input.gzipRequested,
    rawSizeBytes: exported.bytes.length,
    encryptedSizeBytes: encryptedBytes.length,
    counts: exported.manifest.counts,
  });
  await appendOpsAuditEvent({
    eventType: "OPS_BACKUP_EXPORT_SUCCESS",
    meta: {
      fileName,
      mode: input.mode,
      gzipRequested: input.gzipRequested,
      rawSizeBytes: exported.bytes.length,
      encryptedSizeBytes: encryptedBytes.length,
    },
  }).catch(() => undefined);
  await appendOpsMetricEvent({
    type: "BACKUP_EXPORT",
    meta: {
      status: "SUCCESS",
      mode: input.mode,
      gzip: input.gzipRequested,
      durationMs: Math.max(0, Date.now() - input.startedAt),
      sizeBytes: encryptedBytes.length,
    },
  }).catch(() => undefined);

  return {
    encryptedBytes,
    fileName,
    mode: input.mode,
    gzipRequested: input.gzipRequested,
    rawSizeBytes: exported.bytes.length,
    encryptedSizeBytes: encryptedBytes.length,
  };
}

export function toOpsBackupExportClientError(error: unknown): BackupClientError {
  return toBackupExportClientError(error);
}

export async function recordOpsBackupExportError(input: {
  code: string;
  message: string;
  status: number;
  startedAt: number;
}): Promise<void> {
  appendBackupExportAudit("ERROR", {
    message: input.message,
    code: input.code,
  });
  await appendOpsAuditEvent({
    eventType: "OPS_BACKUP_EXPORT_ERROR",
    meta: {
      code: input.code,
      status: input.status,
    },
  }).catch(() => undefined);
  await appendOpsMetricEvent({
    type: "BACKUP_EXPORT",
    meta: {
      status: "FAILED",
      durationMs: Math.max(0, Date.now() - input.startedAt),
      code: input.code,
    },
  }).catch(() => undefined);
}
