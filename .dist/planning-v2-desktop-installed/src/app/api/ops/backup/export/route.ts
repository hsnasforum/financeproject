import { NextResponse } from "next/server";
import { append as appendAuditLog } from "../../../../../lib/audit/auditLogStore";
import { assertLocalHost, assertSameOrigin, toGuardErrorResponse } from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { appendOpsAuditEvent } from "../../../../../lib/ops/securityAuditLog";
import { buildPlanningDataVaultZip, encryptPlanningDataVaultArchive } from "../../../../../lib/ops/backup/planningDataVault";
import { redactText } from "../../../../../lib/planning/privacy/redact";
import { consumeVaultCsrfOrThrow, ensureVaultCsrfCookie } from "../../../../../lib/planning/security/vaultCsrf";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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
    return { status: 400, code: "PASSPHRASE_REQUIRED", message: "백업 암호를 입력해 주세요." };
  }
  if (message.startsWith("VAULT_LOCKED")) {
    return { status: 423, code: "VAULT_LOCKED", message: "Vault 잠금 해제 후 다시 시도해 주세요." };
  }
  return { status: 500, code: "EXPORT_FAILED", message };
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  try {
    assertLocalHost(request);
    assertSameOrigin(request);

    const body = await request.json().catch(() => null) as { csrf?: unknown; passphrase?: unknown } | null;
    consumeVaultCsrfOrThrow(request, asString(body?.csrf));
    const passphrase = asString(body?.passphrase);

    const exported = await buildPlanningDataVaultZip();
    const encrypted = await encryptPlanningDataVaultArchive(exported.bytes, passphrase);
    const stamp = exported.fileName.replace(/\.zip$/i, "");
    const fileName = `${stamp}.enc.json`;

    appendBackupAudit("SUCCESS", {
      fileName,
      rawSizeBytes: exported.bytes.length,
      encryptedSizeBytes: encrypted.length,
      counts: exported.manifest.counts,
    });
    await appendOpsAuditEvent({
      eventType: "OPS_BACKUP_EXPORT_SUCCESS",
      meta: {
        fileName,
        rawSizeBytes: exported.bytes.length,
        encryptedSizeBytes: encrypted.length,
      },
    }).catch(() => undefined);

    const response = new Response(new Uint8Array(encrypted), {
      status: 200,
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename="${fileName}"`,
        "cache-control": "no-store",
      },
    });
    ensureVaultCsrfCookie(request, response);
    return response;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (guard) {
      const response = NextResponse.json(
        { ok: false, error: { code: guard.code, message: guard.message } },
        { status: guard.status },
      );
      ensureVaultCsrfCookie(request, response);
      return response;
    }
    const clientError = toClientError(error);
    appendBackupAudit("ERROR", {
      message: clientError.message,
      code: clientError.code,
    });
    await appendOpsAuditEvent({
      eventType: "OPS_BACKUP_EXPORT_ERROR",
      meta: {
        code: clientError.code,
        status: clientError.status,
      },
    }).catch(() => undefined);
    const response = NextResponse.json(
      { ok: false, error: { code: clientError.code, message: clientError.message } },
      { status: clientError.status },
    );
    ensureVaultCsrfCookie(request, response);
    return response;
  }
}
