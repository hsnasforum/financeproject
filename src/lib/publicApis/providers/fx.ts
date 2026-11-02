import fxMock from "@/data/public/fx.mock.json";
import { ExternalApiError, fetchExternal } from "../../http/fetchExternal";
import { type DataProvenance, type ExchangeRateQuote, type PublicApiResult } from "@/lib/publicApis/contracts/types";
import {
  normalizeExchangeQuoteDate,
  validateEximExchangeRows,
} from "./exchangeNormalization";
import { formatKstCompactDate, shiftKstIsoDate } from "../../format/kstCalendarDate";
import { buildSchemaMismatchError } from "../schemaDrift";
import { resolveExchangeBaseUrl } from "./exchange";

const FX_SOURCE_LABEL = "한국수출입은행";
const KEXIM_DEFAULT_FX_URL = "https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON";
const DEFAULT_DATE_LOOKBACK_DAYS = 7;

type FxCredential =
  | { ok: true; key: string; keyParam: string; base: string }
  | { ok: false; message: string };

// Both env pairs address the same Korea Exim AP01 API (authkey, data=AP01, searchdate).
// An explicit KEXIM key keeps priority with its own URL. Otherwise the configured EXIM key is used
// only with the EXIM URL it was configured for; a failed request is never retried with the other key.
function resolveFxCredential(): FxCredential | null {
  const keximKey = (process.env.KEXIM_API_KEY ?? "").trim();
  if (keximKey) {
    return { ok: true, key: keximKey, keyParam: "authkey", base: (process.env.KEXIM_FX_API_URL ?? "").trim() || KEXIM_DEFAULT_FX_URL };
  }
  const eximKey = (process.env.EXIM_EXCHANGE_API_KEY ?? "").trim();
  if (!eximKey) return null;
  const eximBase = resolveExchangeBaseUrl(process.env.EXIM_EXCHANGE_API_URL ?? "");
  if (!eximBase.ok) return { ok: false, message: eximBase.message };
  const keyParam = (process.env.EXIM_EXCHANGE_KEY_PARAM ?? "authkey").trim() || "authkey";
  return { ok: true, key: eximKey, keyParam, base: eximBase.baseUrl };
}

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
  const credential = resolveFxCredential();

  if (!credential || !credential.ok) {
    if (fallbackToMock) {
      return { ok: true, data: fromMock(currencies), meta: mockMeta("env-missing") };
    }
    const message = credential
      ? credential.message
      : "KEXIM_API_KEY 또는 EXIM_EXCHANGE_API_KEY·EXIM_EXCHANGE_API_URL 설정이 필요합니다.";
    return { ok: false, error: { code: "CONFIG", message } };
  }

  const now = new Date();
  const today = formatKstCompactDate(now);
  const explicitDate = date.trim();
  if (explicitDate && (!/^\d{8}$/.test(explicitDate) || !normalizeExchangeQuoteDate(explicitDate) || explicitDate > today)) {
    return { ok: false, error: { code: "INPUT", message: "환율 조회일은 오늘 이하의 유효한 YYYYMMDD 날짜여야 합니다." } };
  }
  // An explicit date is asked exactly once. Without a date, today (KST) and then up to 7 previous days are
  // tried, only while the API publishes no rows (same bound as /api/public/exchange); other failures stop at once.
  const candidates = explicitDate
    ? [explicitDate]
    : Array.from({ length: DEFAULT_DATE_LOOKBACK_DAYS + 1 }, (_, days) => shiftKstIsoDate(now, -days).replaceAll("-", ""));

  try {
    let lastEmpty: ExternalApiError | null = null;
    for (const candidate of candidates) {
      const fetched = await fetchQuotesForDate(credential, candidate, wanted);
      if (fetched.kind === "quotes") return { ok: true, data: fetched.quotes, meta: liveMeta(fetched.quotes) };
      lastEmpty = fetched.error;
    }
    throw lastEmpty ?? new ExternalApiError({ code: "NO_DATA", message: "해당 날짜 환율 데이터가 없습니다." });
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

// One AP01 request. "empty" means the API published no rows for that date (the only case that may move
// to an earlier default date); every other problem throws, including rows without the wanted currencies.
async function fetchQuotesForDate(
  credential: Extract<FxCredential, { ok: true }>,
  requestedDate: string,
  wanted: Set<string>,
): Promise<{ kind: "quotes"; quotes: ExchangeRateQuote[] } | { kind: "empty"; error: ExternalApiError }> {
  const base = credential.base;
  const params = new URLSearchParams({ [credential.keyParam]: credential.key, data: "AP01", searchdate: requestedDate });

  const fetched = await fetchExternal(`${base}?${params.toString()}`, {
    sourceKey: "fx",
    sensitiveQueryParams: [credential.keyParam],
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

  const noDataError = () => new ExternalApiError(
    { code: "NO_DATA", message: "해당 날짜 환율 데이터가 없습니다." },
    { status: fetched.status, retryAfterSeconds: fetched.retryAfterSeconds },
  );
  if (fetched.body === null || (Array.isArray(fetched.body) && fetched.body.length === 0)) {
    return { kind: "empty", error: noDataError() };
  }
  const quotes = normalizeKeximJson(fetched.body, wanted, requestedDate);
  if (quotes?.length === 0) throw noDataError();
  if (!quotes) {
    throw new ExternalApiError(buildSchemaMismatchError({
      source: "exchange",
      stage: "normalize",
      message: "환율 API 응답 형식이 예상과 달라 데이터를 해석하지 못했습니다.",
      raw: fetched.body,
      endpoint: base,
      contentType: fetched.contentType,
    }), { status: fetched.status, retryAfterSeconds: fetched.retryAfterSeconds });
  }
  return { kind: "quotes", quotes };
}
