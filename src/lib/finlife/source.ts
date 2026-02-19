import { MemoryCache } from "@/lib/cache/memoryCache";
import { fetchLiveFinlife } from "@/lib/finlife/fetchLive";
import { fetchMockFinlife } from "@/lib/finlife/fetchMock";
import { normalizeFinlifeProducts } from "@/lib/finlife/normalize";
import { type FinlifeKind, type FinlifeParams, type FinlifeSourceResult } from "@/lib/finlife/types";

type RawResult = {
  result?: {
    baseList?: unknown[];
    optionList?: unknown[];
  };
};

const cache = new MemoryCache<FinlifeSourceResult>();

function getRequiredParams(params: FinlifeParams): Required<FinlifeParams> {
  const parsedPageNo = Number(params.pageNo ?? 1);
  return {
    pageNo: Number.isFinite(parsedPageNo) && parsedPageNo > 0 ? parsedPageNo : 1,
    topFinGrpNo: params.topFinGrpNo ?? "020000",
  };
}

function parseMode(): "auto" | "mock" | "live" {
  const mode = process.env.FINLIFE_MODE;
  if (mode === "mock" || mode === "live") return mode;
  return "auto";
}

function fallbackEnabled(): boolean {
  return process.env.FINLIFE_FALLBACK_TO_MOCK !== "0";
}

function extractAndNormalize(raw: unknown) {
  const result = (raw as RawResult)?.result ?? {};
  const baseList = Array.isArray(result.baseList) ? result.baseList : [];
  const optionList = Array.isArray(result.optionList) ? result.optionList : [];

  return {
    baseList,
    optionList,
    data: normalizeFinlifeProducts({ baseList, optionList }),
  };
}

export async function getFinlifeProducts(kind: FinlifeKind, params: FinlifeParams = {}): Promise<FinlifeSourceResult> {
  const required = getRequiredParams(params);
  const cacheKey = `${kind}:${required.topFinGrpNo}:${required.pageNo}:${parseMode()}`;
  const ttl = Number(process.env.FINLIFE_CACHE_TTL_SECONDS ?? 43200);
  const hit = cache.get(cacheKey);

  if (hit) {
    return hit;
  }

  const mode = parseMode();
  const keyExists = Boolean(process.env.FINLIFE_API_KEY);
  const shouldTryLive = mode === "live" || (mode === "auto" && keyExists);

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
    const normalized = extractAndNormalize(raw);
    const payload: FinlifeSourceResult = {
      ok: true,
      mode: "mock",
      meta: {
        kind,
        pageNo: required.pageNo,
        topFinGrpNo: required.topFinGrpNo,
        fallbackUsed: false,
        message: "모의 데이터 모드",
      },
      data: normalized.data,
      raw: raw,
    };
    cache.set(cacheKey, payload, ttl);
    return payload;
  }

  try {
    const raw = await fetchLiveFinlife(kind, required);
    const normalized = extractAndNormalize(raw);
    const payload: FinlifeSourceResult = {
      ok: true,
      mode: "live",
      meta: {
        kind,
        pageNo: required.pageNo,
        topFinGrpNo: required.topFinGrpNo,
        fallbackUsed: false,
      },
      data: normalized.data,
      raw,
    };
    cache.set(cacheKey, payload, ttl);
    return payload;
  } catch {
    if (fallbackEnabled()) {
      const raw = fetchMockFinlife(kind);
      const normalized = extractAndNormalize(raw);
      const payload: FinlifeSourceResult = {
        ok: true,
        mode: "mock",
        meta: {
          kind,
          pageNo: required.pageNo,
          topFinGrpNo: required.topFinGrpNo,
          fallbackUsed: true,
          message: "실시간 데이터 실패로 모의 데이터로 전환되었습니다.",
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
