import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getApiCacheRecord, makeApiCacheKey, setApiCache } from "@/lib/cache/apiCache";
import { normalizeSido } from "@/lib/regions/kr";
import { getSnapshotOrNull } from "@/lib/publicApis/benefitsSnapshot";
import { searchBenefits } from "@/lib/publicApis/providers/benefits";
import { buildBenefitsSearchPayload, type SearchFilters } from "@/lib/publicApis/benefitsSearchView";
import { parseTopicKeys } from "@/lib/publicApis/benefitsTopics";
import { getCachePolicy } from "../../../../../lib/dataSources/cachePolicy";

const TTL_SECONDS = Math.max(1, Math.trunc(getCachePolicy("benefits").ttlMs / 1000));

function statusByCode(code: string): number {
  if (code === "INPUT") return 400;
  if (code === "ENV_MISSING" || code === "ENV_INVALID_URL" || code === "ENV_INCOMPLETE_URL" || code === "ENV_DOC_URL") return 400;
  if (code === "NO_DATA") return 404;
  return 502;
}

function parseFlag(value: string | null, defaultValue = true): boolean {
  if (value === null) return defaultValue;
  const lowered = value.trim().toLowerCase();
  if (lowered === "0" || lowered === "false" || lowered === "no") return false;
  return true;
}

function parsePageSize(value: string | null): number {
  if (value === null || value.trim() === "") return 50;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(200, Math.trunc(parsed)));
}

function parseCursor(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
}

function parseLimit(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(1, Math.min(200, Math.trunc(parsed)));
}

function parsePositiveInt(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function parseMaxPages(value: string | null, fallback: number): number | "auto" {
  if (!value || value.trim() === "") return fallback;
  const lowered = value.trim().toLowerCase();
  if (lowered === "auto") return "auto";
  return parsePositiveInt(value, fallback, 1, 80);
}

function parseTopics(value: string | null): string[] {
  if (!value) return [];
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function parseTopicMode(value: string | null): "or" | "and" {
  return value?.trim().toLowerCase() === "and" ? "and" : "or";
}

export async function GET(request: Request) {
  const traceId = crypto.randomUUID();
  try {
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get("query") ?? "").trim();
    const mode = (searchParams.get("mode") ?? "search").trim().toLowerCase();
    const scanParam = (searchParams.get("scan") ?? "").trim().toLowerCase();
    const scanMode = scanParam || (mode === "all" && !query ? "all" : "page");
    const useSnapshotPath = scanMode === "all";
    const maxPages = parseMaxPages(searchParams.get("maxPages"), 10);
    const rows = parsePositiveInt(searchParams.get("rows"), 200, 50, 300);
    const snapshotPolicySec = Math.max(60, Math.trunc(getCachePolicy("benefits").ttlMs / 1000));
    const snapshotTtlMs = parsePositiveInt(searchParams.get("snapshotTtlSec"), snapshotPolicySec, 60, 7 * 24 * 60 * 60) * 1000;
    const deep = scanMode === "deep";
    const scanPages = useSnapshotPath ? maxPages : scanMode === "deep" ? (typeof maxPages === "number" ? Math.max(maxPages, 10) : 10) : 1;
    const scope = (searchParams.get("scope") ?? "auto").trim().toLowerCase() as "auto" | "name" | "field";
    const pageSize = parsePageSize(searchParams.get("pageSize") ?? searchParams.get("limit"));
    const cursor = parseCursor(searchParams.get("cursor"));
    const includeFacets = parseFlag(searchParams.get("includeFacets"), cursor === 0);
    const limit = parseLimit(searchParams.get("limit"));
    const selectedSido = normalizeSido(searchParams.get("sido") ?? "") ?? null;
    const selectedSigungu = (searchParams.get("sigungu") ?? "").trim() || null;
    const includeNationwide = parseFlag(searchParams.get("includeNationwide"), true);
    const includeUnknown = parseFlag(searchParams.get("includeUnknown"), true);
    const selectedTopics = parseTopicKeys(parseTopics(searchParams.get("topics")));
    const topicMode = parseTopicMode(searchParams.get("topicMode"));

    const key = makeApiCacheKey("benefits-search", {
      query,
      scanMode: useSnapshotPath ? "all" : scanMode,
      maxPages: useSnapshotPath ? undefined : maxPages,
      rows: useSnapshotPath ? undefined : rows,
      scope,
      pageSize,
      cursor,
      includeFacets,
      limit,
      selectedSido,
      selectedSigungu,
      includeNationwide,
      includeUnknown,
      selectedTopics,
      topicMode,
    });
    const hit = getApiCacheRecord(key);
    if (hit) {
      const payload = hit.entry.payload as Record<string, unknown>;
      return NextResponse.json({
        ...payload,
        meta: {
          ...(typeof payload.meta === "object" && payload.meta !== null ? payload.meta : {}),
          cache: "hit",
          key,
          fetchedAt: hit.entry.fetchedAt,
          expiresAt: hit.entry.expiresAt,
        },
      });
    }

    const filters: SearchFilters = {
      query,
      limit,
      pageSize,
      cursor,
      includeFacets,
      selectedSido,
      selectedSigungu,
      includeNationwide,
      includeUnknown,
      selectedTopics,
      topicMode,
    };
    let payload: ReturnType<typeof buildBenefitsSearchPayload>;

    if (useSnapshotPath) {
      const snap = getSnapshotOrNull({ ttlMs: snapshotTtlMs });
      if (!snap) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "SNAPSHOT_MISSING",
              message: "보조금24 스냅샷이 없습니다. /api/dev/benefits/snapshot/refresh 를 먼저 실행하세요.",
              traceId,
            },
          },
          { status: 409 },
        );
      }
      payload = buildBenefitsSearchPayload(snap.snapshot.items, filters, {
        ...snap.snapshot.meta,
        snapshot: {
          fromCache: snap.fromCache,
          generatedAt: snap.snapshot.meta.generatedAt,
          ageMs: Math.max(0, Date.now() - Date.parse(snap.snapshot.meta.generatedAt)),
          totalItemsInSnapshot: snap.snapshot.meta.totalItemsInSnapshot,
          neededPagesEstimate: snap.snapshot.meta.neededPagesEstimate,
          requestedMaxPages: snap.snapshot.meta.requestedMaxPages,
          effectiveMaxPages: snap.snapshot.meta.effectiveMaxPages,
          pagesFetched: snap.snapshot.meta.pagesFetched,
          completionRate: snap.snapshot.meta.completionRate,
          truncatedByHardCap: snap.snapshot.meta.truncatedByHardCap,
          isStale: snap.isStale,
        },
        neededPagesEstimate: snap.snapshot.meta.neededPagesEstimate,
        truncatedByMaxPages: false,
        maxPagesIgnoredInSnapshotMode: true,
      });
    } else {
      const result = await searchBenefits(query, {
        mode: mode === "all" ? "all" : "search",
        deep,
        scanPages,
        rows,
        scope,
        limit,
        maxMatches: scanMode === "all" ? Math.max(pageSize * (typeof maxPages === "number" ? maxPages : 10), 2000) : undefined,
      });
      if (!result.ok) {
        return NextResponse.json({ ...result, error: { ...result.error, traceId } }, { status: statusByCode(result.error.code) });
      }
      payload = buildBenefitsSearchPayload(result.data, filters, {
        ...(result.meta ?? {}),
        neededPagesEstimate: result.meta?.neededPagesEstimate,
      });
    }

    const entry = setApiCache(key, payload, TTL_SECONDS);
    return NextResponse.json({
      ...payload,
      meta: {
        ...payload.meta,
        cache: "miss",
        key,
        fetchedAt: entry.fetchedAt,
        expiresAt: entry.expiresAt,
      },
    });
  } catch (error) {
    console.error("[benefits/search]", traceId, error);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "혜택 API 처리 중 오류가 발생했습니다.", traceId } },
      { status: 500 },
    );
  }
}
