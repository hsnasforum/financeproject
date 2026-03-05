import { isLocalRequest } from "./localRequest";

export class DevGuardError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "DevGuardError";
    this.status = status;
    this.code = code;
  }
}

type CsrfBody = {
  csrf?: unknown;
} | null | undefined;

function readHostHeader(request: Request): string {
  return (
    request.headers.get("x-forwarded-host")
    ?? request.headers.get("host")
    ?? new URL(request.url).host
  ).trim();
}

function readProtocol(request: Request): string {
  return (
    request.headers.get("x-forwarded-proto")
    ?? new URL(request.url).protocol.replace(":", "")
  ).trim().toLowerCase() || "http";
}

function hostToHostname(host: string): string {
  const value = host.trim().toLowerCase();
  if (!value) return "";
  if (value.startsWith("[")) {
    const bracketEnd = value.indexOf("]");
    if (bracketEnd > 0) return value.slice(1, bracketEnd);
  }
  const firstColon = value.indexOf(":");
  if (firstColon < 0) return value;
  return value.slice(0, firstColon);
}

function parseCookies(cookieHeader: string): Record<string, string> {
  if (!cookieHeader.trim()) return {};
  return cookieHeader.split(";").reduce<Record<string, string>>((acc, token) => {
    const [rawKey, ...rawRest] = token.split("=");
    const key = rawKey?.trim();
    if (!key) return acc;
    const value = rawRest.join("=").trim();
    try {
      acc[key] = decodeURIComponent(value);
    } catch {
      acc[key] = value;
    }
    return acc;
  }, {});
}

function toOrigin(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

function toUrl(raw: string | null): URL | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed);
  } catch {
    return null;
  }
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return normalized === "localhost"
    || normalized === "127.0.0.1"
    || normalized === "::1"
    || normalized === "0.0.0.0";
}

function sameOriginLoose(current: URL, incoming: URL): boolean {
  if (incoming.protocol !== current.protocol) return false;
  if ((incoming.port || "") !== (current.port || "")) return false;
  if (incoming.hostname === current.hostname) return true;
  return isLoopbackHost(incoming.hostname) && isLoopbackHost(current.hostname);
}

function fail(status: number, code: string, message: string): never {
  throw new DevGuardError(status, code, message);
}

export function assertNotProduction(env: NodeJS.ProcessEnv = process.env): void {
  if ((env.NODE_ENV ?? "").trim() === "production") {
    fail(404, "NOT_FOUND", "Not found");
  }
}

export function assertLocalHost(request: Request): void {
  if (!isLocalRequest(request)) {
    fail(403, "LOCAL_ONLY", "로컬 호스트에서만 실행할 수 있습니다.");
  }
}

export function assertSameOrigin(request: Request): void {
  const host = readHostHeader(request);
  const protocol = readProtocol(request);
  const currentUrl = toUrl(`${protocol}://${host}`);
  if (!currentUrl) {
    fail(403, "ORIGIN_MISMATCH", "동일 origin 요청만 허용됩니다.");
  }

  const originUrl = toUrl(toOrigin(request.headers.get("origin")));
  const refererUrl = toUrl(toOrigin(request.headers.get("referer")));
  const fetchSite = (request.headers.get("sec-fetch-site") ?? "").trim().toLowerCase();

  if (!originUrl && !refererUrl) {
    // Some local browsers/tools may strip origin/referer; allow only when fetch-site still indicates same-origin.
    if (fetchSite === "same-origin" || fetchSite === "none") return;
    fail(403, "ORIGIN_MISMATCH", "동일 origin 요청만 허용됩니다.");
  }

  const passed = (originUrl && sameOriginLoose(currentUrl, originUrl))
    || (refererUrl && sameOriginLoose(currentUrl, refererUrl));
  if (!passed) {
    fail(403, "ORIGIN_MISMATCH", "동일 origin 요청만 허용됩니다.");
  }
}

export function assertDevUnlocked(request: Request): void {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = parseCookies(cookieHeader);
  if (cookies.dev_action !== "1") {
    fail(403, "UNAUTHORIZED", "잠금 해제 후 다시 시도해 주세요.");
  }
}

export function assertCsrf(request: Request, body: CsrfBody): void {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = parseCookies(cookieHeader);
  const cookieCsrf = (cookies.dev_csrf ?? "").trim();
  const bodyCsrf = typeof body?.csrf === "string" ? body.csrf.trim() : "";
  if (!cookieCsrf || !bodyCsrf || cookieCsrf !== bodyCsrf) {
    fail(403, "CSRF_MISMATCH", "CSRF 검증에 실패했습니다.");
  }
}

export function hasCsrfCookie(request: Request): boolean {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = parseCookies(cookieHeader);
  return (cookies.dev_csrf ?? "").trim().length > 0;
}

export function requireCsrf(
  request: Request,
  body: CsrfBody,
  options: { allowWhenCookieMissing?: boolean } = {},
): void {
  if (options.allowWhenCookieMissing && !hasCsrfCookie(request)) return;
  assertCsrf(request, body);
}

export function toGuardErrorResponse(error: unknown): { status: number; code: string; message: string } | null {
  if (!(error instanceof DevGuardError)) return null;
  return {
    status: error.status,
    code: error.code,
    message: error.message,
  };
}
