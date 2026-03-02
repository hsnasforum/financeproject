import { GET as runBlobGet } from "../../../../v2/runs/[id]/blob/[name]/route";

type RouteContext = {
  params: Promise<{ id: string; name: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { id, name } = await context.params;
  return runBlobGet(request, {
    params: Promise.resolve({ id, name }),
  });
}
