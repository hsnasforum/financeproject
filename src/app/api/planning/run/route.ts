import { isPlanningRouteUser, requirePlanningRouteUser } from "@/lib/planning/api/routeAuth";
import { POST as runsPost } from "../v2/runs/route";

export async function POST(request: Request) {
  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) return currentUser;

  return runsPost(request);
}
