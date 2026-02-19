import fxMock from "@/data/public/fx.mock.json";
import { fetchExternal, requireServerEnv } from "@/lib/http/fetchExternal";
import { type ExchangeRateQuote, type PublicApiResult } from "@/lib/publicApis/contracts/types";

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
  return fxMock.quotes
    .filter((q) => (wanted.size ? wanted.has(q.currency) : true))
    .map((q) => ({
      asOfDate: fxMock.asOfDate,
      currency: q.currency,
      base: "KRW",
      rate: q.rate,
      source: "한국수출입은행(mock)",
      fetchedAt: new Date().toISOString(),
    }));
}

export async function getExchangeQuotes(date: string, currencies: string[]): Promise<PublicApiResult<ExchangeRateQuote[]>> {
  const wanted = new Set(currencies.filter(Boolean));

  const useMock = process.env.PUBLIC_APIS_FALLBACK_TO_MOCK !== "0" && !process.env.KEXIM_API_KEY;
  if (useMock) {
    return { ok: true, data: fromMock(currencies) };
  }

  try {
    const key = requireServerEnv("KEXIM_API_KEY");
    const base = process.env.KEXIM_FX_API_URL ?? "https://www.koreaexim.go.kr/site/program/financial/exchangeJSON";
    const params = new URLSearchParams({ authkey: key, data: "AP01" });
    if (date) params.set("searchdate", date);

    const fetched = await fetchExternal(`${base}?${params.toString()}`);
    if (fetched.kind !== "json") {
      return { ok: false, error: { code: "UPSTREAM", message: "환율 API 응답 형식이 예상과 다릅니다." } };
    }

    const quotes = normalizeKeximJson(fetched.body, wanted);
    return { ok: true, data: quotes };
  } catch (error) {
    if (process.env.PUBLIC_APIS_FALLBACK_TO_MOCK !== "0") {
      return { ok: true, data: fromMock(currencies) };
    }
    const message = error instanceof Error ? error.message : "환율 정보를 가져오지 못했습니다.";
    return { ok: false, error: { code: "UPSTREAM", message } };
  }
}
