import { createHash } from "node:crypto";

const TRACKING_PARAM_PATTERN = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i;

function normalizePath(pathname: string): string {
  const collapsed = pathname.replace(/\/{2,}/g, "/");
  if (collapsed.length > 1 && collapsed.endsWith("/")) {
    return collapsed.slice(0, -1);
  }
  return collapsed || "/";
}

export function canonicalizeUrl(rawUrl: string): string {
  const value = rawUrl.trim();
  if (!value) return "";

  try {
    const parsed = new URL(value);
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.pathname = normalizePath(parsed.pathname);

    const keepEntries = [...parsed.searchParams.entries()]
      .filter(([key]) => !TRACKING_PARAM_PATTERN.test(key))
      .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
        const keyOrder = leftKey.localeCompare(rightKey);
        if (keyOrder !== 0) return keyOrder;
        return leftValue.localeCompare(rightValue);
      });

    parsed.search = "";
    for (const [key, val] of keepEntries) {
      parsed.searchParams.append(key, val);
    }

    return parsed.toString();
  } catch {
    return value;
  }
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeDateBucket(value: string | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "unknown";
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return "unknown";
  return new Date(parsed).toISOString().slice(0, 10);
}

function normalizeTitle(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildItemId(input: {
  sourceId: string;
  guid?: string;
  canonicalUrl?: string;
  title?: string;
  publishedAt?: string;
}): string {
  const sourceId = input.sourceId.trim().toLowerCase();
  const guid = (input.guid ?? "").trim();
  if (guid) {
    return sha256(`guid:${sourceId}:${guid.toLowerCase()}`);
  }

  const canonicalUrl = (input.canonicalUrl ?? "").trim();
  if (canonicalUrl) {
    return sha256(`url:${sourceId}:${canonicalUrl.toLowerCase()}`);
  }

  const title = normalizeTitle(input.title);
  const publishedDate = normalizeDateBucket(input.publishedAt);
  return sha256(`fallback:${sourceId}:${title}:${publishedDate}`);
}
