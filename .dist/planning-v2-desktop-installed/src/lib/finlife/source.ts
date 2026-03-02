import { MemoryCache } from "../cache/memoryCache";
import { fetchLiveFinlife } from "./fetchLive";
import { fetchMockFinlife } from "./fetchMock";
import { buildFixtureKey, readFinlifeFixture, writeFinlifeFixture } from "./fixtures";
import { extractPagingMeta } from "./meta";
import { normalizeFinlifeProducts } from "./normalize";
import { type FinlifeKind, type FinlifeParams, type FinlifeSourceResult } from "./types";
import { buildSchemaMismatchError } from "../publicApis/schemaDrift";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const cache = new MemoryCache<FinlifeSourceResult>();

function getRequiredParams(params: FinlifeParams): Required<FinlifeParams> {
  const parsedPageNo = Number(params.pageNo ?? 1);
  return {
    pageNo: Number.isFinite(parsedPageNo) && parsedPageNo > 0 ? parsedPageNo : 1,
    topFinGrpNo: params.topFinGrpNo ?? "020000",
    scan: params.scan ?? "page",
    scanMaxPages: params.scanMaxPages ?? "auto",
  };
}

function parseMode(): "auto" | "mock" | "live" | "fixture" {
  const mode = process.env.FINLIFE_MODE;
  if (mode === "mock" || mode === "live" || mode === "fixture") return mode;
  return "auto";
}

function fallbackEnabled(): boolean {
  return process.env.FINLIFE_FAIL_OPEN_TO_MOCK === "1";
}

function buildFinlifeSchemaMismatch(input: {
  kind: FinlifeKind;
  pageNo: number;
  topFinGrpNo: string;
  mode: FinlifeSourceResult["mode"];
  raw: unknown;
  reason: string;
}) {
  const mismatch = buildSchemaMismatchError({
    source: "finlife",
    stage: "extract_rows",
    message: "FINLIFE 응답 형식이 바뀌어 데이터를 읽지 못했습니다. 잠시 후 다시 시도해주세요.",
    raw: input.raw,
    rowPathHints: ["result.baseList", "result.optionList"],
    note: `kind=${input.kind};mode=${input.mode};pageNo=${input.pageNo};topFinGrpNo=${input.topFinGrpNo};reason=${input.reason}`,
  });
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
    error: mismatch,
  } satisfies FinlifeSourceResult;
}

function extractAndNormalize(input: {
  kind: FinlifeKind;
  pageNo: number;
  topFinGrpNo: string;
  mode: FinlifeSourceResult["mode"];
  raw: unknown;
}): {
  baseList: unknown[];
  optionList: unknown[];
  data: FinlifeSourceResult["data"];
  pagingMeta: ReturnType<typeof extractPagingMeta>;
  mismatch: FinlifeSourceResult | null;
} {
  const root = isRecord(input.raw) ? input.raw : null;
  const result = root && isRecord(root.result) ? root.result : null;
  if (!result) {
    return {
      baseList: [],
      optionList: [],
      data: [],
      pagingMeta: extractPagingMeta(input.raw),
      mismatch: buildFinlifeSchemaMismatch({
        kind: input.kind,
        pageNo: input.pageNo,
        topFinGrpNo: input.topFinGrpNo,
        mode: input.mode,
        raw: input.raw,
        reason: "missing_result",
      }),
    };
  }

  const hasBaseList = Object.prototype.hasOwnProperty.call(result, "baseList");
  const hasOptionList = Object.prototype.hasOwnProperty.call(result, "optionList");
  const baseListRaw = result.baseList;
  const optionListRaw = result.optionList;
  if (hasBaseList && !Array.isArray(baseListRaw)) {
    return {
      baseList: [],
      optionList: [],
      data: [],
      pagingMeta: extractPagingMeta(input.raw),
      mismatch: buildFinlifeSchemaMismatch({
        kind: input.kind,
        pageNo: input.pageNo,
        topFinGrpNo: input.topFinGrpNo,
        mode: input.mode,
        raw: input.raw,
        reason: "baseList_not_array",
      }),
    };
  }
  if (hasOptionList && !Array.isArray(optionListRaw)) {
    return {
      baseList: [],
      optionList: [],
      data: [],
      pagingMeta: extractPagingMeta(input.raw),
      mismatch: buildFinlifeSchemaMismatch({
        kind: input.kind,
        pageNo: input.pageNo,
        topFinGrpNo: input.topFinGrpNo,
        mode: input.mode,
        raw: input.raw,
        reason: "optionList_not_array",
      }),
    };
  }
  if (!hasBaseList && !hasOptionList) {
    return {
      baseList: [],
      optionList: [],
      data: [],
      pagingMeta: extractPagingMeta(input.raw),
      mismatch: buildFinlifeSchemaMismatch({
        kind: input.kind,
        pageNo: input.pageNo,
        topFinGrpNo: input.topFinGrpNo,
        mode: input.mode,
        raw: input.raw,
        reason: "missing_baseList_optionList",
      }),
    };
  }

  const baseList = Array.isArray(baseListRaw) ? baseListRaw : [];
  const optionList = Array.isArray(optionListRaw) ? optionListRaw : [];
  const containsObjectRows = baseList.some((row) => isRecord(row)) || optionList.some((row) => isRecord(row));
  if ((baseList.length > 0 || optionList.length > 0) && !containsObjectRows) {
    return {
      baseList,
      optionList,
      data: [],
      pagingMeta: extractPagingMeta(input.raw),
      mismatch: buildFinlifeSchemaMismatch({
        kind: input.kind,
        pageNo: input.pageNo,
        topFinGrpNo: input.topFinGrpNo,
        mode: input.mode,
        raw: input.raw,
        reason: "rows_not_object",
      }),
    };
  }

  const pagingMeta = extractPagingMeta(input.raw);

  return {
    baseList,
    optionList,
    data: normalizeFinlifeProducts({ baseList, optionList }),
    pagingMeta,
    mismatch: null,
  };
}

function mergeProducts(rows: FinlifeSourceResult["data"]): FinlifeSourceResult["data"] {
  const merged = new Map<string, FinlifeSourceResult["data"][number]>();
  for (const item of rows) {
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
  }
  return [...merged.values()];
}

function buildScanAllPayload(params: {
  kind: FinlifeKind;
  topFinGrpNo: string;
  mode: FinlifeSourceResult["mode"];
  pageResults: FinlifeSourceResult[];
  truncatedByMaxPages: boolean;
}): FinlifeSourceResult {
  const flattened = params.pageResults.flatMap((page) => page.data);
  const mergedData = mergeProducts(flattened);
  const totalOptions = mergedData.reduce((sum, item) => sum + item.options.length, 0);
  const optionsMissingCount = mergedData.filter((item) => item.options.length === 0).length;
  const first = params.pageResults[0];
  return {
    ok: true,
    mode: first?.mode ?? params.mode,
    meta: {
      kind: params.kind,
      pageNo: 1,
      topFinGrpNo: params.topFinGrpNo,
      fallbackUsed: params.pageResults.some((page) => page.meta.fallbackUsed),
      message: params.truncatedByMaxPages ? "페이지 상한으로 일부 결과만 포함되었습니다." : first?.meta.message,
      hasNext: false,
      nextPage: null,
      totalCount: first?.meta.totalCount,
      nowPage: params.pageResults.length,
      maxPage: first?.meta.maxPage,
      errCd: first?.meta.errCd,
      errMsg: first?.meta.errMsg,
      pagesFetched: params.pageResults.length,
      totalProducts: mergedData.length,
      totalOptions,
      truncatedByMaxPages: params.truncatedByMaxPages,
      optionsMissingCount,
    },
    data: mergedData,
    raw: params.pageResults.map((page) => page.raw),
  };
}

export async function getFinlifeProducts(kind: FinlifeKind, params: FinlifeParams = {}): Promise<FinlifeSourceResult> {
  const required = getRequiredParams(params);
  const ttl = Number(process.env.FINLIFE_CACHE_TTL_SECONDS ?? 43200);
  const mode = parseMode();

  if (params.scan === "all") {
    const hardCapRaw = Number(process.env.FINLIFE_SCAN_HARD_CAP_PAGES ?? 80);
    const hardCap = Number.isFinite(hardCapRaw) && hardCapRaw > 0 ? Math.trunc(hardCapRaw) : 80;
    const requestedMaxPages = required.scanMaxPages === "auto"
      ? hardCap
      : Number.isFinite(required.scanMaxPages) && Number(required.scanMaxPages) > 0
        ? Math.min(hardCap, Math.trunc(Number(required.scanMaxPages)))
        : hardCap;
    const scanCacheKey = `${kind}:${required.topFinGrpNo}:scan-all:${mode}:${required.scanMaxPages ?? "auto"}`;
    const cached = cache.get(scanCacheKey);
    if (cached) return cached;

    const pageResults: FinlifeSourceResult[] = [];
    let truncatedByMaxPages = false;
    let effectiveMaxPages = requestedMaxPages;
    for (let pageNo = 1; pageNo <= effectiveMaxPages; pageNo += 1) {
      const page = await getFinlifeProducts(kind, { topFinGrpNo: required.topFinGrpNo, pageNo });
      if (!page.ok) return page;
      pageResults.push(page);
      if (
        pageNo === 1 &&
        required.scanMaxPages === "auto" &&
        typeof page.meta.maxPage === "number" &&
        Number.isFinite(page.meta.maxPage) &&
        page.meta.maxPage > 0
      ) {
        effectiveMaxPages = Math.min(requestedMaxPages, Math.trunc(page.meta.maxPage));
      }
      if (!page.meta.hasNext) break;
      if (pageNo === effectiveMaxPages) truncatedByMaxPages = true;
    }

    const payload = buildScanAllPayload({
      kind,
      topFinGrpNo: required.topFinGrpNo,
      mode: mode === "auto" ? "mock" : mode,
      pageResults,
      truncatedByMaxPages,
    });
    cache.set(scanCacheKey, payload, ttl);
    return payload;
  }

  const cacheKey = `${kind}:${required.topFinGrpNo}:${required.pageNo}:${parseMode()}`;
  const hit = cache.get(cacheKey);

  if (hit) {
    return hit;
  }

  const keyExists = Boolean(process.env.FINLIFE_API_KEY);
  const shouldTryLive = mode === "live" || (mode === "auto" && keyExists);
  const fixtureKey = buildFixtureKey({ scope: "product", kind, topFinGrpNo: required.topFinGrpNo, pageNo: required.pageNo });

  if (mode === "fixture") {
    const raw = readFinlifeFixture(fixtureKey);
    if (!raw) {
      return {
        ok: false,
        mode: "fixture",
        meta: {
          kind,
          pageNo: required.pageNo,
          topFinGrpNo: required.topFinGrpNo,
          fallbackUsed: false,
          message: `fixture missing: ${fixtureKey} (scripts/smoke/finlife-sample.mjs --record)`,
        },
        data: [],
        error: {
          code: "FIXTURE_MISSING",
          message: "오프라인 fixture 데이터가 없어 요청을 처리하지 못했습니다.",
        },
      };
    }
    const normalized = extractAndNormalize({
      kind,
      pageNo: required.pageNo,
      topFinGrpNo: required.topFinGrpNo,
      mode: "fixture",
      raw,
    });
    if (normalized.mismatch) {
      console.error("[finlife] schema mismatch", normalized.mismatch.error?.diagnostics ?? {});
      return normalized.mismatch;
    }
    const payload: FinlifeSourceResult = {
      ok: true,
      mode: "fixture",
      meta: {
        kind,
        pageNo: required.pageNo,
        topFinGrpNo: required.topFinGrpNo,
        fallbackUsed: false,
        totalCount: normalized.pagingMeta.totalCount,
        nowPage: normalized.pagingMeta.nowPage,
        maxPage: normalized.pagingMeta.maxPage,
        errCd: normalized.pagingMeta.errCd,
        errMsg: normalized.pagingMeta.errMsg,
        hasNext:
          normalized.pagingMeta.nowPage !== undefined && normalized.pagingMeta.maxPage !== undefined
            ? normalized.pagingMeta.nowPage < normalized.pagingMeta.maxPage
            : normalized.data.length > 0,
        nextPage:
          normalized.pagingMeta.nowPage !== undefined && normalized.pagingMeta.maxPage !== undefined
            ? normalized.pagingMeta.nowPage < normalized.pagingMeta.maxPage
              ? normalized.pagingMeta.nowPage + 1
              : null
            : normalized.data.length > 0
              ? required.pageNo + 1
              : null,
      },
      data: normalized.data,
      raw,
    };
    cache.set(cacheKey, payload, ttl);
    return payload;
  }

  if (mode === "live" && !keyExists) {
    return {
      ok: false,
      mode: "live",
      meta: {
        kind,
        pageNo: required.pageNo,
        topFinGrpNo: required.topFinGrpNo,
        fallbackUsed: false,
      },
      data: [],
      error: {
        code: "MISSING_API_KEY",
        message: "FINLIFE_MODE=live 이지만 FINLIFE_API_KEY가 설정되지 않았습니다.",
      },
    };
  }

  if (!shouldTryLive) {
    const raw = fetchMockFinlife(kind);
    const normalized = extractAndNormalize({
      kind,
      pageNo: required.pageNo,
      topFinGrpNo: required.topFinGrpNo,
      mode: "mock",
      raw,
    });
    if (normalized.mismatch) {
      console.error("[finlife] schema mismatch", normalized.mismatch.error?.diagnostics ?? {});
      return normalized.mismatch;
    }
    const payload: FinlifeSourceResult = {
      ok: true,
      mode: "mock",
      meta: {
        kind,
        pageNo: required.pageNo,
        topFinGrpNo: required.topFinGrpNo,
        fallbackUsed: false,
        message: "모의 데이터 모드",
        totalCount: normalized.pagingMeta.totalCount,
        nowPage: normalized.pagingMeta.nowPage,
        maxPage: normalized.pagingMeta.maxPage,
        errCd: normalized.pagingMeta.errCd,
        errMsg: normalized.pagingMeta.errMsg,
        hasNext:
          normalized.pagingMeta.nowPage !== undefined && normalized.pagingMeta.maxPage !== undefined
            ? normalized.pagingMeta.nowPage < normalized.pagingMeta.maxPage
            : normalized.data.length > 0,
        nextPage:
          normalized.pagingMeta.nowPage !== undefined && normalized.pagingMeta.maxPage !== undefined
            ? normalized.pagingMeta.nowPage < normalized.pagingMeta.maxPage
              ? normalized.pagingMeta.nowPage + 1
              : null
            : normalized.data.length > 0
              ? required.pageNo + 1
              : null,
      },
      data: normalized.data,
      raw: raw,
    };
    cache.set(cacheKey, payload, ttl);
    return payload;
  }

  try {
    const raw = await fetchLiveFinlife(kind, required);
    if (process.env.FINLIFE_RECORD_FIXTURES === "1" && (process.env.NODE_ENV ?? "development") !== "production") {
      try {
        writeFinlifeFixture(fixtureKey, {
          fetchedAt: new Date().toISOString(),
          scope: "product",
          kind,
          params: { topFinGrpNo: required.topFinGrpNo, pageNo: required.pageNo },
          raw,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[finlife-fixture] write failed", { kind, pageNo: required.pageNo, topFinGrpNo: required.topFinGrpNo, message });
      }
    }
    const normalized = extractAndNormalize({
      kind,
      pageNo: required.pageNo,
      topFinGrpNo: required.topFinGrpNo,
      mode: "live",
      raw,
    });
    if (normalized.mismatch) {
      console.error("[finlife] schema mismatch", normalized.mismatch.error?.diagnostics ?? {});
      return normalized.mismatch;
    }
    const payload: FinlifeSourceResult = {
      ok: true,
      mode: "live",
      meta: {
        kind,
        pageNo: required.pageNo,
        topFinGrpNo: required.topFinGrpNo,
        fallbackUsed: false,
        totalCount: normalized.pagingMeta.totalCount,
        nowPage: normalized.pagingMeta.nowPage,
        maxPage: normalized.pagingMeta.maxPage,
        errCd: normalized.pagingMeta.errCd,
        errMsg: normalized.pagingMeta.errMsg,
        hasNext:
          normalized.pagingMeta.nowPage !== undefined && normalized.pagingMeta.maxPage !== undefined
            ? normalized.pagingMeta.nowPage < normalized.pagingMeta.maxPage
            : normalized.data.length > 0,
        nextPage:
          normalized.pagingMeta.nowPage !== undefined && normalized.pagingMeta.maxPage !== undefined
            ? normalized.pagingMeta.nowPage < normalized.pagingMeta.maxPage
              ? normalized.pagingMeta.nowPage + 1
              : null
            : normalized.data.length > 0
              ? required.pageNo + 1
              : null,
      },
      data: normalized.data,
      raw,
    };
    cache.set(cacheKey, payload, ttl);
    return payload;
  } catch {
    if (fallbackEnabled()) {
      const raw = fetchMockFinlife(kind);
      const normalized = extractAndNormalize({
        kind,
        pageNo: required.pageNo,
        topFinGrpNo: required.topFinGrpNo,
        mode: "mock",
        raw,
      });
      if (normalized.mismatch) {
        console.error("[finlife] schema mismatch", normalized.mismatch.error?.diagnostics ?? {});
        return normalized.mismatch;
      }
      const payload: FinlifeSourceResult = {
        ok: true,
        mode: "mock",
        meta: {
          kind,
          pageNo: required.pageNo,
          topFinGrpNo: required.topFinGrpNo,
          fallbackUsed: true,
          message: "실시간 데이터 실패로 모의 데이터로 전환되었습니다.",
          totalCount: normalized.pagingMeta.totalCount,
          nowPage: normalized.pagingMeta.nowPage,
          maxPage: normalized.pagingMeta.maxPage,
          errCd: normalized.pagingMeta.errCd,
          errMsg: normalized.pagingMeta.errMsg,
          hasNext:
            normalized.pagingMeta.nowPage !== undefined && normalized.pagingMeta.maxPage !== undefined
              ? normalized.pagingMeta.nowPage < normalized.pagingMeta.maxPage
              : normalized.data.length > 0,
          nextPage:
            normalized.pagingMeta.nowPage !== undefined && normalized.pagingMeta.maxPage !== undefined
              ? normalized.pagingMeta.nowPage < normalized.pagingMeta.maxPage
                ? normalized.pagingMeta.nowPage + 1
                : null
              : normalized.data.length > 0
                ? required.pageNo + 1
                : null,
        },
        data: normalized.data,
        raw,
      };
      cache.set(cacheKey, payload, ttl);
      return payload;
    }

    return {
      ok: false,
      mode: "live",
      meta: {
        kind,
        pageNo: required.pageNo,
        topFinGrpNo: required.topFinGrpNo,
        fallbackUsed: false,
      },
      data: [],
      error: {
        code: "LIVE_FETCH_FAILED",
        message: "실시간 데이터를 가져오지 못했습니다. 잠시 후 다시 시도하세요.",
      },
    };
  }
}

export const __test__ = {
  mergeProducts,
  buildScanAllPayload,
};
