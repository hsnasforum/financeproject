import { NextResponse } from "next/server";
import { append as appendAuditLog } from "../../../../../lib/audit/auditLogStore";
import { assertLocalHost, assertSameOrigin, toGuardErrorResponse } from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { opsErrorResponse, toOpsContractError } from "../../../../../lib/ops/errorContract";
import { appendOpsAuditEvent } from "../../../../../lib/ops/securityAuditLog";
import { appendOpsMetricEvent } from "../../../../../lib/ops/metricsLog";
import { formatBackupUploadLimit, toBackupArchiveClientError } from "../../../../../lib/ops/backup/clientErrors";
import {
  decryptPlanningDataVaultArchive,
  previewPlanningDataVaultZip,
} from "../../../../../lib/ops/backup/planningDataVault";
import {
  getOrCreateBackupPreviewSessionToken,
  setBackupPreviewSessionCookie,
} from "../../../../../lib/ops/backup/previewSession";
import { createBackupPreviewToken } from "../../../../../lib/ops/backup/previewToken";
import { readUploadBufferViaTemp } from "../../../../../lib/ops/backup/uploadTemp";
import { loadOpsPolicy } from "../../../../../lib/ops/opsPolicy";
import { isPlanningRouteUser, requirePlanningRouteUser } from "../../../../../lib/planning/api/routeAuth";
import {
  consumeVaultCsrfOrThrow,
  ensureVaultCsrfCookie,
} from "../../../../../lib/planning/security/vaultCsrf";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function appendBackupAudit(result: "SUCCESS" | "ERROR", detail: Record<string, unknown>): void {
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
  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) {
    ensureVaultCsrfCookie(request, currentUser);
    return currentUser;
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
      message: "빈 파일은 미리보기할 수 없습니다.",
      status: 400,
    });
    ensureVaultCsrfCookie(request, response);
    return response;
  }
  if (fileValue.size > policy.backup.maxUploadBytes) {
    const response = opsErrorResponse({
      code: "VALIDATION",
      message: `백업 파일이 너무 큽니다. 최대 ${formatBackupUploadLimit(policy.backup.maxUploadBytes)}까지 업로드할 수 있습니다.`,
      status: 413,
    });
    ensureVaultCsrfCookie(request, response);
    return response;
  }

  const passphrase = asString(formData.get("passphrase"));

  try {
    const encryptedBytes = await readUploadBufferViaTemp(fileValue, "planning-backup-preview");
    const zipBytes = await decryptPlanningDataVaultArchive(encryptedBytes, passphrase);
    const summary = await previewPlanningDataVaultZip(zipBytes, {
      maxEntries: policy.backup.maxEntries,
      maxBytes: policy.backup.maxUploadBytes,
      maxPreviewIds: policy.backup.maxPreviewIds,
    });
    appendBackupAudit("SUCCESS", {
      fileName: fileValue.name,
      fileSize: fileValue.size,
      counts: summary.actual,
      warningCount: summary.warnings.length,
    });
    await appendOpsAuditEvent({
      eventType: "OPS_BACKUP_PREVIEW_SUCCESS",
      meta: {
        fileName: fileValue.name,
        fileSize: fileValue.size,
        warningCount: summary.warnings.length,
      },
    }).catch(() => undefined);
    await appendOpsMetricEvent({
      type: "BACKUP_PREVIEW",
      meta: {
        status: "SUCCESS",
        durationMs: Math.max(0, Date.now() - startedAt),
        sizeBytes: fileValue.size,
        warningCount: summary.warnings.length,
      },
    }).catch(() => undefined);
    const previewSessionToken = getOrCreateBackupPreviewSessionToken(request);
    const response = NextResponse.json({
      ok: true,
      data: summary,
      previewToken: await createBackupPreviewToken({
        archiveBytes: encryptedBytes,
        passphrase,
        sessionToken: previewSessionToken,
      }),
    });
    ensureVaultCsrfCookie(request, response);
    setBackupPreviewSessionCookie(response, previewSessionToken);
    return response;
  } catch (error) {
    const clientError = toBackupArchiveClientError(error, "preview");
    const contractError = toOpsContractError({
      code: clientError.code,
      message: clientError.message,
      status: clientError.status,
    });
    appendBackupAudit("ERROR", {
      fileName: fileValue.name,
      fileSize: fileValue.size,
      message: contractError.body.error.message,
      code: contractError.body.error.code,
    });
    await appendOpsAuditEvent({
      eventType: "OPS_BACKUP_PREVIEW_ERROR",
      meta: {
        fileName: fileValue.name,
        fileSize: fileValue.size,
        code: contractError.body.error.code,
        status: contractError.status,
      },
    }).catch(() => undefined);
    await appendOpsMetricEvent({
      type: "BACKUP_PREVIEW",
      meta: {
        status: "FAILED",
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
