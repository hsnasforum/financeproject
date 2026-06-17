import { isPlanningRouteUser, requirePlanningRouteUser } from "@/lib/planning/api/routeAuth";
import { GET as runBlobGet } from "../../../../v2/runs/[id]/blob/[name]/route";

type RouteContext = {
  params: Promise<{ id: string; name: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) return currentUser;

  const { id, name } = await context.params;
  return runBlobGet(request, {
    params: Promise.resolve({ id, name }),
  });
}
