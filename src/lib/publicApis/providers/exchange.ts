import { ExternalApiError, fetchExternal } from "../../http/fetchExternal";
import { type PublicApiResult } from "../contracts/types";
import { buildSchemaMismatchError, safeEndpoint } from "../schemaDrift";
import {
  type EximExchangeContext,
  normalizeExchangeQuoteDate,
  validateEximExchangeRows,
} from "./exchangeNormalization";
import { formatKstCompactDate } from "../../format/kstCalendarDate";

type NormalizedExchange = {
  asOf: string;
  base: "KRW";
  rates: Record<string, number>;
  rawMeta: { source: "EXIM"; baseUrl: string };
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

export function getKstTodayYYYYMMDD(now = new Date()): string {
  return formatKstCompactDate(now);
}

export function normalizeEximExchange(raw: unknown, baseUrl = "", context?: EximExchangeContext): NormalizedExchange | null {
  const validated = validateEximExchangeRows(raw, context);
  if (!validated) return null;
  return {
    asOf: validated.asOf,
    base: "KRW",
    rates: validated.rates,
    rawMeta: { source: "EXIM", baseUrl },
  };
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

  const today = getKstTodayYYYYMMDD();
  const suppliedDate = params?.dateYYYYMMDD;
  const dateYYYYMMDD = suppliedDate === undefined ? today : typeof suppliedDate === "string" ? suppliedDate.trim() : "";
  if (!/^\d{8}$/.test(dateYYYYMMDD) || !normalizeExchangeQuoteDate(dateYYYYMMDD) || dateYYYYMMDD > today) {
    return { ok: false, error: { code: "INPUT", message: "환율 조회일은 오늘 이하의 유효한 YYYYMMDD 날짜여야 합니다." } };
  }
  const keyParam = (process.env.EXIM_EXCHANGE_KEY_PARAM ?? "authkey").trim() || "authkey";
  const dataParam = (process.env.EXIM_EXCHANGE_DATA ?? "AP01").trim() || "AP01";
  if (dataParam !== "AP01") {
    return { ok: false, error: { code: "INPUT", message: "EXIM 환율 조회에는 AP01 데이터만 사용할 수 있습니다." } };
  }

  try {
    const url = new URL(baseResolved.baseUrl);
    url.searchParams.set(keyParam, apiKey);
    url.searchParams.set("data", dataParam);
    url.searchParams.set("searchdate", dateYYYYMMDD);

    const fetched = await fetchExternal(url.toString(), {
      timeoutMs: 12_000,
      retries: 2,
      sourceKey: "exchange",
      sensitiveQueryParams: [keyParam],
      retryOn: [429, 500, 502, 503, 504],
    });
    const contentType = fetched.contentType;
    const text = fetched.text;
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

    const normalized = normalizeEximExchange(parsed, baseResolved.baseUrl, { requestedDate: dateYYYYMMDD });
    if (!normalized) {
      if (parsed !== null && !(Array.isArray(parsed) && parsed.length === 0)) {
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

    return {
      ok: true,
      data: normalized,
      meta: {
        provenance: {
          mode: "live",
          degraded: false,
          asOf: normalized.asOf,
          fetchedAt: new Date().toISOString(),
          source: normalized.rawMeta.source,
        },
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    const timeout = error instanceof ExternalApiError ? Boolean(error.timeout) : /timeout|timed out|etimedout|abort/i.test(message);
    const upstreamStatus = error instanceof ExternalApiError ? error.status : undefined;
    const retryAfterSeconds = error instanceof ExternalApiError ? error.retryAfterSeconds : undefined;
    console.error("[exchange] fetch failed", {
      endpoint: safeEndpoint(baseResolved.baseUrl),
      reason: message,
      upstreamStatus,
    });
    return {
      ok: false,
      error: {
        code: typeof upstreamStatus === "number" ? "UPSTREAM_ERROR" : "FETCH_FAILED",
        message: `환율 API 호출 실패: ${message}`,
        diagnostics: {
          timeout,
          upstreamStatus,
          retryAfterSeconds,
        },
      },
    };
  }
}
