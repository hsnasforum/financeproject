import { NextResponse } from "next/server";
import {
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import {
  assertOpsBackupRestoreVaultCsrf,
  ensureOpsBackupRestoreVaultCsrfCookie,
  recordOpsBackupRestoreError,
  restoreOpsBackupArchive,
  toOpsBackupRestoreClientError,
  validateOpsBackupRestoreFile,
  type OpsBackupRestoreMode,
} from "@/lib/ops/backup/backupRestoreRouteService";
import { parseBackupUploadFormData } from "@/lib/ops/backup/backupUploadRequest";
import { opsErrorResponse, toOpsContractError } from "@/lib/ops/errorContract";
import {
  planningUserMeta,
  withPlanningRouteUser,
} from "@/lib/planning/api/routeAuth";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    const response = opsErrorResponse({
      code: guard?.code ?? "INTERNAL",
      message: guard?.message ?? "요청 검증 중 오류가 발생했습니다.",
      status: guard?.status ?? 500,
    });
    return ensureOpsBackupRestoreVaultCsrfCookie(request, response);
  }

  return await withPlanningRouteUser(request, async (currentUser) => {
    const formResult = await parseBackupUploadFormData(request);
    if (!formResult.ok) {
      const response = opsErrorResponse(formResult.error);
      return ensureOpsBackupRestoreVaultCsrfCookie(request, response);
    }
    const { formData } = formResult;
    try {
      assertOpsBackupRestoreVaultCsrf(request, asString(formData.get("csrf")));
    } catch (error) {
      const guard = toGuardErrorResponse(error);
      const response = opsErrorResponse({
        code: guard?.code ?? "INTERNAL",
        message: guard?.message ?? "요청 검증 중 오류가 발생했습니다.",
        status: guard?.status ?? 500,
      });
      return ensureOpsBackupRestoreVaultCsrfCookie(request, response);
    }

    const fileResult = validateOpsBackupRestoreFile(formData.get("file"));
    if (!fileResult.ok) {
      const response = opsErrorResponse(fileResult.error);
      return ensureOpsBackupRestoreVaultCsrfCookie(request, response);
    }

    const modeRaw = asString(formData.get("mode")).toLowerCase();
    const mode: OpsBackupRestoreMode = modeRaw === "replace" ? "replace" : "merge";
    try {
      const result = await restoreOpsBackupArchive({
        request,
        file: fileResult.file,
        mode,
        passphrase: asString(formData.get("passphrase")),
        previewToken: asString(formData.get("previewToken")),
        startedAt,
        scope: "user",
      });
      if (!result.ok) {
        const response = opsErrorResponse({
          code: result.error.code,
          message: result.error.message,
          status: result.error.status,
          fixHref: "/settings/backup",
          details: result.error.details,
        });
        return ensureOpsBackupRestoreVaultCsrfCookie(request, response);
      }

      const response = NextResponse.json({
        ok: true,
        data: result.restored,
        message: result.restored.issues.length > 0
          ? "복원이 완료되었지만 일부 항목에서 오류가 발생했습니다."
          : "복원이 완료되었습니다.",
        meta: planningUserMeta(currentUser),
      });
      return ensureOpsBackupRestoreVaultCsrfCookie(request, response);
    } catch (error) {
      const clientError = toOpsBackupRestoreClientError(error);
      const contractError = toOpsContractError(clientError);
      await recordOpsBackupRestoreError({
        file: fileResult.file,
        mode,
        code: contractError.body.error.code,
        message: contractError.body.error.message,
        status: contractError.status,
        startedAt,
      });
      const response = NextResponse.json(contractError.body, { status: contractError.status });
      return ensureOpsBackupRestoreVaultCsrfCookie(request, response);
    }
  }, process.env, (response) => ensureOpsBackupRestoreVaultCsrfCookie(request, response));
}
