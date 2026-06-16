import { NextResponse, type NextRequest } from "next/server";
import { isLocalRequest } from "./src/lib/dev/localRequest";

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const AUTH_SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];
const PREFETCH_MATCHER = [
  { type: "header" as const, key: "next-router-prefetch" },
  { type: "header" as const, key: "purpose", value: "prefetch" },
];

function buildContentSecurityPolicy(options?: { nonce?: string }): string {
  const isProduction = process.env.NODE_ENV === "production";
  const scriptSrc = ["'self'"];
  if (options?.nonce) {
    scriptSrc.push(`'nonce-${options.nonce}'`);
  }
  scriptSrc.push("blob:");
  const connectSrc = isProduction
    ? ["'self'", "https:", "wss:"]
    : ["'self'", "ws:", "wss:", "http:", "https:"];
  const styleDirectives = isProduction
    ? [
      "style-src 'self'",
      "style-src-elem 'self'",
      "style-src-attr 'none'",
    ]
    : ["style-src 'self' 'unsafe-inline'"];
  if (!isProduction) {
    scriptSrc.push("'unsafe-inline'");
    scriptSrc.push("'unsafe-eval'");
  }

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    ...styleDirectives,
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(" ")}`,
  ];
  if (isProduction) {
    directives.push("upgrade-insecure-requests");
  }
  return directives.join("; ");
}

function withSecurityHeaders(response: NextResponse, contentSecurityPolicy: string): NextResponse {
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set("x-frame-options", "DENY");
  response.headers.set("cross-origin-opener-policy", "same-origin");
  response.headers.set("cross-origin-resource-policy", "same-site");
  response.headers.set("origin-agent-cluster", "?1");
  response.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  response.headers.set("content-security-policy", contentSecurityPolicy);
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

function isPlanningApiPath(pathname: string): boolean {
  return pathname === "/api/planning" || pathname.startsWith("/api/planning/");
}

function isDevOnlyPath(pathname: string): boolean {
  return pathname === "/api/dev"
    || pathname.startsWith("/api/dev/")
    || pathname === "/dev"
    || pathname.startsWith("/dev/")
    || pathname === "/debug"
    || pathname.startsWith("/debug/")
    || pathname === "/dashboard/artifacts";
}

function shouldAttachNonce(request: NextRequest): boolean {
  if (request.nextUrl.pathname.startsWith("/api/")) return false;
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return false;
  return !/\/[^/]+\.[a-z0-9]+$/i.test(request.nextUrl.pathname);
}

function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  return fallback;
}

function isPlanningAuthRequired(): boolean {
  return parseBoolean(process.env.PLANNING_AUTH_REQUIRED, false);
}

function hasAuthSessionCookie(request: NextRequest): boolean {
  return AUTH_SESSION_COOKIE_NAMES.some((name) => Boolean(request.cookies.get(name)?.value));
}

function hasTrustedPlanningAuthHeader(request: NextRequest): boolean {
  if (!parseBoolean(process.env.PLANNING_TRUST_AUTH_HEADERS, false)) return false;
  const userId = request.headers.get("x-planning-user-id")?.trim()
    || request.headers.get("x-auth-user-id")?.trim()
    || "";
  return Boolean(userId) && isLocalRequest(request);
}

function blockResponse(request: NextRequest, contentSecurityPolicy: string): NextResponse {
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
    ), contentSecurityPolicy);
  }
  return withSecurityHeaders(new NextResponse("Forbidden", { status: 403 }), contentSecurityPolicy);
}

function authRequiredResponse(contentSecurityPolicy: string): NextResponse {
  return withSecurityHeaders(NextResponse.json(
    {
      ok: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "로그인이 필요합니다.",
      },
    },
    { status: 401 },
  ), contentSecurityPolicy);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProduction = process.env.NODE_ENV === "production";
  const nonce = shouldAttachNonce(request) ? createNonce() : null;
  const contentSecurityPolicy = buildContentSecurityPolicy(
    nonce ? { nonce } : undefined,
  );

  const needsLocalOnly = isOpsPath(pathname)
    || isPlanningMutationPath(pathname, request.method)
    || (!isProduction && isDevOnlyPath(pathname));
  if (needsLocalOnly && !isLocalRequest(request)) {
    return blockResponse(request, contentSecurityPolicy);
  }

  if (
    isPlanningAuthRequired()
    && isPlanningApiPath(pathname)
    && !hasAuthSessionCookie(request)
    && !hasTrustedPlanningAuthHeader(request)
  ) {
    return authRequiredResponse(contentSecurityPolicy);
  }

  if (!nonce) {
    return withSecurityHeaders(NextResponse.next(), contentSecurityPolicy);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", contentSecurityPolicy);

  return withSecurityHeaders(NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  }), contentSecurityPolicy);
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: PREFETCH_MATCHER,
    },
  ],
};
