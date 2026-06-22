import { append as appendAuditLog } from "../../audit/auditLogStore";
import {
  planningUserMeta,
  type PlanningRouteUser,
} from "../../planning/api/routeAuth";
import { buildAssumptionsSnapshot } from "../../planning/assumptions/sync";
import { type AssumptionsSnapshot } from "../../planning/assumptions/types";
import { redactText } from "../../planning/privacy/redact";
import { isPlanningNamespaceEnabled } from "../../planning/store/namespace";

export type AssumptionsSyncSummary = {
  snapshotId: string;
  asOf: string;
  fetchedAt: string;
  korea: AssumptionsSnapshot["korea"];
  warningsCount: number;
  sourcesCount: number;
};

export type OpsAssumptionsSyncRouteResult =
  | {
    kind: "completed";
    message: string;
    meta: Record<string, string>;
    snapshotSummary: AssumptionsSyncSummary;
  }
  | {
    kind: "internal-error";
    message: string;
  };

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toSummary(input: { snapshotId: string; snapshot: AssumptionsSnapshot }): AssumptionsSyncSummary {
  return {
    snapshotId: input.snapshotId,
    asOf: input.snapshot.asOf,
    fetchedAt: input.snapshot.fetchedAt,
    korea: input.snapshot.korea,
    warningsCount: input.snapshot.warnings.length,
    sourcesCount: input.snapshot.sources.length,
  };
}

function assumptionsAuditUserMeta(currentUser: PlanningRouteUser): Record<string, unknown> {
  return {
    planningUserId: currentUser.id,
    authSource: currentUser.source,
    ...(isPlanningNamespaceEnabled() ? { planningNamespaceEnabled: true } : {}),
  };
}

function appendSyncAudit(input: {
  result: "SUCCESS" | "ERROR";
  message: string;
  summary?: AssumptionsSyncSummary;
  userMeta: Record<string, unknown>;
}): void {
  try {
    appendAuditLog({
      event: "ASSUMPTIONS_SYNC",
      route: "/api/ops/assumptions/sync",
      summary: `ASSUMPTIONS_SYNC ${input.result}: ${input.message}`,
      details: {
        result: input.result,
        message: input.message,
        snapshotId: input.summary?.snapshotId ?? null,
        asOf: input.summary?.asOf ?? null,
        fetchedAt: input.summary?.fetchedAt ?? null,
        warningsCount: input.summary?.warningsCount ?? null,
        sourcesCount: input.summary?.sourcesCount ?? null,
        ...input.userMeta,
      },
    });
  } catch (error) {
    console.error("[audit] failed to append assumptions sync log", error);
  }
}

export async function syncOpsAssumptions(input: {
  currentUser: PlanningRouteUser;
}): Promise<OpsAssumptionsSyncRouteResult> {
  const userMeta = assumptionsAuditUserMeta(input.currentUser);
  try {
    const built = await buildAssumptionsSnapshot();
    const snapshotSummary = toSummary(built);
    const message = snapshotSummary.warningsCount > 0
      ? "가정 스냅샷을 저장했지만 일부 경고가 있습니다."
      : "가정 스냅샷을 저장했습니다.";

    appendSyncAudit({
      result: "SUCCESS",
      message,
      summary: snapshotSummary,
      userMeta,
    });

    return {
      kind: "completed",
      snapshotSummary,
      message,
      meta: planningUserMeta(input.currentUser),
    };
  } catch (error) {
    const unsafeMessage = asString(error instanceof Error ? error.message : "")
      || "가정 스냅샷 동기화에 실패했습니다.";
    const message = redactText(unsafeMessage) || "가정 스냅샷 동기화에 실패했습니다.";
    appendSyncAudit({
      result: "ERROR",
      message,
      userMeta,
    });

    return {
      kind: "internal-error",
      message,
    };
  }
}
