import { NextResponse } from "next/server";
import { append as appendAuditLog } from "../../../../../lib/audit/auditLogStore";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { opsErrorResponse } from "../../../../../lib/ops/errorContract";
import { appendOpsAuditEvent } from "../../../../../lib/ops/securityAuditLog";
import { appendOpsMetricEvent } from "../../../../../lib/ops/metricsLog";
import { buildSupportBundle } from "../../../../../lib/ops/supportBundle";
import { GET as doctorGET } from "../../doctor/route";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function appendSupportAudit(result: "SUCCESS" | "ERROR", detail: Record<string, unknown>): void {
  try {
    appendAuditLog({
      event: "OPS_SUPPORT_BUNDLE_EXPORT",
      route: "/api/ops/support/export.zip",
      summary: `OPS_SUPPORT_BUNDLE_EXPORT ${result}`,
      details: {
        result,
        ...detail,
      },
    });
  } catch (error) {
    console.error("[audit] failed to append support bundle export log", error);
  }
}

function readVersions(): { appVersion: string; engineVersion: string } {
  const appVersion = asString(process.env.PLANNING_APP_VERSION)
    || asString(process.env.npm_package_version)
    || "0.1.0";
  const engineVersion = asString(process.env.PLANNING_ENGINE_VERSION) || "planning-v2";
  return { appVersion, engineVersion };
}

function guardRequest(request: Request, csrf: string): NextResponse | null {
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    assertCsrf(request, { csrf });
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return opsErrorResponse({
        code: "INTERNAL",
        message: "요청 검증 중 오류가 발생했습니다.",
        status: 500,
      });
    }
    return opsErrorResponse({
      code: guard.code,
      message: guard.message,
      status: guard.status,
    });
  }
}

async function loadDoctorPayload(request: Request, csrf: string): Promise<unknown> {
  const url = new URL(request.url);
  const doctorUrl = new URL("/api/ops/doctor", url.origin);
  doctorUrl.searchParams.set("csrf", csrf);

  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set("referer", `${url.origin}/ops/support`);

  const response = await doctorGET(new Request(doctorUrl, {
    method: "GET",
    headers: forwardedHeaders,
  }));

  const payload = await response.json().catch(() => null) as unknown;
  if (response.ok) {
    return payload;
  }
  const row = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const errorRow = row.error && typeof row.error === "object" ? row.error as Record<string, unknown> : {};
  return {
    ok: false,
    error: {
      code: asString(errorRow.code) || "INTERNAL",
      message: asString(errorRow.message) || "doctor report unavailable",
    },
  };
}

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const startedAt = Date.now();
  const { searchParams } = new URL(request.url);
  const csrf = asString(searchParams.get("csrf"));
  const guard = guardRequest(request, csrf);
  if (guard) return guard;

  try {
    const doctorPayload = await loadDoctorPayload(request, csrf);
    const versions = readVersions();
    const bundle = await buildSupportBundle({
      doctorPayload,
      appVersion: versions.appVersion,
      engineVersion: versions.engineVersion,
    });

    appendSupportAudit("SUCCESS", {
      fileName: bundle.fileName,
      sizeBytes: bundle.bytes.length,
      counts: bundle.manifest.counts,
    });
    await appendOpsAuditEvent({
      eventType: "OPS_SUPPORT_BUNDLE_EXPORT",
      meta: {
        status: "SUCCESS",
        fileName: bundle.fileName,
        sizeBytes: bundle.bytes.length,
      },
    }).catch(() => undefined);
    await appendOpsMetricEvent({
      type: "BACKUP_EXPORT",
      meta: {
        status: "SUCCESS",
        mode: "support",
        durationMs: Math.max(0, Date.now() - startedAt),
        sizeBytes: bundle.bytes.length,
      },
    }).catch(() => undefined);

    return new NextResponse(bundle.bytes, {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${bundle.fileName}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    appendSupportAudit("ERROR", {
      message: error instanceof Error ? error.message : "support bundle export failed",
    });
    await appendOpsAuditEvent({
      eventType: "OPS_SUPPORT_BUNDLE_EXPORT",
      meta: {
        status: "FAILED",
      },
    }).catch(() => undefined);
    await appendOpsMetricEvent({
      type: "BACKUP_EXPORT",
      meta: {
        status: "FAILED",
        mode: "support",
        durationMs: Math.max(0, Date.now() - startedAt),
        code: "INTERNAL",
      },
    }).catch(() => undefined);

    return opsErrorResponse({
      code: "INTERNAL",
      message: error instanceof Error ? error.message : "support bundle export failed",
      status: 500,
      fixHref: "/ops/support",
    });
  }
}
