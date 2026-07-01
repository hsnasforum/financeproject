import fxMock from "@/data/public/fx.mock.json";
import { ExternalApiError, fetchExternal, requireServerEnv } from "../../http/fetchExternal";
import { type DataProvenance, type ExchangeRateQuote, type PublicApiResult } from "@/lib/publicApis/contracts/types";

const FX_SOURCE_LABEL = "한국수출입은행";

function nowIso(): string {
  return new Date().toISOString();
}

function parseRate(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/,/g, "").replace(/[^0-9.-]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function normalizeKeximJson(raw: unknown, wanted: Set<string>): ExchangeRateQuote[] {
  const rows = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { data?: unknown[] })?.data)
      ? ((raw as { data: unknown[] }).data)
      : [];

  const out: ExchangeRateQuote[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const currency = typeof rec.cur_unit === "string" ? rec.cur_unit.trim() : typeof rec.currency === "string" ? rec.currency.trim() : "";
    if (!currency || (wanted.size > 0 && !wanted.has(currency))) continue;

    const rate = parseRate(rec.deal_bas_r ?? rec.rate ?? rec.baseRate);
    if (rate === null) continue;

    const asOfDate = typeof rec.deal_bas_dt === "string" ? rec.deal_bas_dt : new Date().toISOString().slice(0, 10);

    out.push({
      asOfDate,
      currency,
      base: "KRW",
      rate,
      source: "한국수출입은행",
      fetchedAt: new Date().toISOString(),
    });
  }
  return out;
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

function liveMeta(quotes: ExchangeRateQuote[], fallbackAsOf: string): { provenance: DataProvenance } {
  return {
    provenance: {
      mode: "live",
      degraded: false,
      asOf: quotes[0]?.asOfDate ?? fallbackAsOf,
      fetchedAt: nowIso(),
      source: FX_SOURCE_LABEL,
    },
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

  try {
    const key = requireServerEnv("KEXIM_API_KEY");
    const base = process.env.KEXIM_FX_API_URL ?? "https://www.koreaexim.go.kr/site/program/financial/exchangeJSON";
    const params = new URLSearchParams({ authkey: key, data: "AP01" });
    if (date) params.set("searchdate", date);

    const fetched = await fetchExternal(`${base}?${params.toString()}`, {
      sourceKey: "fx",
      timeoutMs: 12_000,
      retries: 2,
      retryOn: [429, 500, 502, 503, 504],
    });
    if (fetched.kind !== "json") {
      if (fallbackToMock) {
        return {
          ok: true,
          data: fromMock(currencies),
          meta: mockMeta("upstream-failure", {
            upstreamStatus: fetched.status,
            retryAfterSeconds: fetched.retryAfterSeconds,
          }),
        };
      }
      return { ok: false, error: { code: "UPSTREAM", message: "환율 API 응답 형식이 예상과 다릅니다." } };
    }

    const quotes = normalizeKeximJson(fetched.body, wanted);
    return { ok: true, data: quotes, meta: liveMeta(quotes, date) };
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
