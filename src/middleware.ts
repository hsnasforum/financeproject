import { NextResponse, type MiddlewareConfig, type NextRequest } from "next/server";
import { isLocalRequest } from "./lib/dev/localRequest";
import { evaluateDesktopSessionRequest } from "./lib/planning/deployment/desktopSession.mjs";
import { isDesktopLocalDeploymentRequested } from "./lib/planning/deployment/runtimePolicy.mjs";

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const AUTH_SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
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

function isSettingsBackupApiPath(pathname: string): boolean {
  return pathname === "/api/settings/backup" || pathname.startsWith("/api/settings/backup/");
}

function isPlanningProtectedApiPath(pathname: string): boolean {
  return isPlanningApiPath(pathname) || isSettingsBackupApiPath(pathname);
}

function isFeedbackManagementPath(pathname: string): boolean {
  return pathname.startsWith("/feedback/") || pathname.startsWith("/api/feedback/");
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
  if ((process.env.NODE_ENV ?? "").trim().toLowerCase() === "production") return true;
  return parseBoolean(process.env.PLANNING_AUTH_REQUIRED, true);
}

function hasAuthSessionCookie(request: NextRequest): boolean {
  // Auth.js splits large session cookies into name.0, name.1, ... . The route
  // still validates the session; this guard only checks for an auth signal.
  return request.cookies.getAll().some(({ name, value }) => Boolean(value) && AUTH_SESSION_COOKIE_NAMES.some(
    (baseName) => name === baseName || (name.startsWith(`${baseName}.`) && /^\d+$/.test(name.slice(baseName.length + 1))),
  ));
}

function hasTrustedPlanningAuthHeader(request: NextRequest): boolean {
  const userId = request.headers.get("x-planning-user-id")?.trim()
    || request.headers.get("x-auth-user-id")?.trim()
    || "";
  return Boolean(userId)
    && parseBoolean(process.env.PLANNING_TRUST_AUTH_HEADERS, false)
    && isLocalRequest(request);
}

function trustedPlanningAuthHeaderError(request: NextRequest): string {
  const userId = request.headers.get("x-planning-user-id")?.trim()
    || request.headers.get("x-auth-user-id")?.trim()
    || "";
  if (!userId) return "";
  if (!parseBoolean(process.env.PLANNING_TRUST_AUTH_HEADERS, false)) {
    return "신뢰된 인증 헤더가 비활성화되어 있습니다.";
  }
  if (!isLocalRequest(request)) {
    return "신뢰된 인증 헤더는 로컬 또는 내부 프록시 요청에서만 사용할 수 있습니다.";
  }
  return "";
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

function notFoundResponse(request: NextRequest, contentSecurityPolicy: string): NextResponse {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return withSecurityHeaders(NextResponse.json(
      {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Not found",
        },
      },
      { status: 404 },
    ), contentSecurityPolicy);
  }
  return withSecurityHeaders(new NextResponse("Not found", { status: 404 }), contentSecurityPolicy);
}

function authRequiredResponse(contentSecurityPolicy: string, message = "로그인이 필요합니다."): NextResponse {
  return withSecurityHeaders(NextResponse.json(
    {
      ok: false,
      error: {
        code: "UNAUTHENTICATED",
        message,
      },
    },
    { status: 401 },
  ), contentSecurityPolicy);
}

function authForbiddenResponse(contentSecurityPolicy: string, message: string): NextResponse {
  return withSecurityHeaders(NextResponse.json(
    {
      ok: false,
      error: {
        code: "FORBIDDEN",
        message,
      },
    },
    { status: 403 },
  ), contentSecurityPolicy);
}

function deploymentNotReadyResponse(contentSecurityPolicy: string): NextResponse {
  return withSecurityHeaders(NextResponse.json(
    {
      ok: false,
      error: {
        code: "DEPLOYMENT_NOT_READY",
        message: "데스크톱 로컬 실행 환경을 확인할 수 없습니다. 앱을 종료한 뒤 공식 실행 아이콘으로 다시 시작해 주세요.",
      },
    },
    { status: 503 },
  ), contentSecurityPolicy);
}

function desktopSessionForbiddenMessage(code: string): string {
  if (code === "HOST_FORBIDDEN") return "데스크톱 앱은 127.0.0.1 호스트에서만 사용할 수 있습니다.";
  if (code === "FORWARDED_HEADERS_FORBIDDEN") return "데스크톱 앱은 전달 프록시 헤더가 있는 요청을 허용하지 않습니다.";
  if (code === "RAW_IDENTITY_HEADERS_FORBIDDEN") return "데스크톱 앱은 원시 사용자 식별 헤더를 허용하지 않습니다.";
  return "데스크톱 로컬 요청을 신뢰할 수 없습니다.";
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProduction = process.env.NODE_ENV === "production";
  const nonce = shouldAttachNonce(request) ? createNonce() : null;
  const contentSecurityPolicy = buildContentSecurityPolicy(
    nonce ? { nonce } : undefined,
  );

  if (isProduction && isFeedbackManagementPath(pathname)) {
    return notFoundResponse(request, contentSecurityPolicy);
  }

  if (
    isFeedbackManagementPath(pathname)
    && (request.headers.get("x-forwarded-host") ?? "").trim()
  ) {
    return blockResponse(request, contentSecurityPolicy);
  }

  const needsLocalOnly = isOpsPath(pathname)
    || isFeedbackManagementPath(pathname)
    || isSettingsBackupApiPath(pathname)
    || isPlanningMutationPath(pathname, request.method)
    || (!isProduction && isDevOnlyPath(pathname));
  if (needsLocalOnly && !isLocalRequest(request)) {
    return blockResponse(request, contentSecurityPolicy);
  }

  if (isPlanningProtectedApiPath(pathname)) {
    if (isDesktopLocalDeploymentRequested(process.env)) {
      const desktopSession = evaluateDesktopSessionRequest(request, process.env);
      if (!desktopSession.ok) {
        if (desktopSession.code === "DEPLOYMENT_NOT_READY") {
          return deploymentNotReadyResponse(contentSecurityPolicy);
        }
        if (desktopSession.code === "SESSION_REQUIRED") {
          return authRequiredResponse(
            contentSecurityPolicy,
            "데스크톱 세션을 확인하지 못했습니다. 앱 실행 아이콘이나 시작 명령으로 다시 열어 주세요.",
          );
        }
        return authForbiddenResponse(
          contentSecurityPolicy,
          desktopSessionForbiddenMessage(desktopSession.code),
        );
      }
    }

    const trustedHeaderError = trustedPlanningAuthHeaderError(request);
    if (!isDesktopLocalDeploymentRequested(process.env) && trustedHeaderError) {
      return authForbiddenResponse(contentSecurityPolicy, trustedHeaderError);
    }
  }

  if (
    isPlanningAuthRequired()
    && isPlanningProtectedApiPath(pathname)
    && !isDesktopLocalDeploymentRequested(process.env)
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
    { source: "/feedback/:path*" },
    { source: "/api/feedback/:path*" },
    { source: "/ops/:path*" },
    { source: "/api/ops/:path*" },
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      // Next statically extracts this config; referenced constants are not supported.
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
} satisfies MiddlewareConfig;
