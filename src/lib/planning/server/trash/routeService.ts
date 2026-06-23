import { append as appendAuditLog } from "../../../audit/auditLogStore";
import {
  hardDeleteCurrentUserProfileFromTrash,
  restoreCurrentUserProfileFromTrash,
} from "../profiles/repository";
import { hardDeleteCurrentUserReportFromTrash, restoreCurrentUserReportFromTrash } from "../reports/repository";
import { hardDeleteCurrentUserRunFromTrash, restoreCurrentUserRunFromTrash } from "../runs/repository";
import {
  emptyCurrentUserPlanningTrash,
  listCurrentUserPlanningTrash,
  type CurrentUserPlanningTrashKind,
  type CurrentUserPlanningTrashScope,
} from "./repository";

export type CurrentUserTrashKind = CurrentUserPlanningTrashKind;
export type CurrentUserTrashScope = CurrentUserPlanningTrashScope;

export type CurrentUserTrashListItem = {
  kind: CurrentUserTrashKind;
  id: string;
  deletedAt: string;
  sizeBytes: number;
};

type TrashAuditResult = "SUCCESS" | "ERROR" | "REJECTED";

function appendTrashPurgeAudit(input: {
  route: "/api/planning/v2/trash" | "/api/planning/v2/trash/empty";
  result: TrashAuditResult;
  kind?: string;
  id?: string;
  deleted?: number;
  message: string;
}) {
  try {
    appendAuditLog({
      event: "PLANNING_TRASH_PURGE",
      route: input.route,
      summary: `PLANNING_TRASH_PURGE ${input.result}: ${input.message}`,
      details: {
        result: input.result,
        kind: input.kind ?? null,
        ...(input.id !== undefined ? { id: input.id } : {}),
        ...(input.deleted !== undefined ? { deleted: input.deleted } : {}),
        message: input.message,
      },
    });
  } catch (error) {
    console.error("[audit] failed to append planning trash purge audit", error);
  }
}

function appendTrashRestoreAudit(input: {
  result: TrashAuditResult;
  kind?: string;
  id?: string;
  message: string;
}) {
  try {
    appendAuditLog({
      event: "PLANNING_TRASH_RESTORE",
      route: "/api/planning/v2/trash/restore",
      summary: `PLANNING_TRASH_RESTORE ${input.result}: ${input.message}`,
      details: {
        result: input.result,
        kind: input.kind ?? null,
        id: input.id ?? null,
        message: input.message,
      },
    });
  } catch (error) {
    console.error("[audit] failed to append planning trash restore audit", error);
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function hardDeleteTrashByKind(kind: CurrentUserTrashKind, id: string): Promise<boolean> {
  if (kind === "profiles") return hardDeleteCurrentUserProfileFromTrash(id);
  if (kind === "runs") return hardDeleteCurrentUserRunFromTrash(id);
  return hardDeleteCurrentUserReportFromTrash(id);
}

async function restoreTrashByKind(kind: CurrentUserTrashKind, id: string): Promise<boolean> {
  if (kind === "profiles") return restoreCurrentUserProfileFromTrash(id);
  if (kind === "runs") return restoreCurrentUserRunFromTrash(id);
  return restoreCurrentUserReportFromTrash(id);
}

export async function listCurrentUserTrashItems(input: {
  kind: CurrentUserTrashScope;
  limit: number;
}): Promise<CurrentUserTrashListItem[]> {
  const rows = await listCurrentUserPlanningTrash(input.kind, input.limit);
  return rows.map((row) => ({
    kind: row.kind,
    id: row.id,
    deletedAt: row.deletedAt,
    sizeBytes: row.sizeBytes,
  }));
}

export function recordCurrentUserTrashDeleteRejected(input: {
  kind: CurrentUserTrashKind;
  id: string;
  message: string;
}): void {
  appendTrashPurgeAudit({
    route: "/api/planning/v2/trash",
    result: "REJECTED",
    kind: input.kind,
    id: input.id,
    message: input.message,
  });
}

export async function deleteCurrentUserTrashItemPermanently(input: {
  kind: CurrentUserTrashKind;
  id: string;
}): Promise<{ deleted: boolean }> {
  try {
    const deleted = await hardDeleteTrashByKind(input.kind, input.id);
    if (!deleted) {
      appendTrashPurgeAudit({
        route: "/api/planning/v2/trash",
        result: "ERROR",
        kind: input.kind,
        id: input.id,
        message: "trash item not found",
      });
      return { deleted: false };
    }
    appendTrashPurgeAudit({
      route: "/api/planning/v2/trash",
      result: "SUCCESS",
      kind: input.kind,
      id: input.id,
      message: "trash item deleted permanently",
    });
    return { deleted: true };
  } catch (error) {
    appendTrashPurgeAudit({
      route: "/api/planning/v2/trash",
      result: "ERROR",
      kind: input.kind,
      id: input.id,
      message: errorMessage(error, "휴지통 영구 삭제에 실패했습니다."),
    });
    throw error;
  }
}

export function recordCurrentUserTrashRestoreRejected(input: {
  kind: CurrentUserTrashKind;
  id: string;
  message: string;
}): void {
  appendTrashRestoreAudit({
    result: "REJECTED",
    kind: input.kind,
    id: input.id,
    message: input.message,
  });
}

export async function restoreCurrentUserTrashItem(input: {
  kind: CurrentUserTrashKind;
  id: string;
}): Promise<{ restored: boolean }> {
  try {
    const restored = await restoreTrashByKind(input.kind, input.id);
    if (!restored) {
      appendTrashRestoreAudit({
        result: "ERROR",
        kind: input.kind,
        id: input.id,
        message: "trash item not found",
      });
      return { restored: false };
    }
    appendTrashRestoreAudit({
      result: "SUCCESS",
      kind: input.kind,
      id: input.id,
      message: "trash item restored",
    });
    return { restored: true };
  } catch (error) {
    appendTrashRestoreAudit({
      result: "ERROR",
      kind: input.kind,
      id: input.id,
      message: errorMessage(error, "휴지통 복구에 실패했습니다."),
    });
    throw error;
  }
}

export function recordCurrentUserTrashEmptyRejected(input: {
  kind: CurrentUserTrashScope;
  message: string;
}): void {
  appendTrashPurgeAudit({
    route: "/api/planning/v2/trash/empty",
    result: "REJECTED",
    kind: input.kind,
    message: input.message,
  });
}

export async function emptyCurrentUserTrashItems(input: {
  kind: CurrentUserTrashScope;
}): Promise<{ deleted: number }> {
  try {
    const applied = await emptyCurrentUserPlanningTrash(input.kind);
    appendTrashPurgeAudit({
      route: "/api/planning/v2/trash/empty",
      result: "SUCCESS",
      kind: input.kind,
      deleted: applied.deleted,
      message: `trash empty applied (${applied.deleted})`,
    });
    return applied;
  } catch (error) {
    appendTrashPurgeAudit({
      route: "/api/planning/v2/trash/empty",
      result: "ERROR",
      kind: input.kind,
      message: errorMessage(error, "휴지통 비우기에 실패했습니다."),
    });
    throw error;
  }
}
