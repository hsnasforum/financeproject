import { handleCreatePlanningRunPost } from "@/lib/planning/server/runs/createRunRouteAdapter";

export async function POST(request: Request) {
  return handleCreatePlanningRunPost(request);
}
