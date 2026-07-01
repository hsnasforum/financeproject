import housingSalesMock from "@/data/public/housing-sales.mock.json";
import { toWonFromManwon } from "@/lib/housing/money";
import { ExternalApiError, fetchExternal, requireServerEnv } from "../../http/fetchExternal";
import { type DataProvenance, type HousingBenchmark, type PublicApiResult } from "@/lib/publicApis/contracts/types";
import {
  buildApiUrl,
  buildEndpoint,
  extractRentRowsFromRows,
  extractSaleAmountsFromRows,
  filterRowsByAreaBand,
  getMolitHeader,
  getMolitItems,
  isMolitSuccessCode,
  normalizeBaseUrl,
} from "@/lib/publicApis/providers/molitNormalize";

const DEFAULT_MOLIT_SALES_BASE = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade";
const FALLBACK_SUMMARY_STATUSES = new Set([401, 403, 404]);
const SALES_SOURCE_LABEL = "국토교통부";
const RENT_SOURCE_LABEL = "국토교통부 전월세";

function nowIso(): string {
  return new Date().toISOString();
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

function toBenchmark(regionCode: string, month: string, areaBand: string, values: number[], source: string, dealType: "SALE" | "RENT"): HousingBenchmark {
  const sorted = values.slice().sort((a, b) => a - b);
  return {
    regionCode,
    month,
    areaBand,
    dealType,
    count: sorted.length,
    min: sorted[0] ?? 0,
    median: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    max: sorted[sorted.length - 1] ?? 0,
    unit: "KRW",
    source,
    fetchedAt: nowIso(),
  };
}

function toNumbers(values: number[]): { min: number; median: number; p75: number; max: number } {
  const sorted = values.slice().sort((a, b) => a - b);
  return {
    min: sorted[0] ?? 0,
    median: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    max: sorted[sorted.length - 1] ?? 0,
  };
}

function resolveSalesEndpointName(base: string): string {
  return /RTMSDataSvcAptTradeDev/i.test(base) ? "getRTMSDataSvcAptTradeDev" : "getRTMSDataSvcAptTrade";
}

function resolveSalesSummaryFallbackBase(base: string): string | null {
  if (!/RTMSDataSvcAptTradeDev/i.test(base)) return null;
  return base.replace(/RTMSDataSvcAptTradeDev/gi, "RTMSDataSvcAptTrade");
}

function shouldRetrySalesSummary(base: string, error: unknown): boolean {
  return Boolean(
    resolveSalesSummaryFallbackBase(base)
    && error instanceof ExternalApiError
    && typeof error.status === "number"
    && FALLBACK_SUMMARY_STATUSES.has(error.status),
  );
}

function provenanceMeta(input: {
  mode: DataProvenance["mode"];
  source: string;
  asOf: string;
  degraded: boolean;
  degradedReason?: string | undefined;
  upstreamStatus?: number | undefined;
  retryAfterSeconds?: number | undefined;
}): { provenance: DataProvenance } {
  return {
    provenance: {
      mode: input.mode,
      degraded: input.degraded,
      ...(input.degradedReason ? { degradedReason: input.degradedReason } : {}),
      asOf: input.asOf,
      fetchedAt: nowIso(),
      source: input.source,
      ...(typeof input.upstreamStatus === "number" ? { upstreamStatus: input.upstreamStatus } : {}),
      ...(typeof input.retryAfterSeconds === "number" ? { retryAfterSeconds: input.retryAfterSeconds } : {}),
    },
  };
}

function fallbackReason(error: unknown): string {
  if (error instanceof ExternalApiError && error.timeout) return "timeout";
  return "upstream-failure";
}

function fallbackMeta(source: string, month: string, degradedReason: string, error?: unknown): { provenance: DataProvenance } {
  return provenanceMeta({
    mode: "mock",
    source,
    asOf: month,
    degraded: true,
    degradedReason,
    upstreamStatus: error instanceof ExternalApiError ? error.status : undefined,
    retryAfterSeconds: error instanceof ExternalApiError ? error.retryAfterSeconds : undefined,
  });
}

function mockSalesBenchmark(regionCode: string, month: string, areaBand: string): HousingBenchmark {
  return {
    ...housingSalesMock,
    regionCode,
    month,
    areaBand,
    dealType: "SALE",
    source: SALES_SOURCE_LABEL,
    fetchedAt: nowIso(),
  } as HousingBenchmark;
}

function mockRentBenchmark(regionCode: string, month: string, areaBand: string): HousingBenchmark {
  const base = housingSalesMock.median;
  return {
    ...housingSalesMock,
    regionCode,
    month,
    areaBand,
    dealType: "RENT",
    rentType: "ALL",
    monthlyMin: Math.round(base * 0.0001),
    monthlyMedian: Math.round(base * 0.00013),
    monthlyP75: Math.round(base * 0.00016),
    monthlyMax: Math.round(base * 0.0002),
    source: RENT_SOURCE_LABEL,
    fetchedAt: nowIso(),
  } as HousingBenchmark;
}

async function fetchHousingSalesBody(base: string, key: string, params: Record<string, string>, options?: { allowHttpError?: boolean }) {
  const endpoint = buildEndpoint(base, resolveSalesEndpointName(base));
  const url = buildApiUrl(endpoint, key, params);
  const fetched = await fetchExternal(url, {
    sourceKey: "housing:sales",
    timeoutMs: 12_000,
    retries: 2,
    retryOn: [429, 500, 502, 503, 504],
    throwOnHttpError: options?.allowHttpError ? false : undefined,
  });
  if (!fetched.ok) {
    throw new ExternalApiError(
      { code: "UPSTREAM", message: "외부 API 호출에 실패했습니다." },
      { status: fetched.status, retryAfterSeconds: fetched.retryAfterSeconds },
    );
  }
  return fetched;
}

export async function getHousingSalesBenchmark(regionCode: string, month: string, areaBand: string): Promise<PublicApiResult<HousingBenchmark>> {
  const fallbackToMock = process.env.PUBLIC_APIS_FALLBACK_TO_MOCK !== "0";
  const hasApiKey = Boolean((process.env.MOLIT_SALES_API_KEY ?? "").trim());
  if (!hasApiKey) {
    if (fallbackToMock) {
      return {
        ok: true,
        data: mockSalesBenchmark(regionCode, month, areaBand),
        meta: fallbackMeta(SALES_SOURCE_LABEL, month, "env-missing"),
      };
    }
    return { ok: false, error: { code: "CONFIG", message: "MOLIT_SALES_API_KEY 설정이 필요합니다." } };
  }

  try {
    const key = requireServerEnv("MOLIT_SALES_API_KEY");
    const base = normalizeBaseUrl(process.env.MOLIT_SALES_API_URL ?? "", DEFAULT_MOLIT_SALES_BASE);
    const params = { LAWD_CD: regionCode, DEAL_YMD: month, numOfRows: "100", pageNo: "1" };
    let fetched;
    let usedSummaryFallback = false;
    try {
      fetched = await fetchHousingSalesBody(base, key, params, { allowHttpError: Boolean(resolveSalesSummaryFallbackBase(base)) });
    } catch (error) {
      const fallbackBase = resolveSalesSummaryFallbackBase(base);
      if (!fallbackBase || !shouldRetrySalesSummary(base, error)) throw error;
      console.warn("[housing:sales] detail endpoint unavailable; retrying summary endpoint", {
        status: error instanceof ExternalApiError ? error.status : undefined,
      });
      fetched = await fetchHousingSalesBody(fallbackBase, key, params);
      usedSummaryFallback = true;
    }
    const header = getMolitHeader(fetched.body);
    if (header.resultCode && !isMolitSuccessCode(header.resultCode)) {
      const detail = header.resultMsg ? `: ${header.resultMsg}` : "";
      return { ok: false, error: { code: "UPSTREAM", message: `실거래 API 오류(${header.resultCode})${detail}` } };
    }

    const rows = filterRowsByAreaBand(getMolitItems(fetched.body), areaBand, 10);
    const values = toWonFromManwon(extractSaleAmountsFromRows(rows));
    if (!values.length) {
      return { ok: false, error: { code: "UPSTREAM", message: "해당 면적대 실거래 데이터를 찾지 못했습니다." } };
    }

    return {
      ok: true,
      data: toBenchmark(regionCode, month, areaBand, values, SALES_SOURCE_LABEL, "SALE"),
      meta: provenanceMeta({
        mode: "live",
        source: SALES_SOURCE_LABEL,
        asOf: month,
        degraded: usedSummaryFallback,
        degradedReason: usedSummaryFallback ? "endpoint-fallback" : undefined,
      }),
    };
  } catch (error) {
    if (fallbackToMock) {
      return {
        ok: true,
        data: mockSalesBenchmark(regionCode, month, areaBand),
        meta: fallbackMeta(SALES_SOURCE_LABEL, month, fallbackReason(error), error),
      };
    }
    const message = error instanceof Error ? error.message : "실거래 데이터를 가져오지 못했습니다.";
    const code = error instanceof ExternalApiError ? error.detail.code : "UPSTREAM";
    return { ok: false, error: { code, message } };
  }
}

export async function getHousingRentBenchmark(regionCode: string, month: string, areaBand: string): Promise<PublicApiResult<HousingBenchmark>> {
  const fallbackToMock = process.env.PUBLIC_APIS_FALLBACK_TO_MOCK !== "0";
  const hasApiKey = Boolean((process.env.MOLIT_RENT_API_KEY ?? "").trim());
  if (!hasApiKey) {
    if (fallbackToMock) {
      return {
        ok: true,
        data: mockRentBenchmark(regionCode, month, areaBand),
        meta: fallbackMeta(RENT_SOURCE_LABEL, month, "env-missing"),
      };
    }
    return { ok: false, error: { code: "CONFIG", message: "MOLIT_RENT_API_KEY 설정이 필요합니다." } };
  }

  try {
    const key = requireServerEnv("MOLIT_RENT_API_KEY");
    const base = normalizeBaseUrl(process.env.MOLIT_RENT_API_URL ?? process.env.MOLIT_SALES_API_URL ?? "", "https://apis.data.go.kr/1613000/RTMSDataSvcAptRent");
    const endpoint = buildEndpoint(base, "getRTMSDataSvcAptRent");
    const url = buildApiUrl(endpoint, key, { LAWD_CD: regionCode, DEAL_YMD: month, numOfRows: "200", pageNo: "1" });

    const fetched = await fetchExternal(url, {
      sourceKey: "housing:rent",
      timeoutMs: 12_000,
      retries: 2,
      retryOn: [429, 500, 502, 503, 504],
    });
    const header = getMolitHeader(fetched.body);
    if (header.resultCode && !isMolitSuccessCode(header.resultCode)) {
      const detail = header.resultMsg ? `: ${header.resultMsg}` : "";
      return { ok: false, error: { code: "UPSTREAM", message: `전월세 API 오류(${header.resultCode})${detail}` } };
    }

    const rows = extractRentRowsFromRows(filterRowsByAreaBand(getMolitItems(fetched.body), areaBand, 10));
    if (!rows.length) {
      return { ok: false, error: { code: "UPSTREAM", message: "해당 면적대 전월세 데이터를 찾지 못했습니다." } };
    }

    const deposits = toWonFromManwon(rows.map((r) => r.deposit));
    const monthly = toWonFromManwon(rows.map((r) => r.monthly));
    const depositStats = toNumbers(deposits);
    const monthlyStats = monthly.length ? toNumbers(monthly) : null;

    return {
      ok: true,
      data: {
        regionCode,
        month,
        areaBand,
        dealType: "RENT",
        count: rows.length,
        min: depositStats.min,
        median: depositStats.median,
        p75: depositStats.p75,
        max: depositStats.max,
        monthlyMin: monthlyStats?.min,
        monthlyMedian: monthlyStats?.median,
        monthlyP75: monthlyStats?.p75,
        monthlyMax: monthlyStats?.max,
        rentType: monthlyStats && monthlyStats.max > 0 ? "ALL" : "JEONSE",
        unit: "KRW",
        source: RENT_SOURCE_LABEL,
        fetchedAt: nowIso(),
      },
      meta: provenanceMeta({
        mode: "live",
        source: RENT_SOURCE_LABEL,
        asOf: month,
        degraded: false,
      }),
    };
  } catch (error) {
    if (fallbackToMock) {
      return {
        ok: true,
        data: mockRentBenchmark(regionCode, month, areaBand),
        meta: fallbackMeta(RENT_SOURCE_LABEL, month, fallbackReason(error), error),
      };
    }
    const message = error instanceof Error ? error.message : "전월세 데이터를 가져오지 못했습니다.";
    const code = error instanceof ExternalApiError ? error.detail.code : "UPSTREAM";
    return { ok: false, error: { code, message } };
  }
}
