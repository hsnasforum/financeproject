import { NextResponse, type NextRequest } from "next/server";
import { isLocalRequest } from "./src/lib/dev/localRequest";
const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function buildContentSecurityPolicy(): string {
  const isProduction = process.env.NODE_ENV === "production";
  const scriptSrc = ["'self'", "'unsafe-inline'", "blob:"];
  if (!isProduction) {
    scriptSrc.push("'unsafe-eval'");
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' ws: wss: http: https:",
  ].join("; ");
}

function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set("x-frame-options", "DENY");
  response.headers.set("cross-origin-opener-policy", "same-origin");
  response.headers.set("cross-origin-resource-policy", "same-site");
  response.headers.set("origin-agent-cluster", "?1");
  response.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  response.headers.set("content-security-policy", buildContentSecurityPolicy());
  return response;
}

function isOpsPath(pathname: string): boolean {
  return pathname === "/ops"
    || pathname.startsWith("/ops/")
    || pathname === "/api/ops"
    || pathname.startsWith("/api/ops/");
}

function isPlanningMutationPath(pathname: string, method: string): boolean {
  if (!pathname.startsWith("/api/planning")) return false;
  return STATE_CHANGING_METHODS.has(method.toUpperCase());
}

function blockResponse(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return withSecurityHeaders(NextResponse.json(
      {
        ok: false,
        error: {
          code: "LOCAL_ONLY",
          message: "로컬 호스트에서만 접근할 수 있습니다.",
        },
      },
      { status: 403 },
    ));
  }
  return withSecurityHeaders(new NextResponse("Forbidden", { status: 403 }));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const needsLocalOnly = isOpsPath(pathname) || isPlanningMutationPath(pathname, request.method);
  if (needsLocalOnly && !isLocalRequest(request)) {
    return blockResponse(request);
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/:path*"],
};
