import { Readable } from "node:stream";
import { createGzip } from "node:zlib";
import { NextResponse } from "next/server";
import {
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import {
  assertOpsBackupExportVaultCsrf,
  ensureOpsBackupExportVaultCsrfCookie,
  exportOpsBackupArchive,
  recordOpsBackupExportError,
  toOpsBackupExportClientError,
  type OpsBackupExportMode,
} from "@/lib/ops/backup/backupExportRouteService";
import { readBoundedBackupJson, toBackupJsonRequestError } from "@/lib/ops/backup/backupJsonRequest";
import { opsErrorResponse, toOpsContractError } from "@/lib/ops/errorContract";
import { withPlanningRouteUser } from "@/lib/planning/api/routeAuth";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asBool(value: unknown): boolean {
  const normalized = asString(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function supportsGzip(request: Request): boolean {
  return asString(request.headers.get("accept-encoding")).toLowerCase().includes("gzip");
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
    return ensureOpsBackupExportVaultCsrfCookie(request, response);
  }

  return await withPlanningRouteUser(request, async () => {
    try {
      const body = await readBoundedBackupJson(request) as {
        csrf?: unknown;
        passphrase?: unknown;
        mode?: unknown;
        gzip?: unknown;
      } | null;
      assertOpsBackupExportVaultCsrf(request, asString(body?.csrf));
      const passphrase = asString(body?.passphrase);
      const mode: OpsBackupExportMode = asString(body?.mode).toLowerCase() === "delta" ? "delta" : "full";
      const gzipRequested = asBool(body?.gzip) || supportsGzip(request);
      const exported = await exportOpsBackupArchive({
        passphrase,
        mode,
        gzipRequested,
        startedAt,
        scope: "user",
      });
      const baseStream = Readable.from(exported.encryptedBytes, { highWaterMark: 64 * 1024 });
      const streamed = gzipRequested ? baseStream.pipe(createGzip()) : baseStream;
      const response = new Response(Readable.toWeb(streamed) as ReadableStream, {
        status: 200,
        headers: {
          "content-type": "application/octet-stream",
          "content-disposition": `attachment; filename="${exported.fileName}"`,
          "cache-control": "no-store",
          "x-transfer-mode": "stream",
          "x-planning-backup-export-receipt": exported.receipt,
          ...(gzipRequested ? { "content-encoding": "gzip", vary: "accept-encoding" } : {}),
        },
      });
      return ensureOpsBackupExportVaultCsrfCookie(request, response);
    } catch (error) {
      const guard = toGuardErrorResponse(error);
      if (guard) {
        const response = opsErrorResponse({
          code: guard.code,
          message: guard.message,
          status: guard.status,
        });
        return ensureOpsBackupExportVaultCsrfCookie(request, response);
      }
      const jsonError = toBackupJsonRequestError(error);
      if (jsonError) {
        const response = opsErrorResponse({
          code: "VALIDATION",
          message: jsonError.message,
          status: jsonError.status,
        });
        return ensureOpsBackupExportVaultCsrfCookie(request, response);
      }
      const clientError = toOpsBackupExportClientError(error);
      const contractError = toOpsContractError({
        code: clientError.code,
        message: clientError.message,
        status: clientError.status,
      });
      await recordOpsBackupExportError({
        message: contractError.body.error.message,
        code: contractError.body.error.code,
        status: contractError.status,
        startedAt,
      });
      const response = NextResponse.json(contractError.body, { status: contractError.status });
      return ensureOpsBackupExportVaultCsrfCookie(request, response);
    }
  }, process.env, (response) => ensureOpsBackupExportVaultCsrfCookie(request, response));
}
