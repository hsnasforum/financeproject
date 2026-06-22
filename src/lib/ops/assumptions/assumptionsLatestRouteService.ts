import {
  planningUserMeta,
  type PlanningRouteUser,
} from "../../planning/api/routeAuth";
import {
  findAssumptionsSnapshotId,
  loadLatestAssumptionsSnapshot,
} from "../../planning/assumptions/storage";
import { type AssumptionsSnapshot } from "../../planning/assumptions/types";
import { redactText } from "../../planning/privacy/redact";

export type OpsAssumptionsLatestRouteResult =
  | {
    kind: "completed";
    meta: Record<string, string>;
    snapshot: AssumptionsSnapshot;
    snapshotId?: string;
  }
  | {
    kind: "missing";
  }
  | {
    kind: "storage-corrupt";
    message: string;
  };

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function loadOpsLatestAssumptions(input: {
  currentUser: PlanningRouteUser;
}): Promise<OpsAssumptionsLatestRouteResult> {
  try {
    const snapshot = await loadLatestAssumptionsSnapshot();
    if (!snapshot) {
      return { kind: "missing" };
    }

    return {
      kind: "completed",
      snapshot,
      snapshotId: await findAssumptionsSnapshotId(snapshot),
      meta: planningUserMeta(input.currentUser),
    };
  } catch (error) {
    const unsafeMessage = asString(error instanceof Error ? error.message : "")
      || "가정 스냅샷 조회에 실패했습니다.";
    const message = redactText(unsafeMessage) || "가정 스냅샷 조회에 실패했습니다.";
    return {
      kind: "storage-corrupt",
      message,
    };
  }
}
