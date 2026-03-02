import crypto from "node:crypto";
import { DevGuardError } from "../../dev/devGuards";

const VAULT_CSRF_COOKIE = "planning_vault_csrf";

function parseCookies(cookieHeader: string): Record<string, string> {
  if (!cookieHeader.trim()) return {};
  return cookieHeader.split(";").reduce<Record<string, string>>((acc, token) => {
    const [rawKey, ...rawRest] = token.split("=");
    const key = rawKey?.trim();
    if (!key) return acc;
    const value = rawRest.join("=").trim();
    acc[key] = value;
    return acc;
  }, {});
}

function readCookieToken(request: Request): string {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = parseCookies(cookieHeader);
  return (cookies[VAULT_CSRF_COOKIE] ?? "").trim();
}

function buildToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function getOrCreateVaultCsrfToken(request: Request): string {
  return readCookieToken(request) || buildToken();
}

export function setVaultCsrfCookie<T extends Response>(response: T, token: string): T {
  response.headers.append(
    "set-cookie",
    `${VAULT_CSRF_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
  );
  return response;
}

export function consumeVaultCsrfOrThrow(request: Request, bodyToken: string): void {
  const cookieToken = readCookieToken(request);
  const body = bodyToken.trim();
  if (!cookieToken || !body || cookieToken !== body) {
    throw new DevGuardError(403, "CSRF_MISMATCH", "CSRF 검증에 실패했습니다.");
  }
}

export function ensureVaultCsrfCookie<T extends Response>(request: Request, response: T): T {
  return setVaultCsrfCookie(response, getOrCreateVaultCsrfToken(request));
}

export function ensureVaultCsrfCookieWithToken<T extends Response>(
  request: Request,
  response: T,
): { response: T; csrfToken: string } {
  const token = getOrCreateVaultCsrfToken(request);
  return { response: setVaultCsrfCookie(response, token), csrfToken: token };
}

export function readVaultCsrfFromRequest(request: Request): string {
  return readCookieToken(request);
}
