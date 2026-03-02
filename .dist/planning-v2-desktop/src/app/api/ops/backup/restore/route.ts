import { NextResponse } from "next/server";
import { append as appendAuditLog } from "../../../../../lib/audit/auditLogStore";
import { assertLocalHost, assertSameOrigin, toGuardErrorResponse } from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { loadOpsPolicy } from "../../../../../lib/ops/opsPolicy";
import { opsErrorResponse, toOpsContractError } from "../../../../../lib/ops/errorContract";
import { appendOpsAuditEvent } from "../../../../../lib/ops/securityAuditLog";
import { appendOpsMetricEvent } from "../../../../../lib/ops/metricsLog";
import {
  decryptPlanningDataVaultArchive,
  restorePlanningDataVaultZip,
} from "../../../../../lib/ops/backup/planningDataVault";
import { readUploadBufferViaTemp } from "../../../../../lib/ops/backup/uploadTemp";
import { redactText } from "../../../../../lib/planning/privacy/redact";
import { consumeVaultCsrfOrThrow, ensureVaultCsrfCookie } from "../../../../../lib/planning/security/vaultCsrf";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function appendBackupAudit(result: "SUCCESS" | "ERROR", detail: Record<string, unknown>): void {
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

function toClientError(error: unknown): { status: number; code: string; message: string } {
  const message = redactText(error instanceof Error ? error.message : "restore failed");
  if (message.startsWith("VAULT_PASSPHRASE_REQUIRED")) {
    return { status: 400, code: "VALIDATION", message: "복구 암호를 입력해 주세요." };
  }
  if (message.startsWith("VAULT_PASSPHRASE_INVALID")) {
    return { status: 401, code: "VALIDATION", message: "암호가 올바르지 않습니다." };
  }
  if (
    message.startsWith("INVALID_ZIP")
    || message.startsWith("MANIFEST_")
    || message.startsWith("ZIP_")
    || message.startsWith("ENCRYPTED_PACKAGE_")
  ) {
    return { status: 400, code: "BACKUP_INVALID", message };
  }
  return { status: 500, code: "RESTORE_FAILED", message };
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const startedAt = Date.now();
  const policy = loadOpsPolicy();
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    const response = opsErrorResponse({
      code: "VALIDATION",
      message: "multipart/form-data 형식이 필요합니다.",
      status: 400,
    });
    ensureVaultCsrfCookie(request, response);
    return response;
  }

  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    consumeVaultCsrfOrThrow(request, asString(formData.get("csrf")));
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      const response = opsErrorResponse({
        code: "INTERNAL",
        message: "요청 검증 중 오류가 발생했습니다.",
        status: 500,
      });
      ensureVaultCsrfCookie(request, response);
      return response;
    }
    const response = opsErrorResponse({
      code: guard.code,
      message: guard.message,
      status: guard.status,
    });
    ensureVaultCsrfCookie(request, response);
    return response;
  }

  const fileValue = formData.get("file");
  if (!(fileValue instanceof File)) {
    const response = opsErrorResponse({
      code: "VALIDATION",
      message: "암호화 백업 파일이 필요합니다.",
      status: 400,
    });
    ensureVaultCsrfCookie(request, response);
    return response;
  }
  if (fileValue.size < 1) {
    const response = opsErrorResponse({
      code: "VALIDATION",
      message: "빈 파일은 복원할 수 없습니다.",
      status: 400,
    });
    ensureVaultCsrfCookie(request, response);
    return response;
  }
  if (fileValue.size > policy.backup.maxUploadBytes) {
    const response = opsErrorResponse({
      code: "VALIDATION",
      message: `업로드 크기가 제한(${policy.backup.maxUploadBytes} bytes)을 초과했습니다.`,
      status: 413,
    });
    ensureVaultCsrfCookie(request, response);
    return response;
  }

  const modeRaw = asString(formData.get("mode")).toLowerCase();
  const mode = modeRaw === "replace" ? "replace" : "merge";
  const passphrase = asString(formData.get("passphrase"));

  try {
    const encryptedBytes = await readUploadBufferViaTemp(fileValue, "planning-backup-restore");
    const zipBytes = await decryptPlanningDataVaultArchive(encryptedBytes, passphrase);
    const restored = await restorePlanningDataVaultZip(zipBytes, {
      mode,
      maxEntries: policy.backup.maxEntries,
      maxBytes: policy.backup.maxUploadBytes,
    });
    appendBackupAudit("SUCCESS", {
      fileName: fileValue.name,
      fileSize: fileValue.size,
      mode,
      imported: restored.imported,
      issues: restored.issues.length,
      warnings: restored.warnings.length,
    });
    await appendOpsAuditEvent({
      eventType: "OPS_BACKUP_RESTORE_SUCCESS",
      meta: {
        fileName: fileValue.name,
        fileSize: fileValue.size,
        mode,
        issues: restored.issues.length,
        warnings: restored.warnings.length,
      },
    }).catch(() => undefined);
    await appendOpsMetricEvent({
      type: "BACKUP_RESTORE",
      meta: {
        status: "SUCCESS",
        mode,
        durationMs: Math.max(0, Date.now() - startedAt),
        sizeBytes: fileValue.size,
        issues: restored.issues.length,
        warnings: restored.warnings.length,
      },
    }).catch(() => undefined);
    const response = NextResponse.json({
      ok: true,
      data: restored,
      message: restored.issues.length > 0
        ? "복원이 완료되었지만 일부 항목에서 오류가 발생했습니다."
        : "복원이 완료되었습니다.",
    });
    ensureVaultCsrfCookie(request, response);
    return response;
  } catch (error) {
    const clientError = toClientError(error);
    const contractError = toOpsContractError({
      code: clientError.code,
      message: clientError.message,
      status: clientError.status,
    });
    appendBackupAudit("ERROR", {
      fileName: fileValue.name,
      fileSize: fileValue.size,
      mode,
      code: contractError.body.error.code,
      message: contractError.body.error.message,
    });
    await appendOpsAuditEvent({
      eventType: "OPS_BACKUP_RESTORE_ERROR",
      meta: {
        fileName: fileValue.name,
        fileSize: fileValue.size,
        mode,
        code: contractError.body.error.code,
        status: contractError.status,
      },
    }).catch(() => undefined);
    await appendOpsMetricEvent({
      type: "BACKUP_RESTORE",
      meta: {
        status: "FAILED",
        mode,
        durationMs: Math.max(0, Date.now() - startedAt),
        sizeBytes: fileValue.size,
        code: contractError.body.error.code,
      },
    }).catch(() => undefined);
    const response = NextResponse.json(contractError.body, { status: contractError.status });
    ensureVaultCsrfCookie(request, response);
    return response;
  }
}
