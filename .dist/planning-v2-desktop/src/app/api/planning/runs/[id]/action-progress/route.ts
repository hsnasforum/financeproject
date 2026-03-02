import {
  GET as actionProgressGet,
  PATCH as actionProgressPatch,
} from "../../../v2/runs/[id]/action-progress/route";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return actionProgressGet(request, {
    params: Promise.resolve({ id }),
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return actionProgressPatch(request, {
    params: Promise.resolve({ id }),
  });
}
