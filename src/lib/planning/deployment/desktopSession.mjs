import {
  isDesktopLocalDeploymentRequested,
  resolvePlanningRuntimePolicy,
} from "./runtimePolicy.mjs";

export const PLANNING_DESKTOP_SESSION_COOKIE = "planning.desktop-session";

const EXTERNAL_PROXY_HEADER_NAMES = Object.freeze([
  "forwarded",
  "x-real-ip",
  "cf-connecting-ip",
]);

const RAW_IDENTITY_HEADER_NAMES = Object.freeze([
  "x-planning-user-id",
  "x-auth-user-id",
]);

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function readHeader(headers, name) {
  if (!headers || typeof headers.get !== "function") return "";
  return asString(headers.get(name));
}

function hasAnyHeader(headers, names) {
  return names.some((name) => Boolean(readHeader(headers, name)));
}

function constantTimeEqual(left, right) {
  const a = asString(left);
  const b = asString(right);
  const maxLength = Math.max(a.length, b.length);
  let mismatch = a.length ^ b.length;
  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

function readCookie(cookieHeader, name) {
  const source = asString(cookieHeader);
  if (!source) return "";
  for (const part of source.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim();
  }
  return "";
}

export function isDesktopLoopbackHost(headers) {
  const host = readHeader(headers, "host").toLowerCase();
  return host === "127.0.0.1" || /^127\.0\.0\.1:\d{1,5}$/.test(host);
}

export function hasForbiddenDesktopForwardedHeaders(headers) {
  if (hasAnyHeader(headers, EXTERNAL_PROXY_HEADER_NAMES)) return true;
  const host = readHeader(headers, "host").toLowerCase();
  const forwardedHost = readHeader(headers, "x-forwarded-host").toLowerCase();
  const forwardedPort = readHeader(headers, "x-forwarded-port");
  const forwardedProto = readHeader(headers, "x-forwarded-proto").toLowerCase();
  const forwardedFor = readHeader(headers, "x-forwarded-for").toLowerCase();
  const hostPort = host.startsWith("127.0.0.1:") ? host.slice("127.0.0.1:".length) : "";

  if (forwardedHost && forwardedHost !== host) return true;
  if (forwardedPort && forwardedPort !== hostPort) return true;
  if (forwardedProto && forwardedProto !== "http") return true;
  if (forwardedFor && !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(forwardedFor)) return true;
  return false;
}

export function hasRawDesktopIdentityHeaders(headers) {
  return hasAnyHeader(headers, RAW_IDENTITY_HEADER_NAMES);
}

export function evaluateDesktopSessionRequest(request, env = {}) {
  if (!isDesktopLocalDeploymentRequested(env)) {
    return Object.freeze({ ok: false, code: "NOT_DESKTOP_LOCAL" });
  }

  const policy = resolvePlanningRuntimePolicy(env);
  if (!policy.ok) {
    return Object.freeze({
      ok: false,
      code: "DEPLOYMENT_NOT_READY",
      policyCode: policy.code,
      conflicts: policy.conflicts ?? [],
    });
  }

  const headers = request?.headers;
  if (!isDesktopLoopbackHost(headers)) {
    return Object.freeze({ ok: false, code: "HOST_FORBIDDEN" });
  }
  if (hasForbiddenDesktopForwardedHeaders(headers)) {
    return Object.freeze({ ok: false, code: "FORWARDED_HEADERS_FORBIDDEN" });
  }
  if (hasRawDesktopIdentityHeaders(headers)) {
    return Object.freeze({ ok: false, code: "RAW_IDENTITY_HEADERS_FORBIDDEN" });
  }

  const expectedToken = asString(env.PLANNING_DESKTOP_SESSION_TOKEN);
  const actualToken = readCookie(readHeader(headers, "cookie"), PLANNING_DESKTOP_SESSION_COOKIE);
  if (!actualToken || !constantTimeEqual(actualToken, expectedToken)) {
    return Object.freeze({ ok: false, code: "SESSION_REQUIRED" });
  }

  return Object.freeze({ ok: true, userId: "default", source: "desktop-local-session" });
}
