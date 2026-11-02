import { randomBytes, timingSafeEqual } from "node:crypto";
import http from "node:http";
import { PLANNING_DESKTOP_SESSION_COOKIE } from "../src/lib/planning/deployment/desktopSession.mjs";

const DEFAULT_NONCE_TTL_MS = 60_000;
const DEFAULT_MAX_PENDING_NONCES = 16;
const DEFAULT_ISSUE_TIMEOUT_MS = 5_000;
export const PLANNING_E2E_DESKTOP_SHUTDOWN_MESSAGE = "planning-e2e-desktop-launcher-shutdown";

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function safeEqual(left, right) {
  const a = Buffer.from(asString(left), "utf8");
  const b = Buffer.from(asString(right), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function isHighEntropyToken(value) {
  return /^[A-Za-z0-9_-]{43,}$/.test(asString(value));
}

function isLoopbackSocket(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function parseExactLoopbackOrigin(value, label) {
  let parsed;
  try {
    parsed = new URL(asString(value));
  } catch {
    throw new Error(`${label} must be an exact http://127.0.0.1 URL`);
  }
  const port = Number(parsed.port);
  if (
    parsed.protocol !== "http:"
    || parsed.hostname !== "127.0.0.1"
    || !Number.isInteger(port)
    || port < 1
    || port > 65_535
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
  ) {
    throw new Error(`${label} must be an exact http://127.0.0.1 URL`);
  }
  return parsed.origin;
}

function parseExactLoopbackTarget(value) {
  let parsed;
  try {
    parsed = new URL(asString(value));
  } catch {
    throw new Error("desktop session target must use an exact http://127.0.0.1 URL");
  }
  const port = Number(parsed.port);
  if (
    parsed.protocol !== "http:"
    || parsed.hostname !== "127.0.0.1"
    || !Number.isInteger(port)
    || port < 1
    || port > 65_535
    || parsed.username
    || parsed.password
    || parsed.hash
  ) {
    throw new Error("desktop session target must use an exact http://127.0.0.1 URL");
  }
  return parsed;
}

function parseExactBootstrapUrl(value, brokerOrigin) {
  let parsed;
  try {
    parsed = new URL(asString(value));
  } catch {
    throw new Error("desktop session broker returned an invalid bootstrap URL");
  }
  const params = [...parsed.searchParams.entries()];
  if (
    parsed.origin !== brokerOrigin
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/bootstrap"
    || parsed.hash
    || params.length !== 1
    || params[0][0] !== "nonce"
    || !isHighEntropyToken(params[0][1])
  ) {
    throw new Error("desktop session broker returned an invalid bootstrap URL");
  }
  return parsed.href;
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function writeText(response, status, body) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "text/plain; charset=utf-8",
    "referrer-policy": "no-referrer",
  });
  response.end(body);
}

export async function issuePlanningDesktopSessionBootstrap(options) {
  const brokerOrigin = parseExactLoopbackOrigin(options?.brokerUrl, "desktop session broker");
  const issueCapability = asString(options?.issueCapability);
  if (!isHighEntropyToken(issueCapability)) {
    throw new Error("desktop session issue capability must contain at least 256 bits of base64url entropy");
  }
  const timeoutMs = boundedInteger(
    options?.timeoutMs,
    DEFAULT_ISSUE_TIMEOUT_MS,
    100,
    30_000,
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${brokerOrigin}/issue`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${issueCapability}`,
      },
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });
  } catch (error) {
    throw new Error(
      `desktop session broker request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timer);
  }
  if (response.status !== 200) {
    throw new Error(`desktop session broker rejected bootstrap issuance (${response.status})`);
  }
  const payload = await response.json().catch(() => null);
  return parseExactBootstrapUrl(payload?.bootstrapUrl, brokerOrigin);
}

export async function createPlanningDesktopSessionBootstrap(options) {
  const sessionToken = asString(options?.sessionToken);
  if (!isHighEntropyToken(sessionToken)) {
    throw new Error("desktop session token must contain at least 256 bits of base64url entropy");
  }
  const target = parseExactLoopbackTarget(options?.targetUrl);
  const issueCapability = randomBytes(32).toString("base64url");
  const nonceTtlMs = boundedInteger(options?.nonceTtlMs, DEFAULT_NONCE_TTL_MS, 10, 300_000);
  const maxPendingNonces = boundedInteger(
    options?.maxPendingNonces,
    DEFAULT_MAX_PENDING_NONCES,
    1,
    128,
  );
  const pendingNonces = new Map();
  let brokerOrigin = "";
  let brokerHost = "";

  const pruneExpiredNonces = (now = Date.now()) => {
    for (const [nonce, expiresAt] of pendingNonces) {
      if (expiresAt <= now) pendingNonces.delete(nonce);
    }
  };

  const server = http.createServer((request, response) => {
    let requestUrl;
    try {
      requestUrl = new URL(request.url || "/", brokerOrigin || "http://127.0.0.1");
    } catch {
      writeText(response, 403, "Forbidden");
      return;
    }
    const fromLoopback = isLoopbackSocket(request.socket.remoteAddress);
    const hasOrigin = request.headers.origin !== undefined;
    const usesExactBrokerUrl = Boolean(brokerOrigin)
      && requestUrl.origin === brokerOrigin
      && request.headers.host === brokerHost;

    if (requestUrl.pathname === "/issue") {
      const accepted = request.method === "POST"
        && requestUrl.search === ""
        && fromLoopback
        && usesExactBrokerUrl
        && !hasOrigin
        && safeEqual(request.headers.authorization, `Bearer ${issueCapability}`);
      if (!accepted) {
        writeText(response, 403, "Forbidden");
        return;
      }

      pruneExpiredNonces();
      if (pendingNonces.size >= maxPendingNonces) {
        writeText(response, 429, "Too Many Requests");
        return;
      }
      const nonce = randomBytes(32).toString("base64url");
      pendingNonces.set(nonce, Date.now() + nonceTtlMs);
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
        "referrer-policy": "no-referrer",
      });
      response.end(JSON.stringify({
        bootstrapUrl: `${brokerOrigin}/bootstrap?nonce=${nonce}`,
      }));
      return;
    }

    const params = [...requestUrl.searchParams.entries()];
    const nonce = params.length === 1 && params[0][0] === "nonce" ? params[0][1] : "";
    const expiresAt = pendingNonces.get(nonce);
    const now = Date.now();
    const accepted = request.method === "GET"
      && requestUrl.pathname === "/bootstrap"
      && fromLoopback
      && usesExactBrokerUrl
      && !hasOrigin
      && isHighEntropyToken(nonce)
      && typeof expiresAt === "number"
      && expiresAt > now;
    if (!accepted) {
      if (typeof expiresAt === "number" && expiresAt <= now) pendingNonces.delete(nonce);
      writeText(response, 403, "Forbidden");
      return;
    }

    // Delete before writing the response so concurrent requests cannot consume the same nonce.
    pendingNonces.delete(nonce);
    response.writeHead(303, {
      "cache-control": "no-store",
      location: target.href,
      "referrer-policy": "no-referrer",
      "set-cookie": `${PLANNING_DESKTOP_SESSION_COOKIE}=${sessionToken}; Path=/; HttpOnly; SameSite=Strict`,
    });
    response.end();
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, resolve);
  });
  const address = server.address();
  if (!address || typeof address !== "object") {
    server.close();
    throw new Error("desktop session broker did not expose a local port");
  }
  brokerOrigin = parseExactLoopbackOrigin(`http://127.0.0.1:${address.port}`, "desktop session broker");
  brokerHost = new URL(brokerOrigin).host;

  let bootstrapUrl = "";
  if (options?.issueInitialBootstrap !== false) {
    try {
      bootstrapUrl = await issuePlanningDesktopSessionBootstrap({
        brokerUrl: brokerOrigin,
        issueCapability,
      });
    } catch (error) {
      await new Promise((resolve) => server.close(() => resolve()));
      throw error;
    }
  }

  let closePromise = null;
  const close = () => {
    if (closePromise) return closePromise;
    closePromise = new Promise((resolve) => {
      pendingNonces.clear();
      if (!server.listening) {
        resolve();
        return;
      }
      server.close(() => resolve());
      server.closeIdleConnections?.();
    });
    return closePromise;
  };

  return Object.freeze({
    bootstrapUrl,
    brokerUrl: brokerOrigin,
    issueCapability,
    issueBootstrapUrl: () => issuePlanningDesktopSessionBootstrap({
      brokerUrl: brokerOrigin,
      issueCapability,
    }),
    close,
  });
}
