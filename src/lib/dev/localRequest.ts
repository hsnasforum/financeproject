type RequestLike = {
  url: string;
  headers: {
    get(name: string): string | null;
  };
  ip?: string | null;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hostToHostname(host: string): string {
  const value = host.trim().toLowerCase();
  if (!value) return "";
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    if (end > 0) return value.slice(1, end);
  }
  const colon = value.indexOf(":");
  return colon > -1 ? value.slice(0, colon) : value;
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostToHostname(hostname);
  return normalized === "localhost"
    || normalized === "127.0.0.1"
    || normalized === "::1";
}

function parseForwardedFor(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      if (entry.startsWith("[") && entry.endsWith("]")) return entry.slice(1, -1);
      return entry;
    });
}

function normalizeIp(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (value.startsWith("::ffff:")) return value.slice(7);
  return value;
}

function isLoopbackIp(raw: string): boolean {
  const value = normalizeIp(raw);
  if (!value) return false;
  if (value === "::1") return true;
  if (value === "127.0.0.1") return true;
  if (/^127\./.test(value)) return true;
  return false;
}

function isWslEnv(env: NodeJS.ProcessEnv): boolean {
  return asString(env.WSL_DISTRO_NAME).length > 0 || asString(env.WSL_INTEROP).length > 0;
}

function isWslBridgeIp(raw: string): boolean {
  const value = normalizeIp(raw);
  const match = /^172\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value);
  if (!match) return false;
  const second = Number(match[1]);
  return Number.isInteger(second) && second >= 16 && second <= 31;
}

function isAllowRemote(env: NodeJS.ProcessEnv): boolean {
  if (asString(env.NODE_ENV).toLowerCase() === "production") return false;
  const raw = asString(env.ALLOW_REMOTE).toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function normalizeAuthority(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (!value || value.includes(",")) return "";
  try {
    return new URL(`http://${value}`).host.toLowerCase();
  } catch {
    return "";
  }
}

function loopbackAuthoritiesMatch(left: string, right: string): boolean {
  try {
    const leftUrl = new URL(`http://${left}`);
    const rightUrl = new URL(`http://${right}`);
    return isLoopbackHostname(leftUrl.hostname)
      && isLoopbackHostname(rightUrl.hostname)
      && leftUrl.port === rightUrl.port;
  } catch {
    return false;
  }
}

function readRequestUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function hasUnsupportedProxyHeaders(request: RequestLike): boolean {
  return ["forwarded", "x-real-ip", "cf-connecting-ip"]
    .some((name) => asString(request.headers.get(name)).length > 0);
}

function forwardedHeadersMatchDirectRequest(
  request: RequestLike,
  authority: string,
  requestUrl: URL,
  env: NodeJS.ProcessEnv,
): boolean {
  // Forwarded values never establish locality. Only the exact loopback values
  // that Next.js may synthesize for a direct request are accepted as consistency checks.
  if (hasUnsupportedProxyHeaders(request)) return false;

  const forwardedHost = asString(request.headers.get("x-forwarded-host"));
  if (forwardedHost && normalizeAuthority(forwardedHost) !== authority) return false;

  const forwardedPort = asString(request.headers.get("x-forwarded-port"));
  const directPort = requestUrl.port;
  if (forwardedPort && forwardedPort !== directPort) return false;

  const forwardedProto = asString(request.headers.get("x-forwarded-proto")).toLowerCase();
  const directProto = requestUrl.protocol.replace(":", "").toLowerCase();
  if (forwardedProto && forwardedProto !== directProto) return false;

  const rawForwardedFor = asString(request.headers.get("x-forwarded-for"));
  const forwardedFor = parseForwardedFor(rawForwardedFor);
  if (rawForwardedFor && forwardedFor.length < 1) return false;
  const allowWslBridgeIp = isWslEnv(env);
  return forwardedFor.every((ip) => isLoopbackIp(ip) || (allowWslBridgeIp && isWslBridgeIp(ip)));
}

function hasAllowedPeerIp(request: RequestLike, env: NodeJS.ProcessEnv): boolean {
  const fromRequestIp = asString(request.ip);
  if (!fromRequestIp) return true;
  return isLoopbackIp(fromRequestIp) || (isWslEnv(env) && isWslBridgeIp(fromRequestIp));
}

export function isLocalRequest(request: RequestLike, env: NodeJS.ProcessEnv = process.env): boolean {
  if (isAllowRemote(env)) return true;

  // 0.0.0.0 is a bind target, not a request identity. Both the canonical URL
  // and the direct Host header must independently identify loopback.
  const requestUrl = readRequestUrl(request.url);
  if (!requestUrl || !isLoopbackHostname(requestUrl.hostname)) return false;

  const hostHeader = asString(request.headers.get("host"));
  const authority = normalizeAuthority(hostHeader || requestUrl.host);
  if (!authority || !isLoopbackHostname(authority)) return false;
  if (hostHeader && !loopbackAuthoritiesMatch(authority, normalizeAuthority(requestUrl.host))) return false;

  if (!forwardedHeadersMatchDirectRequest(request, authority, requestUrl, env)) return false;
  return hasAllowedPeerIp(request, env);
}
