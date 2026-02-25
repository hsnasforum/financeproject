export type TrustedOriginDecision =
  | { ok: true }
  | {
      ok: false;
      code: "UNTRUSTED_ORIGIN" | "MISSING_ORIGIN";
      message: string;
      hint?: string;
    };

type DecideOptions = {
  allowMissingOrigin?: boolean;
  allowLoopbackEquivalence?: boolean;
  trustedOriginHosts?: string[];
  trustedForwardHosts?: string[];
};

type ParsedAuthority = {
  hostname: string;
  hostWithPort: string;
};

type ParsedPattern = {
  hostPattern: string;
  wildcard: boolean;
  port: number | null;
};

export function normalizeHostname(hostname: string): string {
  const trimmed = hostname.trim().toLowerCase();
  if (!trimmed) return "";
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function isLoopbackHost(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

export function parseHostPatterns(input?: string): string[] {
  if (!input) return [];
  return input
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
}

function parseAuthorityFromHostHeader(value: string | null): ParsedAuthority | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim() ?? "";
  if (!first) return null;
  try {
    const parsed = new URL(`http://${first}`);
    const hostname = normalizeHostname(parsed.hostname);
    if (!hostname) return null;
    const defaultPort = "80";
    const hostWithPort = parsed.port ? `${hostname}:${parsed.port}` : `${hostname}:${defaultPort}`;
    return { hostname, hostWithPort };
  } catch {
    return null;
  }
}

function parseAuthorityFromOrigin(value: string | null): ParsedAuthority | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const hostname = normalizeHostname(parsed.hostname);
    if (!hostname) return null;
    const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
    return {
      hostname,
      hostWithPort: `${hostname}:${port}`,
    };
  } catch {
    return null;
  }
}

function parsePattern(pattern: string): ParsedPattern | null {
  const raw = pattern.trim().toLowerCase();
  if (!raw) return null;

  const match = raw.match(/^(.*?)(?::(\d+))?$/);
  if (!match) return null;

  const hostPart = (match[1] ?? "").trim();
  const portPart = (match[2] ?? "").trim();
  if (!hostPart) return null;

  const wildcard = hostPart.startsWith("*.");
  const hostPattern = normalizeHostname(wildcard ? hostPart.slice(2) : hostPart);
  if (!hostPattern) return null;

  return {
    hostPattern,
    wildcard,
    port: portPart ? Number(portPart) : null,
  };
}

function parsePort(hostWithPort: string): number | null {
  const parsed = new URL(`http://${hostWithPort}`);
  if (!parsed.port) return null;
  const value = Number(parsed.port);
  return Number.isFinite(value) ? value : null;
}

export function matchHostPattern(hostname: string, hostWithPort: string | null, pattern: string): boolean {
  const parsedPattern = parsePattern(pattern);
  if (!parsedPattern) return false;

  const normalizedHost = normalizeHostname(hostname);
  const hostMatch = parsedPattern.wildcard
    ? normalizedHost === parsedPattern.hostPattern || normalizedHost.endsWith(`.${parsedPattern.hostPattern}`)
    : normalizedHost === parsedPattern.hostPattern;
  if (!hostMatch) return false;

  if (parsedPattern.port === null) return true;
  if (!hostWithPort) return false;

  try {
    const port = parsePort(hostWithPort);
    return port === parsedPattern.port;
  } catch {
    return false;
  }
}

function matchesAnyPattern(authority: ParsedAuthority | null, patterns: string[]): boolean {
  if (!authority || patterns.length === 0) return false;
  return patterns.some((pattern) => matchHostPattern(authority.hostname, authority.hostWithPort, pattern));
}

export function decideTrustedOrigin(headers: Headers, opts: DecideOptions = {}): TrustedOriginDecision {
  const allowMissingOrigin = opts.allowMissingOrigin === true;
  const allowLoopbackEquivalence = opts.allowLoopbackEquivalence !== false;
  const trustedOriginHosts = opts.trustedOriginHosts ?? [];
  const trustedForwardHosts = opts.trustedForwardHosts ?? [];

  const originHeader = headers.get("origin");
  const originAuthority = parseAuthorityFromOrigin(originHeader);

  const hostAuthority = parseAuthorityFromHostHeader(headers.get("host"));
  const xfHostAuthority = parseAuthorityFromHostHeader(headers.get("x-forwarded-host"));
  const trustedHosts = [hostAuthority, xfHostAuthority].filter((value): value is ParsedAuthority => Boolean(value));

  if (!originHeader) {
    if (!allowMissingOrigin) {
      return {
        ok: false,
        code: "MISSING_ORIGIN",
        message: "요청을 검증할 Origin 헤더가 없어 차단되었습니다.",
        hint: "브라우저에서 요청하거나, 로컬 개발에서만 ALLOW_LOCAL_SYNC=1 설정 후 다시 시도하세요.",
      };
    }

    const hasLoopbackTrustedHost = trustedHosts.some((candidate) => isLoopbackHost(candidate.hostname));
    if (!hasLoopbackTrustedHost) {
      return {
        ok: false,
        code: "UNTRUSTED_ORIGIN",
        message: "신뢰할 수 있는 로컬 호스트가 아니어서 차단되었습니다.",
        hint: "포트포워딩/프록시 환경이면 Host 또는 x-forwarded-host 설정을 확인하세요.",
      };
    }

    return { ok: true };
  }

  if (!originAuthority) {
    return {
      ok: false,
      code: "UNTRUSTED_ORIGIN",
      message: "Origin 형식이 올바르지 않아 요청이 차단되었습니다.",
      hint: "브라우저/프록시에서 Origin 헤더가 정상 전달되는지 확인하세요.",
    };
  }

  if (trustedHosts.length === 0) {
    return {
      ok: false,
      code: "UNTRUSTED_ORIGIN",
      message: "요청 호스트를 확인할 수 없어 차단되었습니다.",
      hint: "Host 또는 x-forwarded-host 헤더 전달 설정을 확인하세요.",
    };
  }

  const exactMatch = trustedHosts.some((candidate) => candidate.hostname === originAuthority.hostname);
  if (exactMatch) return { ok: true };

  if (allowLoopbackEquivalence && isLoopbackHost(originAuthority.hostname) && trustedHosts.some((candidate) => isLoopbackHost(candidate.hostname))) {
    return { ok: true };
  }

  const originAllowedByList = matchesAnyPattern(originAuthority, trustedOriginHosts);
  const forwardAllowedByList = trustedHosts.some((candidate) => matchesAnyPattern(candidate, trustedForwardHosts));

  if (originAllowedByList && (forwardAllowedByList || (allowLoopbackEquivalence && trustedHosts.some((candidate) => isLoopbackHost(candidate.hostname))))) {
    return { ok: true };
  }

  return {
    ok: false,
    code: "UNTRUSTED_ORIGIN",
    message: "요청 출처가 신뢰 목록과 일치하지 않아 차단되었습니다.",
    hint: "포트포워딩 환경이면 x-forwarded-host 또는 TRUSTED_ORIGIN_HOSTS/TRUSTED_FORWARD_HOSTS 설정을 확인하세요.",
  };
}
