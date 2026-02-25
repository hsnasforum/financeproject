import { type PublicApiResult } from "../contracts/types";
import { buildSchemaMismatchError, safeEndpoint } from "../schemaDrift";

type NormalizedExchange = {
  asOf: string;
  base: "KRW";
  rates: Record<string, number>;
  rawMeta: { source: "EXIM"; baseUrl: string };
};

type EximRow = {
  cur_unit?: unknown;
  currency?: unknown;
  curUnit?: unknown;
  deal_bas_r?: unknown;
  dealBasR?: unknown;
  kftcDealBasR?: unknown;
  ttb?: unknown;
  tts?: unknown;
  rate?: unknown;
  baseRate?: unknown;
  deal_bas_dt?: unknown;
  dealBasDt?: unknown;
  asOf?: unknown;
};

export function resolveExchangeBaseUrl(raw: string):
  | { ok: true; baseUrl: string }
  | { ok: false; code: "ENV_MISSING" | "ENV_INVALID_URL"; message: string } {
  const input = (raw ?? "").trim();
  if (!input) {
    return { ok: false, code: "ENV_MISSING", message: "EXIM_EXCHANGE_API_URL 설정이 필요합니다." };
  }
  if (!/^https:\/\//i.test(input)) {
    return { ok: false, code: "ENV_INVALID_URL", message: "EXIM_EXCHANGE_API_URL은 https://로 시작해야 합니다." };
  }
  try {
    const parsed = new URL(input);
    return { ok: true, baseUrl: `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "") };
  } catch {
    return { ok: false, code: "ENV_INVALID_URL", message: "EXIM_EXCHANGE_API_URL 형식이 올바르지 않습니다." };
  }
}

function parseRate(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/,/g, "").replace(/[^0-9.-]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function normalizeCurrencyUnit(raw: string): { code: string; scale: number } {
  const text = raw.trim().toUpperCase();
  const matched = text.match(/^([A-Z]{3})\s*\((\d+)\)$/);
  if (!matched) return { code: text, scale: 1 };
  const scale = Number(matched[2]);
  return {
    code: matched[1],
    scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
  };
}

function normalizeDate(raw: unknown): string {
  const value = typeof raw === "string" ? raw : "";
  const digits = value.replace(/[^0-9]/g, "");
  if (/^\d{8}$/.test(digits)) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date().toISOString().slice(0, 10);
}

export function getKstTodayYYYYMMDD(): string {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  return `${year}${month}${day}`;
}

export function normalizeEximExchange(raw: unknown, baseUrl = ""): NormalizedExchange | null {
  const rows = extractRows(raw);

  if (rows.length === 0) return null;

  const rates: Record<string, number> = {};
  let asOf = "";

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rec = row as EximRow;
    const currencyRaw =
      typeof rec.cur_unit === "string"
        ? rec.cur_unit
        : typeof rec.curUnit === "string"
          ? rec.curUnit
          : typeof rec.currency === "string"
            ? rec.currency
            : "";
    if (!currencyRaw) continue;
    const currency = normalizeCurrencyUnit(currencyRaw);

    const rate = parseRate(rec.deal_bas_r ?? rec.dealBasR ?? rec.kftcDealBasR ?? rec.rate ?? rec.baseRate ?? rec.tts ?? rec.ttb);
    if (rate === null) continue;

    rates[currency.code] = rate / currency.scale;
    if (!asOf) {
      asOf = normalizeDate(rec.deal_bas_dt ?? rec.dealBasDt ?? rec.asOf);
    }
  }

  if (Object.keys(rates).length === 0) return null;

  return {
    asOf: asOf || new Date().toISOString().slice(0, 10),
    base: "KRW",
    rates,
    rawMeta: { source: "EXIM", baseUrl },
  };
}

function extractRows(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  const rec = raw as Record<string, unknown>;
  const topKeys = ["data", "rows", "items", "result", "response"];
  for (const key of topKeys) {
    const value = rec[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      const nested = value as Record<string, unknown>;
      for (const nestedKey of ["data", "rows", "items", "list"]) {
        if (Array.isArray(nested[nestedKey])) return nested[nestedKey] as unknown[];
      }
    }
  }
  return [];
}

function hasHtmlShape(raw: string, contentType: string): boolean {
  const head = raw.trim().slice(0, 128).toLowerCase();
  return contentType.toLowerCase().includes("text/html") || head.startsWith("<html") || head.includes("<!doctype html");
}

export async function fetchEximExchange(params?: { dateYYYYMMDD?: string }): Promise<PublicApiResult<NormalizedExchange>> {
  const apiKey = (process.env.EXIM_EXCHANGE_API_KEY ?? "").trim();
  if (!apiKey) {
    return { ok: false, error: { code: "ENV_MISSING", message: "EXIM 환율 API 설정이 필요합니다." } };
  }

  const baseResolved = resolveExchangeBaseUrl(process.env.EXIM_EXCHANGE_API_URL ?? "");
  if (!baseResolved.ok) {
    return { ok: false, error: { code: baseResolved.code, message: baseResolved.message } };
  }

  const dateYYYYMMDD = (params?.dateYYYYMMDD ?? "").trim() || getKstTodayYYYYMMDD();
  const keyParam = (process.env.EXIM_EXCHANGE_KEY_PARAM ?? "authkey").trim() || "authkey";
  const dataParam = (process.env.EXIM_EXCHANGE_DATA ?? "AP01").trim() || "AP01";

  try {
    const url = new URL(baseResolved.baseUrl);
    url.searchParams.set(keyParam, apiKey);
    url.searchParams.set("data", dataParam);
    url.searchParams.set("searchdate", dateYYYYMMDD);

    const response = await fetch(url.toString(), { cache: "no-store" });
    if (!response.ok) {
      return { ok: false, error: { code: "UPSTREAM_ERROR", message: `환율 API 응답 오류(${response.status})` } };
    }
    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();
    if (hasHtmlShape(text, contentType)) {
      const mismatch = buildSchemaMismatchError({
        source: "exchange",
        stage: "http_html",
        message: "환율 API 응답 형식이 예상과 달라 데이터를 해석하지 못했습니다. 잠시 후 다시 시도하세요.",
        raw: { textLength: text.length },
        endpoint: url.toString(),
        contentType,
        note: `textLength=${text.length}`,
      });
      console.error("[exchange] schema mismatch", mismatch.diagnostics);
      return { ok: false, error: mismatch };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      const mismatch = buildSchemaMismatchError({
        source: "exchange",
        stage: "json_parse",
        message: "환율 API 응답 형식이 예상과 달라 데이터를 해석하지 못했습니다. 잠시 후 다시 시도하세요.",
        raw: { textLength: text.length },
        endpoint: url.toString(),
        contentType,
        note: `textLength=${text.length}`,
      });
      console.error("[exchange] schema mismatch", mismatch.diagnostics);
      return { ok: false, error: mismatch };
    }

    const normalized = normalizeEximExchange(parsed, baseResolved.baseUrl);
    if (!normalized) {
      const rows = extractRows(parsed);
      if (rows.length > 0 || (parsed && typeof parsed === "object" && !Array.isArray(parsed))) {
        const mismatch = buildSchemaMismatchError({
          source: "exchange",
          stage: "normalize",
          message: "환율 API 응답 형식이 예상과 달라 데이터를 해석하지 못했습니다. 잠시 후 다시 시도하세요.",
          raw: parsed,
          rowPathHints: ["data", "rows", "items", "result", "response", "response.data", "result.data"],
          endpoint: url.toString(),
          contentType,
        });
        console.error("[exchange] schema mismatch", mismatch.diagnostics);
        return { ok: false, error: mismatch };
      }
      return { ok: false, error: { code: "NO_DATA", message: "해당 날짜 환율 데이터가 없습니다." } };
    }

    return { ok: true, data: normalized };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error("[exchange] fetch failed", { endpoint: safeEndpoint(baseResolved.baseUrl), reason: message });
    return { ok: false, error: { code: "FETCH_FAILED", message: `환율 API 호출 실패: ${message}` } };
  }
}
