import { append as appendAuditLog } from "../../audit/auditLogStore";
import { isPlanningNamespaceEnabled } from "../../planning/store/namespace";
import { getAppInfo } from "../../planning/server/runtime/appInfo";
import {
  doctorRouteMeta,
  runOpsDoctor,
} from "../../planning/server/ops/doctorRouteService";
import { type PlanningRouteUser } from "../../planning/api/routeAuth";
import { appendOpsMetricEvent } from "../metricsLog";
import { appendOpsAuditEvent } from "../securityAuditLog";
import { buildSupportBundle } from "../supportBundle";

export type OpsSupportExportRouteResult =
  | {
    kind: "completed";
    fileName: string;
    bytes: Buffer;
  }
  | {
    kind: "internal-error";
    message: string;
  };

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

function supportUserMeta(currentUser: PlanningRouteUser): Record<string, unknown> {
  return {
    planningUserId: currentUser.id,
    authSource: currentUser.source,
    ...(isPlanningNamespaceEnabled() ? { planningNamespaceEnabled: true } : {}),
  };
}

async function loadDoctorPayload(currentUser: PlanningRouteUser): Promise<unknown> {
  try {
    const result = await runOpsDoctor();
    return {
      ok: true,
      schemaVersion: result.schemaVersion,
      data: result.data,
      report: result.report,
      checks: result.checks,
      issues: result.issues,
      message: result.message,
      meta: {
        ...result.meta,
        ...doctorRouteMeta(currentUser),
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "STORAGE_CORRUPT",
        message: error instanceof Error ? error.message : "doctor report unavailable",
      },
    };
  }
}

export async function exportOpsSupportBundle(input: {
  currentUser: PlanningRouteUser;
  startedAt: number;
}): Promise<OpsSupportExportRouteResult> {
  const userMeta = supportUserMeta(input.currentUser);
  try {
    const doctorPayload = await loadDoctorPayload(input.currentUser);
    const appInfo = await getAppInfo();
    const bundle = await buildSupportBundle({
      doctorPayload,
      appInfo,
      planningUser: input.currentUser,
      planningNamespaceEnabled: isPlanningNamespaceEnabled(),
    });

    appendSupportAudit("SUCCESS", {
      fileName: bundle.fileName,
      sizeBytes: bundle.bytes.length,
      counts: bundle.manifest.counts,
      ...userMeta,
    });
    await appendOpsAuditEvent({
      eventType: "OPS_SUPPORT_BUNDLE_EXPORT",
      meta: {
        status: "SUCCESS",
        fileName: bundle.fileName,
        sizeBytes: bundle.bytes.length,
        ...userMeta,
      },
    }).catch(() => undefined);
    await appendOpsMetricEvent({
      type: "BACKUP_EXPORT",
      meta: {
        status: "SUCCESS",
        mode: "support",
        durationMs: Math.max(0, Date.now() - input.startedAt),
        sizeBytes: bundle.bytes.length,
        ...userMeta,
      },
    }).catch(() => undefined);

    return {
      kind: "completed",
      fileName: bundle.fileName,
      bytes: bundle.bytes,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "support bundle export failed";
    appendSupportAudit("ERROR", { message, ...userMeta });
    await appendOpsAuditEvent({
      eventType: "OPS_SUPPORT_BUNDLE_EXPORT",
      meta: {
        status: "FAILED",
        ...userMeta,
      },
    }).catch(() => undefined);
    await appendOpsMetricEvent({
      type: "BACKUP_EXPORT",
      meta: {
        status: "FAILED",
        mode: "support",
        durationMs: Math.max(0, Date.now() - input.startedAt),
        code: "INTERNAL",
        ...userMeta,
      },
    }).catch(() => undefined);

    return {
      kind: "internal-error",
      message,
    };
  }
}
