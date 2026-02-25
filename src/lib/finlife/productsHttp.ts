import { ensureProductBest } from "@/lib/finlife/best";
import { fetchLiveFinlifeDetailed } from "@/lib/finlife/fetchLive";
import { fetchMockFinlife } from "@/lib/finlife/fetchMock";
import {
  buildFinlifeHttpCacheKey,
  resolveFinlifeHttpCacheState,
  type FinlifeHttpCacheState,
} from "@/lib/finlife/httpCache";
import { extractPagingMeta } from "@/lib/finlife/meta";
import { resolveFinlifeMode } from "@/lib/finlife/mode";
import { normalizeFinlifeProducts } from "@/lib/finlife/normalize";
import { loadFinlifeSnapshot } from "@/lib/finlife/snapshot";
import { type FinlifeKind, type FinlifeSourceResult, type NormalizedProduct } from "@/lib/finlife/types";
import { statusFromExternalApiErrorCode } from "@/lib/publicApis/errorContract";
import { buildSchemaMismatchError } from "@/lib/publicApis/schemaDrift";

type RouteResult = {
  status: number;
  payload: FinlifeSourceResult;
  headers: Record<string, string>;
};

type Paging = {
  hasNext: boolean;
  nextPage: number | null;
  totalCount?: number;
  nowPage?: number;
  maxPage?: number;
  errCd?: string;
  errMsg?: string;
};

type UpstreamDebug = {
  upstreamStatus?: number;
  upstreamMs?: number;
  baseListLen?: number;
  optionListLen?: number;
  totalCount?: number;
  maxPage?: number;
};

type CacheEntry = {
  expiresAt: number;
  payload: FinlifeSourceResult;
  debug: UpstreamDebug;
};

const liveCache = new Map<string, CacheEntry>();

function parsePositiveInt(value: string | null, fallback: number, min: number, max: number): number {
  if (value === null) return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function parsePositiveIntQueryField(input: {
  value: string | null;
  fallback: number;
  min: number;
  max: number;
  field: string;
}): { value: number; error: string | null } {
  const { value, fallback, min, max, field } = input;
  if (value === null) return { value: fallback, error: null };
  const trimmed = value.trim();
  if (!trimmed) return { value: fallback, error: null };
  if (!/^\d+$/.test(trimmed)) {
    return { value: fallback, error: `${field}는 ${min}~${max} 범위의 정수여야 합니다.` };
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return { value: fallback, error: `${field}는 ${min}~${max} 범위의 정수여야 합니다.` };
  }
  return { value: Math.trunc(parsed), error: null };
}

function pickGroupCode(item: NormalizedProduct): string {
  const raw = item.raw ?? {};
  const keys = ["top_fin_grp_no", "topFinGrpNo", "topfingrpno"];
  for (const key of keys) {
    const value = raw[key];
    if (value === null || value === undefined) continue;
    const rendered = String(value).trim();
    if (rendered) return rendered;
  }
  return "020000";
}

function paginate<T>(rows: T[], pageNo: number, pageSize: number): { rows: T[]; total: number; maxPage: number; hasNext: boolean } {
  const total = rows.length;
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.max(1, Math.min(pageNo, maxPage));
  const start = (safePage - 1) * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    total,
    maxPage,
    hasNext: safePage < maxPage,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseBaseAndOptions(input: {
  raw: unknown;
  kind: Extract<FinlifeKind, "deposit" | "saving">;
  pageNo: number;
  topFinGrpNo: string;
  mode: "live" | "mock";
}): { baseList: unknown[]; optionList: unknown[]; mismatch: FinlifeSourceResult["error"] | null } {
  const root = isRecord(input.raw) ? input.raw : null;
  const result = root && isRecord(root.result) ? root.result : null;
  if (!result) {
    return {
      baseList: [],
      optionList: [],
      mismatch: buildSchemaMismatchError({
        source: "finlife",
        stage: "extract_rows",
        message: "FINLIFE 응답 형식이 바뀌어 데이터를 읽지 못했습니다. 잠시 후 다시 시도해주세요.",
        raw: input.raw,
        rowPathHints: ["result.baseList", "result.optionList"],
        note: `kind=${input.kind};mode=${input.mode};pageNo=${input.pageNo};topFinGrpNo=${input.topFinGrpNo};reason=missing_result`,
      }),
    };
  }

  const hasBaseList = Object.prototype.hasOwnProperty.call(result, "baseList");
  const hasOptionList = Object.prototype.hasOwnProperty.call(result, "optionList");
  if (!hasBaseList && !hasOptionList) {
    return {
      baseList: [],
      optionList: [],
      mismatch: buildSchemaMismatchError({
        source: "finlife",
        stage: "extract_rows",
        message: "FINLIFE 응답 형식이 바뀌어 데이터를 읽지 못했습니다. 잠시 후 다시 시도해주세요.",
        raw: input.raw,
        rowPathHints: ["result.baseList", "result.optionList"],
        note: `kind=${input.kind};mode=${input.mode};pageNo=${input.pageNo};topFinGrpNo=${input.topFinGrpNo};reason=missing_baseList_optionList`,
      }),
    };
  }
  if (hasBaseList && !Array.isArray(result.baseList)) {
    return {
      baseList: [],
      optionList: [],
      mismatch: buildSchemaMismatchError({
        source: "finlife",
        stage: "extract_rows",
        message: "FINLIFE 응답 형식이 바뀌어 데이터를 읽지 못했습니다. 잠시 후 다시 시도해주세요.",
        raw: input.raw,
        rowPathHints: ["result.baseList", "result.optionList"],
        note: `kind=${input.kind};mode=${input.mode};pageNo=${input.pageNo};topFinGrpNo=${input.topFinGrpNo};reason=baseList_not_array`,
      }),
    };
  }
  if (hasOptionList && !Array.isArray(result.optionList)) {
    return {
      baseList: [],
      optionList: [],
      mismatch: buildSchemaMismatchError({
        source: "finlife",
        stage: "extract_rows",
        message: "FINLIFE 응답 형식이 바뀌어 데이터를 읽지 못했습니다. 잠시 후 다시 시도해주세요.",
        raw: input.raw,
        rowPathHints: ["result.baseList", "result.optionList"],
        note: `kind=${input.kind};mode=${input.mode};pageNo=${input.pageNo};topFinGrpNo=${input.topFinGrpNo};reason=optionList_not_array`,
      }),
    };
  }
  return {
    baseList: Array.isArray(result.baseList) ? result.baseList : [],
    optionList: Array.isArray(result.optionList) ? result.optionList : [],
    mismatch: null,
  };
}

function extractRowsAndPaging(input: {
  raw: unknown;
  pageNo: number;
  pageSize: number;
  kind: Extract<FinlifeKind, "deposit" | "saving">;
  topFinGrpNo: string;
  mode: "live" | "mock";
}): {
  rows: NormalizedProduct[];
  paging: Paging;
  baseListLen: number;
  optionListLen: number;
  mismatch: FinlifeSourceResult["error"] | null;
} {
  const parsedBase = parseBaseAndOptions({
    raw: input.raw,
    kind: input.kind,
    pageNo: input.pageNo,
    topFinGrpNo: input.topFinGrpNo,
    mode: input.mode,
  });
  if (parsedBase.mismatch) {
    return {
      rows: [],
      paging: { hasNext: false, nextPage: null },
      baseListLen: 0,
      optionListLen: 0,
      mismatch: parsedBase.mismatch,
    };
  }
  const { baseList, optionList } = parsedBase;
  const normalized = normalizeFinlifeProducts({ baseList, optionList });
  const sliced = normalized.slice(0, input.pageSize);

  const pageMeta = extractPagingMeta(input.raw);
  const hasNext =
    typeof pageMeta.nowPage === "number" && typeof pageMeta.maxPage === "number"
      ? pageMeta.nowPage < pageMeta.maxPage
      : normalized.length > input.pageSize;

  return {
    rows: sliced,
    paging: {
      hasNext,
      nextPage: hasNext ? input.pageNo + 1 : null,
      totalCount: pageMeta.totalCount,
      nowPage: pageMeta.nowPage,
      maxPage: pageMeta.maxPage,
      errCd: pageMeta.errCd,
      errMsg: pageMeta.errMsg,
    },
    baseListLen: baseList.length,
    optionListLen: optionList.length,
    mismatch: null,
  };
}

function mergeProducts(rows: NormalizedProduct[]): NormalizedProduct[] {
  const merged = new Map<string, NormalizedProduct>();
  for (const item of rows) {
    ensureProductBest(item);
    const existing = merged.get(item.fin_prdt_cd);
    if (!existing) {
      merged.set(item.fin_prdt_cd, {
        ...item,
        options: [...item.options],
      });
      continue;
    }
    existing.options.push(...item.options);
    if (!existing.kor_co_nm && item.kor_co_nm) existing.kor_co_nm = item.kor_co_nm;
    if (!existing.fin_prdt_nm && item.fin_prdt_nm) existing.fin_prdt_nm = item.fin_prdt_nm;
    if (!existing.fin_co_no && item.fin_co_no) existing.fin_co_no = item.fin_co_no;
    if (!existing.best && item.best) existing.best = item.best;
    ensureProductBest(existing);
  }
  return [...merged.values()];
}

function parseScanMode(searchParams: URLSearchParams): { scan: "page" | "all"; maxPages: number } {
  const scan = searchParams.get("scan") === "all" ? "all" : "page";
  const hardCap = parsePositiveInt(process.env.FINLIFE_SCAN_HARD_CAP_PAGES ?? "80", 80, 1, 300);
  if (scan !== "all") return { scan, maxPages: 1 };
  const maxPagesRaw = (searchParams.get("maxPages") ?? "auto").trim().toLowerCase();
  if (maxPagesRaw === "auto") return { scan, maxPages: hardCap };
  const parsed = Number(maxPagesRaw);
  if (!Number.isFinite(parsed) || parsed <= 0) return { scan, maxPages: hardCap };
  return { scan, maxPages: Math.min(hardCap, Math.trunc(parsed)) };
}

function buildHeaders(mode: "live" | "replay" | "mock", cacheState: FinlifeHttpCacheState, upstream: "called" | "not-called"): Record<string, string> {
  return {
    "x-finlife-mode": mode,
    "x-finlife-cache": cacheState,
    "x-finlife-upstream": upstream,
  };
}

function parseFlags(searchParams: URLSearchParams): { debug: boolean; forceBypass: boolean } {
  const debug = searchParams.get("debug") === "1" || process.env.NODE_ENV !== "production";
  const forceBypass = searchParams.get("force") === "1";
  return { debug, forceBypass };
}

function getCacheTtlMs(): number {
  const seconds = parsePositiveInt(process.env.FINLIFE_CACHE_TTL_SECONDS ?? "60", 60, 1, 24 * 60 * 60);
  return seconds * 1000;
}

function buildSchemaMismatchPayload(input: {
  kind: Extract<FinlifeKind, "deposit" | "saving">;
  pageNo: number;
  topFinGrpNo: string;
  mode: FinlifeSourceResult["mode"];
  error: FinlifeSourceResult["error"];
}): FinlifeSourceResult {
  return {
    ok: false,
    mode: input.mode,
    meta: {
      kind: input.kind,
      pageNo: input.pageNo,
      topFinGrpNo: input.topFinGrpNo,
      fallbackUsed: false,
      message: "FINLIFE 응답 형식이 예상과 달라 데이터를 가져오지 못했습니다.",
    },
    data: [],
    error: input.error,
  };
}

function buildMockPayload(input: {
  kind: Extract<FinlifeKind, "deposit" | "saving">;
  pageNo: number;
  topFinGrpNo: string;
  pageSize: number;
  message: string;
  fallbackUsed: boolean;
  note?: string;
}): FinlifeSourceResult {
  const parsed = extractRowsAndPaging({
    raw: fetchMockFinlife(input.kind),
    pageNo: input.pageNo,
    pageSize: input.pageSize,
    kind: input.kind,
    topFinGrpNo: input.topFinGrpNo,
    mode: "mock",
  });
  if (parsed.mismatch) {
    return buildSchemaMismatchPayload({
      kind: input.kind,
      pageNo: input.pageNo,
      topFinGrpNo: input.topFinGrpNo,
      mode: "mock",
      error: parsed.mismatch,
    });
  }
  const totalOptions = parsed.rows.reduce((sum, item) => sum + item.options.length, 0);
  return {
    ok: true,
    mode: "mock",
    meta: {
      kind: input.kind,
      pageNo: input.pageNo,
      topFinGrpNo: input.topFinGrpNo,
      fallbackUsed: input.fallbackUsed,
      message: input.message,
      hasNext: false,
      nextPage: null,
      totalCount: parsed.rows.length,
      nowPage: 1,
      maxPage: 1,
      totalProducts: parsed.rows.length,
      totalOptions,
      source: "mock",
      note: input.note,
    },
    data: parsed.rows,
    raw: { source: "mock" },
  };
}

function attachDebugMeta(payload: FinlifeSourceResult, input: {
  enabled: boolean;
  cacheKey: string;
  pageNo: number;
  pageSize: number;
  upstream?: UpstreamDebug;
}): FinlifeSourceResult {
  if (!input.enabled) return payload;
  return {
    ...payload,
    meta: {
      ...payload.meta,
      debug: {
        cacheKey: input.cacheKey,
        pageNo: input.pageNo,
        pageSize: input.pageSize,
        upstreamStatus: input.upstream?.upstreamStatus,
        upstreamMs: input.upstream?.upstreamMs,
        baseListLen: input.upstream?.baseListLen,
        optionListLen: input.upstream?.optionListLen,
        totalCount: input.upstream?.totalCount,
        maxPage: input.upstream?.maxPage,
      },
    },
  };
}

export async function getFinlifeProductsForHttp(kind: Extract<FinlifeKind, "deposit" | "saving">, request: Request): Promise<RouteResult> {
  const { searchParams } = new URL(request.url);
  const mode = resolveFinlifeMode({ searchParams });
  const pageNoParsed = parsePositiveIntQueryField({
    value: searchParams.get("pageNo"),
    fallback: 1,
    min: 1,
    max: 10000,
    field: "pageNo",
  });
  const pageSizeParsed = parsePositiveIntQueryField({
    value: searchParams.get("pageSize"),
    fallback: 50,
    min: 1,
    max: 200,
    field: "pageSize",
  });
  const pageNo = pageNoParsed.value;
  const pageSize = pageSizeParsed.value;
  const topFinGrpNo = (searchParams.get("topFinGrpNo") ?? "020000").trim() || "020000";
  const { scan, maxPages } = parseScanMode(searchParams);
  const { debug, forceBypass } = parseFlags(searchParams);

  if (pageNoParsed.error || pageSizeParsed.error) {
    const message = pageNoParsed.error ?? pageSizeParsed.error ?? "요청 파라미터가 올바르지 않습니다.";
    return {
      status: statusFromExternalApiErrorCode("INPUT"),
      headers: buildHeaders(mode === "replay" ? "replay" : "live", "bypass", "not-called"),
      payload: {
        ok: false,
        mode: mode === "replay" ? "fixture" : "live",
        meta: {
          kind,
          pageNo,
          topFinGrpNo,
          fallbackUsed: false,
          message: "요청 파라미터가 올바르지 않습니다.",
        },
        data: [],
        error: {
          code: "INPUT",
          message,
        },
      },
    };
  }

  if (mode === "replay") {
    const snapshot = loadFinlifeSnapshot(kind);
    if (!snapshot) {
      const payload = buildMockPayload({
        kind,
        pageNo,
        topFinGrpNo,
        pageSize,
        message: "replay 스냅샷이 없어 mock 데이터로 전환했습니다.",
        fallbackUsed: true,
        note: "replay_missing_to_mock",
      });
      return {
        status: 200,
        headers: buildHeaders("mock", "bypass", "not-called"),
        payload: attachDebugMeta(payload, {
          enabled: debug,
          cacheKey: `replay-missing:${kind}:${topFinGrpNo}:${pageNo}:${pageSize}`,
          pageNo,
          pageSize,
        }),
      };
    }

    const filtered = snapshot.items.filter((item) => pickGroupCode(item) === topFinGrpNo);
    const page = paginate(filtered, pageNo, pageSize);
    const ageMs = Math.max(0, Date.now() - Date.parse(snapshot.meta.generatedAt));

    const payload: FinlifeSourceResult = {
      ok: true,
      mode: "fixture",
      meta: {
        kind,
        pageNo,
        topFinGrpNo,
        fallbackUsed: false,
        hasNext: page.hasNext,
        nextPage: page.hasNext ? pageNo + 1 : null,
        totalCount: page.total,
        nowPage: pageNo,
        maxPage: page.maxPage,
        totalProducts: snapshot.meta.totalProducts,
        totalOptions: snapshot.meta.totalOptions,
        source: "snapshot",
        note: "fromFile replay",
        snapshot: {
          generatedAt: snapshot.meta.generatedAt,
          ageMs,
          completionRate: snapshot.meta.completionRate,
          totalProducts: snapshot.meta.totalProducts,
          totalOptions: snapshot.meta.totalOptions,
        },
      },
      data: page.rows,
    };

    return {
      status: 200,
      headers: buildHeaders("replay", "bypass", "not-called"),
      payload: attachDebugMeta(payload, {
        enabled: debug,
        cacheKey: `replay:${kind}:${topFinGrpNo}:${pageNo}:${pageSize}`,
        pageNo,
        pageSize,
      }),
    };
  }

  const cacheKey = buildFinlifeHttpCacheKey({ kind, topFinGrpNo, pageNo, pageSize, scan, maxPages });
  const nowMs = Date.now();
  const cacheDecision = resolveFinlifeHttpCacheState({
    forceBypass,
    cacheKey,
    nowMs,
    cacheStore: liveCache,
  });

  if (cacheDecision.state === "hit" && cacheDecision.entry) {
    return {
      status: 200,
      headers: buildHeaders("live", "hit", "not-called"),
      payload: attachDebugMeta(cacheDecision.entry.payload, {
        enabled: debug,
        cacheKey,
        pageNo,
        pageSize,
        upstream: cacheDecision.entry.debug,
      }),
    };
  }

  if (!process.env.FINLIFE_API_KEY) {
    const payload = buildMockPayload({
      kind,
      pageNo,
      topFinGrpNo,
      pageSize,
      message: "FINLIFE_API_KEY 미설정으로 mock 데이터로 동작합니다.",
      fallbackUsed: true,
      note: "missing_api_key_to_mock",
    });
    liveCache.set(cacheKey, {
      expiresAt: nowMs + getCacheTtlMs(),
      payload,
      debug: {},
    });
    return {
      status: 200,
      headers: buildHeaders("mock", cacheDecision.state, "not-called"),
      payload: attachDebugMeta(payload, { enabled: debug, cacheKey, pageNo, pageSize }),
    };
  }

  try {
    let payload: FinlifeSourceResult;
    let upstreamDebug: UpstreamDebug = {};

    if (scan === "all") {
      const pageRows: NormalizedProduct[] = [];
      let paging: Paging | null = null;
      let fetchedPages = 0;

      for (let currentPage = 1; currentPage <= maxPages; currentPage += 1) {
        const live = await fetchLiveFinlifeDetailed(kind, { pageNo: currentPage, topFinGrpNo, scan: "page", scanMaxPages: "auto" });
        const one = extractRowsAndPaging({
          raw: live.raw,
          pageNo: currentPage,
          pageSize,
          kind,
          topFinGrpNo,
          mode: "live",
        });
        if (one.mismatch) {
          console.error("[finlife-route] schema mismatch", one.mismatch.diagnostics ?? {});
          const payload = buildSchemaMismatchPayload({
            kind,
            pageNo: currentPage,
            topFinGrpNo,
            mode: "live",
            error: one.mismatch,
          });
          return {
            status: 502,
            headers: buildHeaders("live", cacheDecision.state, "called"),
            payload: attachDebugMeta(payload, {
              enabled: debug,
              cacheKey,
              pageNo: currentPage,
              pageSize,
              upstream: {
                upstreamStatus: live.status,
                upstreamMs: live.elapsedMs,
              },
            }),
          };
        }
        pageRows.push(...one.rows);
        paging = one.paging;
        fetchedPages += 1;

        upstreamDebug = {
          upstreamStatus: live.status,
          upstreamMs: live.elapsedMs,
          baseListLen: one.baseListLen,
          optionListLen: one.optionListLen,
          totalCount: one.paging.totalCount,
          maxPage: one.paging.maxPage,
        };

        if (!one.paging.hasNext) break;
      }

      const merged = mergeProducts(pageRows);
      const totalOptions = merged.reduce((sum, item) => sum + item.options.length, 0);
      payload = {
        ok: true,
        mode: "live",
        meta: {
          kind,
          pageNo: 1,
          topFinGrpNo,
          fallbackUsed: false,
          hasNext: false,
          nextPage: null,
          totalCount: paging?.totalCount,
          nowPage: paging?.nowPage,
          maxPage: paging?.maxPage,
          errCd: paging?.errCd,
          errMsg: paging?.errMsg,
          pagesFetched: fetchedPages,
          totalProducts: merged.length,
          totalOptions,
          truncatedByMaxPages: fetchedPages >= maxPages && (paging?.hasNext ?? false),
        },
        data: merged,
      };
    } else {
      const live = await fetchLiveFinlifeDetailed(kind, { pageNo, topFinGrpNo, scan: "page", scanMaxPages: "auto" });
      const one = extractRowsAndPaging({
        raw: live.raw,
        pageNo,
        pageSize,
        kind,
        topFinGrpNo,
        mode: "live",
      });
      if (one.mismatch) {
        console.error("[finlife-route] schema mismatch", one.mismatch.diagnostics ?? {});
        const payload = buildSchemaMismatchPayload({
          kind,
          pageNo,
          topFinGrpNo,
          mode: "live",
          error: one.mismatch,
        });
        return {
          status: 502,
          headers: buildHeaders("live", cacheDecision.state, "called"),
          payload: attachDebugMeta(payload, {
            enabled: debug,
            cacheKey,
            pageNo,
            pageSize,
            upstream: {
              upstreamStatus: live.status,
              upstreamMs: live.elapsedMs,
            },
          }),
        };
      }
      const { rows, paging, baseListLen, optionListLen } = one;
      const totalOptions = rows.reduce((sum, item) => sum + item.options.length, 0);

      upstreamDebug = {
        upstreamStatus: live.status,
        upstreamMs: live.elapsedMs,
        baseListLen,
        optionListLen,
        totalCount: paging.totalCount,
        maxPage: paging.maxPage,
      };

      payload = {
        ok: true,
        mode: "live",
        meta: {
          kind,
          pageNo,
          topFinGrpNo,
          fallbackUsed: false,
          hasNext: paging.hasNext,
          nextPage: paging.nextPage,
          totalCount: paging.totalCount,
          nowPage: paging.nowPage,
          maxPage: paging.maxPage,
          errCd: paging.errCd,
          errMsg: paging.errMsg,
          pagesFetched: 1,
          totalProducts: rows.length,
          totalOptions,
        },
        data: rows,
      };
    }

    liveCache.set(cacheKey, {
      expiresAt: nowMs + getCacheTtlMs(),
      payload,
      debug: upstreamDebug,
    });

    return {
      status: 200,
      headers: buildHeaders("live", cacheDecision.state, "called"),
      payload: attachDebugMeta(payload, {
        enabled: debug,
        cacheKey,
        pageNo,
        pageSize,
        upstream: upstreamDebug,
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error("[finlife-route] live fetch failed", {
      kind,
      pageNo,
      topFinGrpNo,
      message,
    });

    const payload = buildMockPayload({
      kind,
      pageNo,
      topFinGrpNo,
      pageSize,
      message: "라이브 FINLIFE 호출 실패로 mock 데이터로 전환했습니다.",
      fallbackUsed: true,
      note: "live_failed_to_mock",
    });
    liveCache.set(cacheKey, {
      expiresAt: nowMs + getCacheTtlMs(),
      payload,
      debug: {},
    });

    return {
      status: 200,
      headers: buildHeaders("mock", cacheDecision.state, "called"),
      payload: attachDebugMeta(payload, { enabled: debug, cacheKey, pageNo, pageSize }),
    };
  }
}

export const __test__ = {
  buildFinlifeHttpCacheKey,
  resolveFinlifeHttpCacheState,
};
