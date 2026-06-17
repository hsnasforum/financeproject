import crypto from "node:crypto";

const BACKUP_PREVIEW_SESSION_COOKIE = "planning_backup_preview_session";

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

function buildToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

function readCookieToken(request: Request): string {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = parseCookies(cookieHeader);
  return (cookies[BACKUP_PREVIEW_SESSION_COOKIE] ?? "").trim();
}

export function getOrCreateBackupPreviewSessionToken(request: Request): string {
  return readCookieToken(request) || buildToken();
}

export function readBackupPreviewSessionFromRequest(request: Request): string {
  return readCookieToken(request);
}

export function setBackupPreviewSessionCookie<T extends Response>(response: T, token: string): T {
  response.headers.append(
    "set-cookie",
    `${BACKUP_PREVIEW_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
  );
  return response;
}
