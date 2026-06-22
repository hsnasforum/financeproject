import {
  planningUserMeta,
  type PlanningRouteUser,
} from "../../planning/api/routeAuth";
import {
  listAssumptionsHistory,
  loadAssumptionsSnapshotById,
} from "../../planning/assumptions/storage";
import { type AssumptionsSnapshot } from "../../planning/assumptions/types";
import { redactText } from "../../planning/privacy/redact";

export type OpsAssumptionsHistorySummary = {
  id: string;
  asOf?: string;
  fetchedAt: string;
  warningsCount: number;
  sourcesCount: number;
  korea: AssumptionsSnapshot["korea"];
};

export type OpsAssumptionsHistoryListResult =
  | {
    kind: "completed";
    items: OpsAssumptionsHistorySummary[];
    meta: Record<string, string>;
  }
  | {
    kind: "storage-corrupt";
    message: string;
  };

export type OpsAssumptionsHistoryDetailResult =
  | {
    kind: "completed";
    meta: Record<string, string>;
    snapshot: AssumptionsSnapshot;
    snapshotId: string;
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

function toStorageErrorMessage(error: unknown, fallback: string): string {
  const unsafeMessage = asString(error instanceof Error ? error.message : "") || fallback;
  return redactText(unsafeMessage) || fallback;
}

function toSummary(input: {
  id: string;
  snapshot: AssumptionsSnapshot;
}): OpsAssumptionsHistorySummary {
  return {
    id: input.id,
    ...(input.snapshot.asOf ? { asOf: input.snapshot.asOf } : {}),
    fetchedAt: input.snapshot.fetchedAt,
    warningsCount: input.snapshot.warnings.length,
    sourcesCount: input.snapshot.sources.length,
    korea: input.snapshot.korea,
  };
}

export async function listOpsAssumptionsHistory(input: {
  currentUser: PlanningRouteUser;
  limit: number;
}): Promise<OpsAssumptionsHistoryListResult> {
  try {
    const refs = await listAssumptionsHistory(input.limit);
    const items = (await Promise.all(refs.map(async (ref) => {
      const snapshot = await loadAssumptionsSnapshotById(ref.id);
      if (!snapshot) return null;
      return toSummary({
        id: ref.id,
        snapshot,
      });
    }))).filter((row): row is OpsAssumptionsHistorySummary => Boolean(row));

    return {
      kind: "completed",
      items,
      meta: planningUserMeta(input.currentUser),
    };
  } catch (error) {
    return {
      kind: "storage-corrupt",
      message: toStorageErrorMessage(error, "스냅샷 히스토리 조회에 실패했습니다."),
    };
  }
}

export async function getOpsAssumptionsHistorySnapshot(input: {
  currentUser: PlanningRouteUser;
  snapshotId: string;
}): Promise<OpsAssumptionsHistoryDetailResult> {
  try {
    const snapshot = await loadAssumptionsSnapshotById(input.snapshotId);
    if (!snapshot) {
      return { kind: "missing" };
    }

    return {
      kind: "completed",
      snapshotId: input.snapshotId,
      snapshot,
      meta: planningUserMeta(input.currentUser),
    };
  } catch (error) {
    return {
      kind: "storage-corrupt",
      message: toStorageErrorMessage(error, "스냅샷 상세 조회에 실패했습니다."),
    };
  }
}
