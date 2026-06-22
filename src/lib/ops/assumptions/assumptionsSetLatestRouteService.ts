import { append as appendAuditLog } from "../../audit/auditLogStore";
import {
  planningUserMeta,
  type PlanningRouteUser,
} from "../../planning/api/routeAuth";
import {
  findAssumptionsSnapshotId,
  loadAssumptionsSnapshotById,
  loadLatestAssumptionsSnapshot,
  setLatestSnapshotFromHistory,
} from "../../planning/assumptions/storage";
import { type AssumptionsSnapshot } from "../../planning/assumptions/types";
import { redactText } from "../../planning/privacy/redact";
import { isPlanningNamespaceEnabled } from "../../planning/store/namespace";

export type OpsAssumptionsSetLatestSnapshotRef = {
  id: string;
  asOf: string;
  fetchedAt: string;
};

export type OpsAssumptionsSetLatestRouteResult =
  | {
    kind: "completed";
    message: string;
    meta: Record<string, string>;
    snapshotRef: OpsAssumptionsSetLatestSnapshotRef;
  }
  | {
    kind: "validation-error";
    expectedConfirm: string;
    message: string;
  }
  | {
    kind: "missing";
    message: string;
  }
  | {
    kind: "storage-corrupt";
    message: string;
  };

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toStorageErrorMessage(error: unknown, fallback: string): string {
  const unsafeMessage = asString(error instanceof Error ? error.message : "") || fallback;
  return redactText(unsafeMessage) || fallback;
}

function toSnapshotRef(input: {
  id: string;
  snapshot: AssumptionsSnapshot;
}): OpsAssumptionsSetLatestSnapshotRef {
  return {
    id: input.id,
    asOf: input.snapshot.asOf,
    fetchedAt: input.snapshot.fetchedAt,
  };
}

function assumptionsAuditUserMeta(currentUser: PlanningRouteUser): Record<string, unknown> {
  return {
    planningUserId: currentUser.id,
    authSource: currentUser.source,
    ...(isPlanningNamespaceEnabled() ? { planningNamespaceEnabled: true } : {}),
  };
}

function appendSetLatestAudit(input: {
  result: "SUCCESS" | "REJECTED" | "ERROR";
  message: string;
  fromId?: string | null;
  toId?: string | null;
  userMeta: Record<string, unknown>;
}): void {
  try {
    appendAuditLog({
      event: "ASSUMPTIONS_SET_LATEST",
      route: "/api/ops/assumptions/set-latest",
      summary: `ASSUMPTIONS_SET_LATEST ${input.result}: ${input.message}`,
      details: {
        result: input.result,
        message: input.message,
        fromId: input.fromId ?? null,
        toId: input.toId ?? null,
        ...input.userMeta,
      },
    });
  } catch (error) {
    console.error("[audit] failed to append assumptions set latest log", error);
  }
}

async function resolveCurrentLatestId(): Promise<string | undefined> {
  try {
    const currentLatest = await loadLatestAssumptionsSnapshot();
    if (!currentLatest) return undefined;
    return await findAssumptionsSnapshotId(currentLatest);
  } catch {
    return undefined;
  }
}

export async function setOpsLatestAssumptionsFromHistory(input: {
  confirm: string;
  currentUser: PlanningRouteUser;
  snapshotId: string;
}): Promise<OpsAssumptionsSetLatestRouteResult> {
  const userMeta = assumptionsAuditUserMeta(input.currentUser);
  const fromId = await resolveCurrentLatestId();
  const expectedConfirm = `SET_LATEST ${input.snapshotId}`;

  if (input.confirm !== expectedConfirm) {
    appendSetLatestAudit({
      result: "REJECTED",
      fromId: fromId ?? null,
      toId: input.snapshotId,
      message: "invalid confirm text",
      userMeta,
    });
    return {
      kind: "validation-error",
      expectedConfirm,
      message: `confirm 값이 올바르지 않습니다. (${expectedConfirm})`,
    };
  }

  let target: AssumptionsSnapshot | null;
  try {
    target = await loadAssumptionsSnapshotById(input.snapshotId);
  } catch (error) {
    const message = toStorageErrorMessage(error, "스냅샷 상세 조회에 실패했습니다.");
    appendSetLatestAudit({
      result: "ERROR",
      fromId: fromId ?? null,
      toId: input.snapshotId,
      message,
      userMeta,
    });
    return {
      kind: "storage-corrupt",
      message,
    };
  }

  if (!target) {
    appendSetLatestAudit({
      result: "ERROR",
      fromId: fromId ?? null,
      toId: input.snapshotId,
      message: "snapshot not found",
      userMeta,
    });
    return {
      kind: "missing",
      message: "요청한 스냅샷을 찾을 수 없습니다.",
    };
  }

  try {
    await setLatestSnapshotFromHistory(input.snapshotId);
    const message = "latest 스냅샷 포인터를 변경했습니다.";
    appendSetLatestAudit({
      result: "SUCCESS",
      fromId: fromId ?? null,
      toId: input.snapshotId,
      message: "latest snapshot pointer updated",
      userMeta,
    });

    return {
      kind: "completed",
      message,
      snapshotRef: toSnapshotRef({
        id: input.snapshotId,
        snapshot: target,
      }),
      meta: planningUserMeta(input.currentUser),
    };
  } catch (error) {
    const message = toStorageErrorMessage(error, "latest 변경에 실패했습니다.");
    appendSetLatestAudit({
      result: "ERROR",
      fromId: fromId ?? null,
      toId: input.snapshotId,
      message,
      userMeta,
    });
    return {
      kind: "storage-corrupt",
      message,
    };
  }
}
