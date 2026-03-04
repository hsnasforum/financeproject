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

export function buildItemId(input: { sourceId: string; guid?: string; canonicalUrl?: string }): string {
  const guid = (input.guid ?? "").trim();
  if (guid) {
    return sha256(`guid:${input.sourceId}:${guid.toLowerCase()}`);
  }

  const canonicalUrl = (input.canonicalUrl ?? "").trim();
  if (canonicalUrl) {
    return sha256(`url:${canonicalUrl.toLowerCase()}`);
  }

  return sha256(`fallback:${input.sourceId}`);
}
