import { POST as runsPost } from "../runs/route";

export async function POST(request: Request) {
  return runsPost(request);
}
