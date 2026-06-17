import { isPlanningRouteUser, requirePlanningRouteUser } from "@/lib/planning/api/routeAuth";
import {
  GET as actionProgressGet,
  PATCH as actionProgressPatch,
} from "../../../v2/runs/[id]/action-progress/route";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) return currentUser;

  const { id } = await context.params;
  return actionProgressGet(request, {
    params: Promise.resolve({ id }),
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) return currentUser;

  const { id } = await context.params;
  return actionProgressPatch(request, {
    params: Promise.resolve({ id }),
  });
}
