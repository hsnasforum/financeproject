import { NextResponse } from "next/server";
import { assertLocalHost, assertSameOrigin, toGuardErrorResponse } from "../../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../../lib/dev/onlyDev";
import {
  assertOpsBackupExportVaultCsrf,
  ensureOpsBackupExportVaultCsrfCookie,
  finalizeOpsBackupExport,
  toOpsBackupExportClientError,
} from "../../../../../../lib/ops/backup/backupExportRouteService";
import { readBoundedBackupJson, toBackupJsonRequestError } from "../../../../../../lib/ops/backup/backupJsonRequest";
import { opsErrorResponse, toOpsContractError } from "../../../../../../lib/ops/errorContract";
import { planningUserMeta, withPlanningRouteUser } from "../../../../../../lib/planning/api/routeAuth";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  try {
    assertLocalHost(request);
    assertSameOrigin(request);
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    return ensureOpsBackupExportVaultCsrfCookie(request, opsErrorResponse({
      code: guard?.code ?? "INTERNAL",
      message: guard?.message ?? "요청 검증 중 오류가 발생했습니다.",
      status: guard?.status ?? 500,
    }));
  }

  return await withPlanningRouteUser(request, async (currentUser) => {
    try {
      const body = await readBoundedBackupJson(request) as { csrf?: unknown; receipt?: unknown } | null;
      assertOpsBackupExportVaultCsrf(request, asString(body?.csrf));
      const finalized = await finalizeOpsBackupExport({
        receipt: asString(body?.receipt),
        scope: "ops",
      });
      return ensureOpsBackupExportVaultCsrfCookie(request, NextResponse.json({
        ok: true,
        data: { status: finalized.status },
        meta: planningUserMeta(currentUser),
      }));
    } catch (error) {
      const guard = toGuardErrorResponse(error);
      if (guard) {
        return ensureOpsBackupExportVaultCsrfCookie(request, opsErrorResponse({
          code: guard.code,
          message: guard.message,
          status: guard.status,
        }));
      }
      const jsonError = toBackupJsonRequestError(error);
      if (jsonError) {
        return ensureOpsBackupExportVaultCsrfCookie(request, opsErrorResponse({
          code: "VALIDATION",
          message: jsonError.message,
          status: jsonError.status,
        }));
      }
      const clientError = toOpsBackupExportClientError(error);
      const contractError = toOpsContractError(clientError);
      return ensureOpsBackupExportVaultCsrfCookie(
        request,
        NextResponse.json(contractError.body, { status: contractError.status }),
      );
    }
  }, process.env, (response) => ensureOpsBackupExportVaultCsrfCookie(request, response));
}
