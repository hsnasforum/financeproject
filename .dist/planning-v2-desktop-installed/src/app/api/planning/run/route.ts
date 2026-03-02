import { POST as runsPost } from "../v2/runs/route";

export async function POST(request: Request) {
  return runsPost(request);
}
