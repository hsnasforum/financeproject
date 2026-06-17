import { isPlanningRouteUser, requirePlanningRouteUser } from "@/lib/planning/api/routeAuth";
import { GET as actionPlanGet } from "../../../v2/runs/[id]/action-plan/route";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) return currentUser;

  const { id } = await context.params;
  return actionPlanGet(request, {
    params: Promise.resolve({ id }),
  });
}
