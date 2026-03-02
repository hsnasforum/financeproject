import { MemoryCache } from "../cache/memoryCache";
import { fetchLiveFinlifeCompany } from "./fetchLive";
import { fetchMockFinlifeCompany } from "./fetchMock";
import { buildFixtureKey, readFinlifeFixture, writeFinlifeFixture } from "./fixtures";
import { extractPagingMeta } from "./meta";
import { normalizeFinlifeCompanies } from "./normalizeCompany";
import { type FinlifeCompanyResult, type FinlifeParams } from "./types";

type CompanyRawResult = {
  result?: {
    baseList?: unknown[];
  };
};

const cache = new MemoryCache<FinlifeCompanyResult>();

function getRequiredParams(params: FinlifeParams): Required<FinlifeParams> {
  const parsedPageNo = Number(params.pageNo ?? 1);
  return {
    pageNo: Number.isFinite(parsedPageNo) && parsedPageNo > 0 ? parsedPageNo : 1,
    topFinGrpNo: params.topFinGrpNo ?? "020000",
    scan: params.scan ?? "all",
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

function extractAndNormalize(raw: unknown) {
  const result = (raw as CompanyRawResult)?.result ?? {};
  const baseList = Array.isArray(result.baseList) ? result.baseList : [];
  const pagingMeta = extractPagingMeta(raw);
  return {
    baseList,
    data: normalizeFinlifeCompanies({ baseList }),
    pagingMeta,
  };
}

export async function getFinlifeCompanies(params: FinlifeParams = {}): Promise<FinlifeCompanyResult> {
  const required = getRequiredParams(params);
  const cacheKey = `company:${required.topFinGrpNo}:${required.pageNo}:${parseMode()}`;
  const ttl = Number(process.env.FINLIFE_CACHE_TTL_SECONDS ?? 43200);
  const hit = cache.get(cacheKey);

  if (hit) return hit;

  const mode = parseMode();
  const keyExists = Boolean(process.env.FINLIFE_API_KEY);
  const shouldTryLive = mode === "live" || (mode === "auto" && keyExists);
  const fixtureKey = buildFixtureKey({ scope: "company", topFinGrpNo: required.topFinGrpNo, pageNo: required.pageNo });

  if (mode === "fixture") {
    const raw = readFinlifeFixture(fixtureKey);
    if (!raw) {
      return {
        ok: false,
        mode: "fixture",
        meta: {
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
    const normalized = extractAndNormalize(raw);
    const payload: FinlifeCompanyResult = {
      ok: true,
      mode: "fixture",
      meta: {
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
    const raw = fetchMockFinlifeCompany();
    const normalized = extractAndNormalize(raw);
    const payload: FinlifeCompanyResult = {
      ok: true,
      mode: "mock",
      meta: {
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
      raw,
    };
    cache.set(cacheKey, payload, ttl);
    return payload;
  }

  try {
    const raw = await fetchLiveFinlifeCompany(required);
    if (process.env.FINLIFE_RECORD_FIXTURES === "1" && (process.env.NODE_ENV ?? "development") !== "production") {
      try {
        writeFinlifeFixture(fixtureKey, {
          fetchedAt: new Date().toISOString(),
          scope: "company",
          params: { topFinGrpNo: required.topFinGrpNo, pageNo: required.pageNo },
          raw,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[finlife-fixture] write failed", { scope: "company", pageNo: required.pageNo, topFinGrpNo: required.topFinGrpNo, message });
      }
    }
    const normalized = extractAndNormalize(raw);
    const payload: FinlifeCompanyResult = {
      ok: true,
      mode: "live",
      meta: {
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
      const raw = fetchMockFinlifeCompany();
      const normalized = extractAndNormalize(raw);
      const payload: FinlifeCompanyResult = {
        ok: true,
        mode: "mock",
        meta: {
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
