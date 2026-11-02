import { append as appendAuditLog } from "../../audit/auditLogStore";
import { consumeVaultCsrfOrThrow, ensureVaultCsrfCookie } from "../../planning/security/vaultCsrf";
import { resolvePlanningUserId } from "../../planning/store/namespace";
import { appendOpsMetricEvent } from "../metricsLog";
import { loadOpsPolicy } from "../opsPolicy";
import { appendOpsAuditEvent } from "../securityAuditLog";
import { toBackupExportClientError, type BackupClientError } from "./clientErrors";
import {
  createBackupExportReceipt,
  finalizeBackupExportReceipt,
  type BackupExportFinalizeResult,
} from "./backupExportReceipt";
import {
  buildPlanningDataVaultZip,
  encryptPlanningDataVaultArchive,
  type PlanningDataVaultScope,
} from "./planningDataVault";

export type OpsBackupExportMode = "full" | "delta";

export type OpsBackupExportPayload = {
  encryptedBytes: Buffer;
  fileName: string;
  mode: OpsBackupExportMode;
  gzipRequested: boolean;
  rawSizeBytes: number;
  encryptedSizeBytes: number;
  receipt: string;
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
  scope: PlanningDataVaultScope;
}): Promise<OpsBackupExportPayload> {
  const policy = loadOpsPolicy();
  const encryptedEnvelopeReserveBytes = Math.min(16 * 1024, Math.floor(policy.backup.maxUploadBytes / 4));
  const maxZipBytes = Math.max(
    1,
    Math.floor((policy.backup.maxUploadBytes - encryptedEnvelopeReserveBytes) * 3 / 4),
  );
  const exported = await buildPlanningDataVaultZip({
    mode: input.mode,
    scope: input.scope,
    userId: resolvePlanningUserId(),
    maxEntries: policy.backup.maxEntries,
    maxBytes: maxZipBytes,
  });
  const rawSizeBytes = exported.bytes.length;
  let encryptedBytes: Buffer | undefined;
  let completed = false;
  try {
    encryptedBytes = await encryptPlanningDataVaultArchive(exported.bytes, input.passphrase);
    if (encryptedBytes.length > policy.backup.maxUploadBytes) {
      throw new Error("BACKUP_EXPORT_LIMIT_EXCEEDED");
    }
    const receipt = await createBackupExportReceipt({
      checkpoint: exported.checkpoint,
      scope: input.scope,
      userId: resolvePlanningUserId(),
    });
    const stamp = exported.fileName.replace(/\.zip$/i, "");
    const fileName = `${stamp}.enc.json`;

    appendBackupExportAudit("SUCCESS", {
      fileName,
      mode: input.mode,
      gzipRequested: input.gzipRequested,
      rawSizeBytes,
      encryptedSizeBytes: encryptedBytes.length,
      counts: exported.manifest.counts,
      checkpointPending: true,
    });
    await appendOpsAuditEvent({
      eventType: "OPS_BACKUP_EXPORT_SUCCESS",
      meta: {
        fileName,
        mode: input.mode,
        gzipRequested: input.gzipRequested,
        rawSizeBytes,
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

    completed = true;
    return {
      encryptedBytes,
      fileName,
      mode: input.mode,
      gzipRequested: input.gzipRequested,
      rawSizeBytes,
      encryptedSizeBytes: encryptedBytes.length,
      receipt,
    };
  } finally {
    exported.bytes.fill(0);
    if (!completed) encryptedBytes?.fill(0);
  }
}

function finalizeFailureMessage(result: Exclude<BackupExportFinalizeResult, { ok: true }>): string {
  if (result.reason === "expired") return "BACKUP_EXPORT_RECEIPT_EXPIRED";
  if (result.reason === "missing") return "BACKUP_EXPORT_RECEIPT_MISSING";
  if (result.reason === "context-mismatch") return "BACKUP_EXPORT_RECEIPT_CONTEXT_MISMATCH";
  return "BACKUP_EXPORT_RECEIPT_INVALID";
}

export async function finalizeOpsBackupExport(input: {
  receipt: string;
  scope: PlanningDataVaultScope;
}): Promise<Extract<BackupExportFinalizeResult, { ok: true }>> {
  const result = await finalizeBackupExportReceipt({
    receipt: input.receipt,
    scope: input.scope,
    userId: resolvePlanningUserId(),
  });
  if (!result.ok) throw new Error(finalizeFailureMessage(result));
  await appendOpsAuditEvent({
    eventType: "OPS_BACKUP_EXPORT_FINALIZE_SUCCESS",
    meta: {
      scope: input.scope,
      status: result.status,
    },
  }).catch(() => undefined);
  return result;
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
