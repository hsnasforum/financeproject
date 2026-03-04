const TRACKING_PARAM_PATTERN = /^(utm_|fbclid$|gclid$|igshid$|mc_cid$|mc_eid$|ref$|ref_src$)/i;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePath(pathname: string): string {
  const normalized = pathname.replace(/\/{2,}/g, "/");
  if (!normalized || normalized === "/") return "/";
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

export function canonicalizeUrl(rawUrl: string): string {
  const input = asString(rawUrl);
  if (!input) return "";
  try {
    const parsed = new URL(input);
    parsed.hash = "";
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();

    if ((parsed.protocol === "http:" && parsed.port === "80") || (parsed.protocol === "https:" && parsed.port === "443")) {
      parsed.port = "";
    }

    const keep = new URLSearchParams();
    const entries = [...parsed.searchParams.entries()]
      .filter(([key]) => !TRACKING_PARAM_PATTERN.test(key))
      .sort((left, right) => {
        if (left[0] !== right[0]) return left[0].localeCompare(right[0]);
        return left[1].localeCompare(right[1]);
      });
    for (const [key, value] of entries) {
      keep.append(key, value);
    }

    parsed.pathname = normalizePath(parsed.pathname);
    parsed.search = keep.toString() ? `?${keep.toString()}` : "";
    return parsed.toString();
  } catch {
    return "";
  }
}

export function isCanonicalUrl(value: string): boolean {
  const normalized = canonicalizeUrl(value);
  return normalized.length > 0 && normalized === asString(value);
}
