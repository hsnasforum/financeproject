import { GET as actionPlanGet } from "../../../v2/runs/[id]/action-plan/route";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return actionPlanGet(request, {
    params: Promise.resolve({ id }),
  });
}
