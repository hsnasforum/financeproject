import { NextResponse } from "next/server";
import { assertLocalHost, assertSameOrigin, toGuardErrorResponse } from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import {
  assertOpsBackupRestoreVaultCsrf,
  ensureOpsBackupRestoreVaultCsrfCookie,
  recordOpsBackupRestoreError,
  restoreOpsBackupArchive,
  toOpsBackupRestoreClientError,
  validateOpsBackupRestoreFile,
  type OpsBackupRestoreMode,
} from "../../../../../lib/ops/backup/backupRestoreRouteService";
import { opsErrorResponse, toOpsContractError } from "../../../../../lib/ops/errorContract";
import {
  planningUserMeta,
  withPlanningRouteUser,
} from "../../../../../lib/planning/api/routeAuth";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const startedAt = Date.now();
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    const response = opsErrorResponse({
      code: "VALIDATION",
      message: "multipart/form-data 형식이 필요합니다.",
      status: 400,
    });
    ensureOpsBackupRestoreVaultCsrfCookie(request, response);
    return response;
  }

  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertOpsBackupRestoreVaultCsrf(request, asString(formData.get("csrf")));
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      const response = opsErrorResponse({
        code: "INTERNAL",
        message: "요청 검증 중 오류가 발생했습니다.",
        status: 500,
      });
      ensureOpsBackupRestoreVaultCsrfCookie(request, response);
      return response;
    }
    const response = opsErrorResponse({
      code: guard.code,
      message: guard.message,
      status: guard.status,
    });
    ensureOpsBackupRestoreVaultCsrfCookie(request, response);
    return response;
  }
  return await withPlanningRouteUser(request, async (currentUser) => {
    const fileResult = validateOpsBackupRestoreFile(formData.get("file"));
    if (!fileResult.ok) {
      const response = opsErrorResponse({
        code: fileResult.error.code,
        message: fileResult.error.message,
        status: fileResult.error.status,
      });
      ensureOpsBackupRestoreVaultCsrfCookie(request, response);
      return response;
    }

    const modeRaw = asString(formData.get("mode")).toLowerCase();
    const mode: OpsBackupRestoreMode = modeRaw === "replace" ? "replace" : "merge";
    const passphrase = asString(formData.get("passphrase"));
    const previewToken = asString(formData.get("previewToken"));

    try {
      const result = await restoreOpsBackupArchive({
        request,
        file: fileResult.file,
        mode,
        passphrase,
        previewToken,
        startedAt,
      });
      if (!result.ok) {
        const response = opsErrorResponse({
          code: result.error.code,
          message: result.error.message,
          status: result.error.status,
          fixHref: "/ops/backup",
          details: result.error.details,
        });
        ensureOpsBackupRestoreVaultCsrfCookie(request, response);
        return response;
      }
      const { restored } = result;
      const response = NextResponse.json({
        ok: true,
        data: restored,
        message: restored.issues.length > 0
          ? "복원이 완료되었지만 일부 항목에서 오류가 발생했습니다."
          : "복원이 완료되었습니다.",
        meta: planningUserMeta(currentUser),
      });
      ensureOpsBackupRestoreVaultCsrfCookie(request, response);
      return response;
    } catch (error) {
      const clientError = toOpsBackupRestoreClientError(error);
      const contractError = toOpsContractError({
        code: clientError.code,
        message: clientError.message,
        status: clientError.status,
      });
      await recordOpsBackupRestoreError({
        file: fileResult.file,
        mode,
        code: contractError.body.error.code,
        message: contractError.body.error.message,
        status: contractError.status,
        startedAt,
      });
      const response = NextResponse.json(contractError.body, { status: contractError.status });
      ensureOpsBackupRestoreVaultCsrfCookie(request, response);
      return response;
    }
  }, process.env, (response) => {
    ensureOpsBackupRestoreVaultCsrfCookie(request, response);
    return response;
  });
}
