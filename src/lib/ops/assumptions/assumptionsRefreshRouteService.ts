import { append as appendAuditLog } from "../../audit/auditLogStore";
import {
  planningUserMeta,
  type PlanningRouteUser,
} from "../../planning/api/routeAuth";
import { buildAssumptionsSnapshot } from "../../planning/assumptions/sync";
import { redactText } from "../../planning/privacy/redact";
import { isPlanningNamespaceEnabled } from "../../planning/store/namespace";
import { appendEvent as appendOpsMetricEvent } from "../metrics/metricsStore";
import { appendOpsAuditEvent } from "../securityAuditLog";

type RefreshedSnapshotSummary = {
  id: string;
  asOf: string;
  fetchedAt: string;
  warningsCount: number;
};

export type OpsAssumptionsRefreshRouteResult =
  | {
    kind: "completed";
    latestId: string;
    message: string;
    meta: Record<string, string>;
    snapshot: RefreshedSnapshotSummary;
  }
  | {
    kind: "internal-error";
    message: string;
  };

type RefreshAuditResult = "SUCCESS" | "ERROR";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function assumptionsAuditUserMeta(currentUser: PlanningRouteUser): Record<string, unknown> {
  return {
    planningUserId: currentUser.id,
    authSource: currentUser.source,
    ...(isPlanningNamespaceEnabled() ? { planningNamespaceEnabled: true } : {}),
  };
}

function appendRefreshAudit(input: {
  result: RefreshAuditResult;
  latestId?: string;
  message: string;
  userMeta: Record<string, unknown>;
}): void {
  try {
    appendAuditLog({
      event: "ASSUMPTIONS_REFRESH",
      route: "/api/ops/assumptions/refresh",
      summary: `ASSUMPTIONS_REFRESH ${input.result}: ${input.message}`,
      details: {
        result: input.result,
        latestId: input.latestId ?? null,
        message: input.message,
        ...input.userMeta,
      },
    });
  } catch (error) {
    console.error("[audit] failed to append assumptions refresh log", error);
  }
}

export async function refreshOpsAssumptions(input: {
  currentUser: PlanningRouteUser;
  startedAt: number;
}): Promise<OpsAssumptionsRefreshRouteResult> {
  const userMeta = assumptionsAuditUserMeta(input.currentUser);
  try {
    const refreshed = await buildAssumptionsSnapshot();
    const latestId = asString(refreshed.snapshotId);
    const warningsCount = Array.isArray(refreshed.snapshot.warnings) ? refreshed.snapshot.warnings.length : 0;
    const message = warningsCount > 0
      ? "가정 스냅샷을 새로고침했지만 일부 경고가 있습니다."
      : "가정 스냅샷을 새로고침했습니다.";

    appendRefreshAudit({
      result: "SUCCESS",
      latestId,
      message,
      userMeta,
    });
    await appendOpsAuditEvent({
      eventType: "OPS_ASSUMPTIONS_REFRESH_SUCCESS",
      meta: {
        latestId,
        warningsCount,
        ...userMeta,
      },
    }).catch(() => undefined);
    await appendOpsMetricEvent({
      type: "ASSUMPTIONS_REFRESH",
      status: "SUCCESS",
      durationMs: Math.max(0, Date.now() - input.startedAt),
    }).catch(() => undefined);

    return {
      kind: "completed",
      latestId,
      message,
      meta: planningUserMeta(input.currentUser),
      snapshot: {
        id: latestId,
        asOf: refreshed.snapshot.asOf,
        fetchedAt: refreshed.snapshot.fetchedAt,
        warningsCount,
      },
    };
  } catch (error) {
    const unsafeMessage = error instanceof Error ? error.message : "가정 스냅샷 새로고침에 실패했습니다.";
    const message = redactText(unsafeMessage) || "가정 스냅샷 새로고침에 실패했습니다.";

    appendRefreshAudit({
      result: "ERROR",
      message,
      userMeta,
    });
    await appendOpsAuditEvent({
      eventType: "OPS_ASSUMPTIONS_REFRESH_ERROR",
      meta: {
        message,
        ...userMeta,
      },
    }).catch(() => undefined);
    await appendOpsMetricEvent({
      type: "ASSUMPTIONS_REFRESH",
      status: "FAILED",
      errorCode: "INTERNAL",
      durationMs: Math.max(0, Date.now() - input.startedAt),
    }).catch(() => undefined);

    return {
      kind: "internal-error",
      message,
    };
  }
}
