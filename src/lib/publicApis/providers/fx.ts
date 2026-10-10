import fxMock from "@/data/public/fx.mock.json";
import { ExternalApiError, fetchExternal, requireServerEnv } from "../../http/fetchExternal";
import { type DataProvenance, type ExchangeRateQuote, type PublicApiResult } from "@/lib/publicApis/contracts/types";
import {
  normalizeExchangeQuoteDate,
  validateEximExchangeRows,
} from "./exchangeNormalization";
import { formatKstCompactDate } from "../../format/kstCalendarDate";
import { buildSchemaMismatchError } from "../schemaDrift";

const FX_SOURCE_LABEL = "한국수출입은행";

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeKeximJson(raw: unknown, wanted: Set<string>, requestedDate: string): ExchangeRateQuote[] | null {
  const validated = validateEximExchangeRows(raw, { requestedDate });
  if (!validated) return null;
  const fetchedAt = nowIso();
  return Object.entries(validated.rates)
    .filter(([currency]) => wanted.size === 0 || wanted.has(currency))
    .map(([currency, rate]) => ({
      asOfDate: validated.asOf,
      currency,
      base: "KRW",
      rate,
      source: FX_SOURCE_LABEL,
      fetchedAt,
    }));
}

function fromMock(currencies: string[]): ExchangeRateQuote[] {
  const wanted = new Set(currencies);
  const fetchedAt = nowIso();
  return fxMock.quotes
    .filter((q) => (wanted.size ? wanted.has(q.currency) : true))
    .map((q) => ({
      asOfDate: fxMock.asOfDate,
      currency: q.currency,
      base: "KRW",
      rate: q.rate,
      source: FX_SOURCE_LABEL,
      fetchedAt,
    }));
}

function mockMeta(degradedReason: string, extra?: { upstreamStatus?: number | undefined; retryAfterSeconds?: number | undefined }): { provenance: DataProvenance } {
  const provenance: DataProvenance = {
    mode: "mock",
    degraded: true,
    degradedReason,
    asOf: fxMock.asOfDate,
    fetchedAt: nowIso(),
    source: FX_SOURCE_LABEL,
  };
  if (typeof extra?.upstreamStatus === "number") provenance.upstreamStatus = extra.upstreamStatus;
  if (typeof extra?.retryAfterSeconds === "number") provenance.retryAfterSeconds = extra.retryAfterSeconds;
  return {
    provenance,
  };
}

function liveMeta(quotes: ExchangeRateQuote[]): { provenance: DataProvenance } {
  const provenance: DataProvenance = {
    mode: "live",
    degraded: false,
    fetchedAt: nowIso(),
    source: FX_SOURCE_LABEL,
  };
  if (quotes[0]?.asOfDate) provenance.asOf = quotes[0].asOfDate;
  return {
    provenance,
  };
}

function fallbackReason(error: unknown): string {
  if (error instanceof ExternalApiError && error.timeout) return "timeout";
  return "upstream-failure";
}

export async function getExchangeQuotes(date: string, currencies: string[]): Promise<PublicApiResult<ExchangeRateQuote[]>> {
  const wanted = new Set(currencies.filter(Boolean));
  const fallbackToMock = process.env.PUBLIC_APIS_FALLBACK_TO_MOCK !== "0";
  const hasApiKey = Boolean((process.env.KEXIM_API_KEY ?? "").trim());

  if (!hasApiKey) {
    if (fallbackToMock) {
      return { ok: true, data: fromMock(currencies), meta: mockMeta("env-missing") };
    }
    return { ok: false, error: { code: "CONFIG", message: "KEXIM_API_KEY 설정이 필요합니다." } };
  }

  const today = formatKstCompactDate(new Date());
  const requestedDate = date.trim() || today;
  if (!/^\d{8}$/.test(requestedDate) || !normalizeExchangeQuoteDate(requestedDate) || requestedDate > today) {
    return { ok: false, error: { code: "INPUT", message: "환율 조회일은 오늘 이하의 유효한 YYYYMMDD 날짜여야 합니다." } };
  }

  try {
    const key = requireServerEnv("KEXIM_API_KEY");
    const base = (process.env.KEXIM_FX_API_URL ?? "").trim() || "https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON";
    const params = new URLSearchParams({ authkey: key, data: "AP01", searchdate: requestedDate });

    const fetched = await fetchExternal(`${base}?${params.toString()}`, {
      sourceKey: "fx",
      timeoutMs: 12_000,
      retries: 2,
      retryOn: [429, 500, 502, 503, 504],
    });
    if (fetched.kind !== "json") {
      throw new ExternalApiError(buildSchemaMismatchError({
        source: "exchange",
        stage: "json_parse",
        message: "환율 API 응답 형식이 예상과 다릅니다.",
        raw: { textLength: fetched.text.length },
        endpoint: base,
        contentType: fetched.contentType,
      }), { status: fetched.status, retryAfterSeconds: fetched.retryAfterSeconds });
    }

    const quotes = normalizeKeximJson(fetched.body, wanted, requestedDate);
    if (!quotes || quotes.length === 0) {
      const noData = fetched.body === null
        || (Array.isArray(fetched.body) && fetched.body.length === 0)
        || quotes?.length === 0;
      const detail = noData
        ? { code: "NO_DATA" as const, message: "해당 날짜 환율 데이터가 없습니다." }
        : buildSchemaMismatchError({
          source: "exchange",
          stage: "normalize",
          message: "환율 API 응답 형식이 예상과 달라 데이터를 해석하지 못했습니다.",
          raw: fetched.body,
          endpoint: base,
          contentType: fetched.contentType,
        });
      throw new ExternalApiError(detail, { status: fetched.status, retryAfterSeconds: fetched.retryAfterSeconds });
    }
    return { ok: true, data: quotes, meta: liveMeta(quotes) };
  } catch (error) {
    if (fallbackToMock) {
      return {
        ok: true,
        data: fromMock(currencies),
        meta: mockMeta(fallbackReason(error), {
          upstreamStatus: error instanceof ExternalApiError ? error.status : undefined,
          retryAfterSeconds: error instanceof ExternalApiError ? error.retryAfterSeconds : undefined,
        }),
      };
    }
    const message = error instanceof Error ? error.message : "환율 정보를 가져오지 못했습니다.";
    const code = error instanceof ExternalApiError ? error.detail.code : "UPSTREAM";
    return { ok: false, error: { code, message } };
  }
}
