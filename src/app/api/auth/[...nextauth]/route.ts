import { type NextRequest } from "next/server";
import { handleWebAuthGet, handleWebAuthPost } from "@/lib/auth/routeHandlers";
import { evaluateDesktopSessionRequest } from "@/lib/planning/deployment/desktopSession.mjs";
import { isDesktopLocalDeploymentRequested } from "@/lib/planning/deployment/runtimePolicy.mjs";

export const runtime = "nodejs";

function desktopAuthResponse(request: NextRequest): Response | null {
  if (!isDesktopLocalDeploymentRequested(process.env)) return null;

  const session = evaluateDesktopSessionRequest(request, process.env);
  if (!session.ok && session.code !== "SESSION_REQUIRED") {
    return new Response(null, { status: session.code === "DEPLOYMENT_NOT_READY" ? 503 : 403 });
  }

  // A stale web sign-in bookmark may recover locally, but never grants identity.
  // The planning page still requires the launcher's one-shot session cookie.
  if (request.method === "GET" && request.nextUrl.pathname === "/api/auth/signin") {
    let recoveryUrl: URL;
    try {
      recoveryUrl = new URL(`http://${request.headers.get("host")}/planning`);
    } catch {
      return new Response(null, { status: 403 });
    }
    return Response.redirect(recoveryUrl, 307);
  }
  return new Response(null, { status: 404 });
}

export async function GET(request: NextRequest) {
  const desktopResponse = desktopAuthResponse(request);
  if (desktopResponse) return desktopResponse;
  return handleWebAuthGet(request);
}

export async function POST(request: NextRequest) {
  const desktopResponse = desktopAuthResponse(request);
  if (desktopResponse) return desktopResponse;
  return handleWebAuthPost(request);
}
