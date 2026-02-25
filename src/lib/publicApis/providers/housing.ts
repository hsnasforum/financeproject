import housingSalesMock from "@/data/public/housing-sales.mock.json";
import { toWonFromManwon } from "@/lib/housing/money";
import { fetchExternal, requireServerEnv } from "@/lib/http/fetchExternal";
import { type HousingBenchmark, type PublicApiResult } from "@/lib/publicApis/contracts/types";
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
    fetchedAt: new Date().toISOString(),
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

export async function getHousingSalesBenchmark(regionCode: string, month: string, areaBand: string): Promise<PublicApiResult<HousingBenchmark>> {
  const useMock = process.env.PUBLIC_APIS_FALLBACK_TO_MOCK !== "0" && !process.env.MOLIT_SALES_API_KEY;
  if (useMock) {
    return {
      ok: true,
      data: {
        ...housingSalesMock,
        regionCode,
        month,
        areaBand,
        dealType: "SALE",
        source: "국토교통부(mock)",
        fetchedAt: new Date().toISOString(),
      } as HousingBenchmark,
    };
  }

  try {
    const key = requireServerEnv("MOLIT_SALES_API_KEY");
    const base = normalizeBaseUrl(process.env.MOLIT_SALES_API_URL ?? "", "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade");
    const endpoint = buildEndpoint(base, "getRTMSDataSvcAptTrade");
    const url = buildApiUrl(endpoint, key, { LAWD_CD: regionCode, DEAL_YMD: month, numOfRows: "100", pageNo: "1" });

    const fetched = await fetchExternal(url);
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

    return { ok: true, data: toBenchmark(regionCode, month, areaBand, values, "국토교통부", "SALE") };
  } catch (error) {
    if (process.env.PUBLIC_APIS_FALLBACK_TO_MOCK !== "0") {
      return {
        ok: true,
        data: {
          ...housingSalesMock,
          regionCode,
          month,
          areaBand,
          dealType: "SALE",
          source: "국토교통부(mock)",
          fetchedAt: new Date().toISOString(),
        } as HousingBenchmark,
      };
    }
    const message = error instanceof Error ? error.message : "실거래 데이터를 가져오지 못했습니다.";
    return { ok: false, error: { code: "UPSTREAM", message } };
  }
}

export async function getHousingRentBenchmark(regionCode: string, month: string, areaBand: string): Promise<PublicApiResult<HousingBenchmark>> {
  const useMock = process.env.PUBLIC_APIS_FALLBACK_TO_MOCK !== "0" && !process.env.MOLIT_RENT_API_KEY;
  if (useMock) {
    const base = housingSalesMock.median;
    return {
      ok: true,
      data: {
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
        source: "국토교통부 전월세(mock)",
        fetchedAt: new Date().toISOString(),
      } as HousingBenchmark,
    };
  }

  try {
    const key = requireServerEnv("MOLIT_RENT_API_KEY");
    const base = normalizeBaseUrl(process.env.MOLIT_RENT_API_URL ?? process.env.MOLIT_SALES_API_URL ?? "", "https://apis.data.go.kr/1613000/RTMSDataSvcAptRent");
    const endpoint = buildEndpoint(base, "getRTMSDataSvcAptRent");
    const url = buildApiUrl(endpoint, key, { LAWD_CD: regionCode, DEAL_YMD: month, numOfRows: "200", pageNo: "1" });

    const fetched = await fetchExternal(url);
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
        source: "국토교통부 전월세",
        fetchedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    if (process.env.PUBLIC_APIS_FALLBACK_TO_MOCK !== "0") {
      const base = housingSalesMock.median;
      return {
        ok: true,
        data: {
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
          source: "국토교통부 전월세(mock)",
          fetchedAt: new Date().toISOString(),
        } as HousingBenchmark,
      };
    }
    const message = error instanceof Error ? error.message : "전월세 데이터를 가져오지 못했습니다.";
    return { ok: false, error: { code: "UPSTREAM", message } };
  }
}
