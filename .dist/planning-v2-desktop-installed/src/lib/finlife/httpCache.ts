import { getCachePolicy } from "../dataSources/cachePolicy";

export type FinlifeHttpCacheState = "hit" | "miss" | "bypass";

export function buildFinlifeHttpCacheKey(input: {
  kind: "deposit" | "saving";
  topFinGrpNo: string;
  pageNo: number;
  pageSize: number;
  scan: "page" | "all";
  maxPages: number;
}): string {
  const qp = new URLSearchParams();
  qp.set("topFinGrpNo", input.topFinGrpNo);
  qp.set("pageNo", String(input.pageNo));
  qp.set("pageSize", String(input.pageSize));
  qp.set("scan", input.scan);
  qp.set("maxPages", String(input.maxPages));
  return `${input.kind}?${qp.toString()}`;
}

export function resolveFinlifeHttpCacheState<T extends { expiresAt: number }>(input: {
  forceBypass: boolean;
  cacheKey: string;
  nowMs: number;
  cacheStore: Map<string, T>;
}): { state: FinlifeHttpCacheState; entry: T | null } {
  if (input.forceBypass) return { state: "bypass", entry: null };
  const cached = input.cacheStore.get(input.cacheKey) ?? null;
  if (!cached) return { state: "miss", entry: null };
  if (cached.expiresAt <= input.nowMs) {
    input.cacheStore.delete(input.cacheKey);
    return { state: "miss", entry: null };
  }
  return { state: "hit", entry: cached };
}

export function getFinlifeHttpCacheTtlMs(): number {
  const envSeconds = Number(process.env.FINLIFE_CACHE_TTL_SECONDS ?? "");
  if (Number.isFinite(envSeconds) && envSeconds > 0) {
    return Math.max(1, Math.trunc(envSeconds)) * 1000;
  }
  return getCachePolicy("finlife").ttlMs;
}
