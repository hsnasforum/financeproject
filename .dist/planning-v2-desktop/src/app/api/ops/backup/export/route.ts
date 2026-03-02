import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { createGzip } from "node:zlib";
import { append as appendAuditLog } from "../../../../../lib/audit/auditLogStore";
import { assertLocalHost, assertSameOrigin, toGuardErrorResponse } from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { opsErrorResponse, toOpsContractError } from "../../../../../lib/ops/errorContract";
import { appendOpsAuditEvent } from "../../../../../lib/ops/securityAuditLog";
import { appendOpsMetricEvent } from "../../../../../lib/ops/metricsLog";
import { buildPlanningDataVaultZip, encryptPlanningDataVaultArchive } from "../../../../../lib/ops/backup/planningDataVault";
import { redactText } from "../../../../../lib/planning/privacy/redact";
import { consumeVaultCsrfOrThrow, ensureVaultCsrfCookie } from "../../../../../lib/planning/security/vaultCsrf";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asBool(value: unknown): boolean {
  const normalized = asString(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function supportsGzip(request: Request): boolean {
  const acceptEncoding = asString(request.headers.get("accept-encoding")).toLowerCase();
  return acceptEncoding.includes("gzip");
}

function appendBackupAudit(result: "SUCCESS" | "ERROR", detail: Record<string, unknown>): void {
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

function toClientError(error: unknown): { status: number; code: string; message: string } {
  const message = redactText(error instanceof Error ? error.message : "backup export failed");
  if (message.startsWith("VAULT_PASSPHRASE_REQUIRED")) {
    return { status: 400, code: "VALIDATION", message: "백업 암호를 입력해 주세요." };
  }
  if (message.startsWith("VAULT_LOCKED")) {
    return { status: 423, code: "LOCKED", message: "Vault 잠금 해제 후 다시 시도해 주세요." };
  }
  return { status: 500, code: "EXPORT_FAILED", message };
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const startedAt = Date.now();
  try {
    assertLocalHost(request);
    assertSameOrigin(request);

    const body = await request.json().catch(() => null) as { csrf?: unknown; passphrase?: unknown; mode?: unknown; gzip?: unknown } | null;
    consumeVaultCsrfOrThrow(request, asString(body?.csrf));
    const passphrase = asString(body?.passphrase);
    const mode = asString(body?.mode).toLowerCase() === "delta" ? "delta" : "full";
    const gzipRequested = asBool(body?.gzip) || supportsGzip(request);

    const exported = await buildPlanningDataVaultZip({ mode });
    const encrypted = await encryptPlanningDataVaultArchive(exported.bytes, passphrase);
    const stamp = exported.fileName.replace(/\.zip$/i, "");
    const fileName = `${stamp}.enc.json`;

    appendBackupAudit("SUCCESS", {
      fileName,
      mode,
      gzipRequested,
      rawSizeBytes: exported.bytes.length,
      encryptedSizeBytes: encrypted.length,
      counts: exported.manifest.counts,
    });
    await appendOpsAuditEvent({
      eventType: "OPS_BACKUP_EXPORT_SUCCESS",
      meta: {
        fileName,
        mode,
        gzipRequested,
        rawSizeBytes: exported.bytes.length,
        encryptedSizeBytes: encrypted.length,
      },
    }).catch(() => undefined);
    await appendOpsMetricEvent({
      type: "BACKUP_EXPORT",
      meta: {
        status: "SUCCESS",
        mode,
        gzip: gzipRequested,
        durationMs: Math.max(0, Date.now() - startedAt),
        sizeBytes: encrypted.length,
      },
    }).catch(() => undefined);
    const baseStream = Readable.from(encrypted, { highWaterMark: 64 * 1024 });
    const streamed = gzipRequested ? baseStream.pipe(createGzip()) : baseStream;
    const response = new Response(Readable.toWeb(streamed) as ReadableStream, {
      status: 200,
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename="${fileName}"`,
        "cache-control": "no-store",
        "x-transfer-mode": "stream",
        ...(gzipRequested ? { "content-encoding": "gzip", vary: "accept-encoding" } : {}),
      },
    });
    ensureVaultCsrfCookie(request, response);
    return response;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (guard) {
      const response = opsErrorResponse({
        code: guard.code,
        message: guard.message,
        status: guard.status,
      });
      ensureVaultCsrfCookie(request, response);
      return response;
    }
    const clientError = toClientError(error);
    const contractError = toOpsContractError({
      code: clientError.code,
      message: clientError.message,
      status: clientError.status,
    });
    appendBackupAudit("ERROR", {
      message: contractError.body.error.message,
      code: contractError.body.error.code,
    });
    await appendOpsAuditEvent({
      eventType: "OPS_BACKUP_EXPORT_ERROR",
      meta: {
        code: contractError.body.error.code,
        status: contractError.status,
      },
    }).catch(() => undefined);
    await appendOpsMetricEvent({
      type: "BACKUP_EXPORT",
      meta: {
        status: "FAILED",
        durationMs: Math.max(0, Date.now() - startedAt),
        code: contractError.body.error.code,
      },
    }).catch(() => undefined);
    const response = NextResponse.json(contractError.body, { status: contractError.status });
    ensureVaultCsrfCookie(request, response);
    return response;
  }
}
