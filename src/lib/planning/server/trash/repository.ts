import {
  emptyPlanningTrash,
  listPlanningTrash,
  type PlanningTrashItem,
  type PlanningTrashKind,
} from "../store/trash";

export type CurrentUserPlanningTrashKind = PlanningTrashKind;
export type CurrentUserPlanningTrashScope = CurrentUserPlanningTrashKind | "all";
export type CurrentUserPlanningTrashItem = PlanningTrashItem;

export async function listCurrentUserPlanningTrash(
  kind: CurrentUserPlanningTrashScope = "all",
  limit = 200,
): Promise<CurrentUserPlanningTrashItem[]> {
  return listPlanningTrash(kind, limit);
}

export async function emptyCurrentUserPlanningTrash(
  kind: CurrentUserPlanningTrashScope = "all",
): Promise<{ deleted: number }> {
  return emptyPlanningTrash(kind);
}
