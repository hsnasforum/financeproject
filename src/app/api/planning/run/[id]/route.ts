import { withPlanningRouteUser } from "@/lib/planning/api/routeAuth";
import { GET as runGet } from "../../v2/runs/[id]/route";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  return await withPlanningRouteUser(request, async () => {
    const { id } = await context.params;
    return runGet(request, {
      params: Promise.resolve({ id }),
    });
  });
}
