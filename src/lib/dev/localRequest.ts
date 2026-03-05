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
  const normalized = hostname.trim().toLowerCase();
  return normalized === "localhost"
    || normalized === "127.0.0.1"
    || normalized === "::1"
    || normalized === "0.0.0.0";
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

function parseForwardedHeader(value: string): string[] {
  const out: string[] = [];
  const tokens = value.split(",");
  for (const token of tokens) {
    const parts = token.split(";");
    for (const part of parts) {
      const [k, v] = part.split("=").map((row) => row.trim());
      if (k?.toLowerCase() !== "for") continue;
      const cleaned = (v ?? "").replace(/^"|"$/g, "").trim();
      if (!cleaned) continue;
      if (cleaned.startsWith("[")) {
        const end = cleaned.indexOf("]");
        out.push(end > 0 ? cleaned.slice(1, end) : cleaned);
        continue;
      }
      out.push(cleaned.split(":")[0] ?? cleaned);
    }
  }
  return out;
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

function isAllowRemote(env: NodeJS.ProcessEnv): boolean {
  const raw = asString(env.ALLOW_REMOTE).toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function collectIpCandidates(request: RequestLike): string[] {
  const fromRequestIp = asString(request.ip);
  const xForwardedFor = parseForwardedFor(asString(request.headers.get("x-forwarded-for")));
  const forwarded = parseForwardedHeader(asString(request.headers.get("forwarded")));
  const xRealIp = asString(request.headers.get("x-real-ip"));
  const cfIp = asString(request.headers.get("cf-connecting-ip"));

  return [
    ...(fromRequestIp ? [fromRequestIp] : []),
    ...xForwardedFor,
    ...forwarded,
    ...(xRealIp ? [xRealIp] : []),
    ...(cfIp ? [cfIp] : []),
  ]
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .filter((entry, index, all) => all.indexOf(entry) === index);
}

export function isLocalRequest(request: RequestLike, env: NodeJS.ProcessEnv = process.env): boolean {
  if (isAllowRemote(env)) return true;

  const host = asString(request.headers.get("x-forwarded-host"))
    || asString(request.headers.get("host"))
    || (() => {
      try {
        return new URL(request.url).host;
      } catch {
        return "";
      }
    })();

  const hostname = hostToHostname(host);
  if (!isLoopbackHostname(hostname)) return false;

  const ips = collectIpCandidates(request);
  if (ips.length < 1) return true;
  return ips.every((ip) => isLoopbackIp(ip));
}
