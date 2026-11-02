import { NextResponse } from "next/server";
import { assertLocalHost, assertSameOrigin, toGuardErrorResponse } from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import {
  assertOpsBackupPreviewVaultCsrf,
  ensureOpsBackupPreviewVaultCsrfCookie,
  previewOpsBackupArchive,
  recordOpsBackupPreviewError,
  setOpsBackupPreviewSessionCookie,
  toOpsBackupPreviewClientError,
  validateOpsBackupPreviewFile,
} from "../../../../../lib/ops/backup/backupPreviewRouteService";
import { parseBackupUploadFormData } from "../../../../../lib/ops/backup/backupUploadRequest";
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
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      const response = opsErrorResponse({
        code: "INTERNAL",
        message: "요청 검증 중 오류가 발생했습니다.",
        status: 500,
      });
      ensureOpsBackupPreviewVaultCsrfCookie(request, response);
      return response;
    }
    const response = opsErrorResponse({
      code: guard.code,
      message: guard.message,
      status: guard.status,
    });
    ensureOpsBackupPreviewVaultCsrfCookie(request, response);
    return response;
  }
  return await withPlanningRouteUser(request, async (currentUser) => {
    const formResult = await parseBackupUploadFormData(request);
    if (!formResult.ok) {
      const response = opsErrorResponse(formResult.error);
      ensureOpsBackupPreviewVaultCsrfCookie(request, response);
      return response;
    }
    const { formData } = formResult;
    try {
      assertOpsBackupPreviewVaultCsrf(request, asString(formData.get("csrf")));
    } catch (error) {
      const guard = toGuardErrorResponse(error);
      const response = opsErrorResponse({
        code: guard?.code ?? "INTERNAL",
        message: guard?.message ?? "요청 검증 중 오류가 발생했습니다.",
        status: guard?.status ?? 500,
      });
      ensureOpsBackupPreviewVaultCsrfCookie(request, response);
      return response;
    }

    const fileResult = validateOpsBackupPreviewFile(formData.get("file"));
    if (!fileResult.ok) {
      const response = opsErrorResponse({
        code: fileResult.error.code,
        message: fileResult.error.message,
        status: fileResult.error.status,
      });
      ensureOpsBackupPreviewVaultCsrfCookie(request, response);
      return response;
    }

    const passphrase = asString(formData.get("passphrase"));

    try {
      const preview = await previewOpsBackupArchive({
        request,
        file: fileResult.file,
        passphrase,
        startedAt,
        scope: "ops",
      });
      const response = NextResponse.json({
        ok: true,
        data: preview.summary,
        previewToken: preview.previewToken,
        meta: planningUserMeta(currentUser),
      });
      ensureOpsBackupPreviewVaultCsrfCookie(request, response);
      setOpsBackupPreviewSessionCookie(response, preview.previewSessionToken);
      return response;
    } catch (error) {
      const clientError = toOpsBackupPreviewClientError(error);
      const contractError = toOpsContractError({
        code: clientError.code,
        message: clientError.message,
        status: clientError.status,
      });
      await recordOpsBackupPreviewError({
        file: fileResult.file,
        message: contractError.body.error.message,
        code: contractError.body.error.code,
        status: contractError.status,
        startedAt,
      });
      const response = NextResponse.json(contractError.body, { status: contractError.status });
      ensureOpsBackupPreviewVaultCsrfCookie(request, response);
      return response;
    }
  }, process.env, (response) => {
    ensureOpsBackupPreviewVaultCsrfCookie(request, response);
    return response;
  });
}
