import { handleCreatePlanningRunPost } from "@/lib/planning/server/runs/createRunRouteAdapter";
import { PLANNING_DEPRECATED_API_ROUTES } from "@/lib/planning/routes";

export async function POST(request: Request) {
  return handleCreatePlanningRunPost(request, {
    deprecatedApi: PLANNING_DEPRECATED_API_ROUTES.planningRun,
  });
}
