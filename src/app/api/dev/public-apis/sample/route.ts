import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getApiCacheRecord, makeApiCacheKey, setApiCache } from "@/lib/cache/apiCache";
import { getDartCompany } from "@/lib/publicApis/dart/company";
import { getExchangeQuotes } from "@/lib/publicApis/providers/fx";
import { getHousingRentBenchmark, getHousingSalesBenchmark } from "@/lib/publicApis/providers/housing";
import { searchBenefits } from "@/lib/publicApis/providers/benefits";
import { listSubscriptionNotices } from "@/lib/publicApis/providers/subscription";

export const runtime = "nodejs";

type ApiName =
  | "kexim-fx"
  | "molit-rent"
  | "molit-sales"
  | "mois-benefits"
  | "reb-subscription"
  | "opendart-company";

type SampleBody = {
  apiName?: ApiName;
  params?: Record<string, unknown>;
};

const TTL_SECONDS: Record<ApiName, number> = {
  "kexim-fx": 12 * 60 * 60,
  "molit-sales": 14 * 24 * 60 * 60,
  "molit-rent": 14 * 24 * 60 * 60,
  "mois-benefits": 2 * 24 * 60 * 60,
  "reb-subscription": 12 * 60 * 60,
  "opendart-company": 24 * 60 * 60,
};

const REQUIRED_ENV: Record<ApiName, string[]> = {
  "kexim-fx": ["KEXIM_API_KEY"],
  "molit-sales": ["MOLIT_SALES_API_KEY", "MOLIT_SALES_API_URL"],
  "molit-rent": ["MOLIT_RENT_API_KEY", "MOLIT_RENT_API_URL"],
  "mois-benefits": ["MOIS_BENEFITS_API_KEY", "MOIS_BENEFITS_API_URL"],
  "reb-subscription": ["REB_SUBSCRIPTION_API_KEY", "REB_SUBSCRIPTION_API_URL"],
  "opendart-company": ["OPENDART_API_KEY"],
};

export async function POST(request: Request) {
  if ((process.env.NODE_ENV ?? "development") === "production") {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  let body: SampleBody;
  try {
    body = (await request.json()) as SampleBody;
  } catch {
    return NextResponse.json({ ok: false, error: "INPUT", message: "JSON body가 필요합니다." }, { status: 400 });
  }

  const apiName = body.apiName;
  if (!apiName || !(apiName in TTL_SECONDS)) {
    return NextResponse.json({ ok: false, error: "INPUT", message: "지원되지 않는 apiName 입니다." }, { status: 400 });
  }

  const missing = REQUIRED_ENV[apiName].filter((key) => !process.env[key]);
  if (missing.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "MISSING_ENV",
        message: "필수 환경변수가 누락되었습니다.",
        missing,
      },
      { status: 400 },
    );
  }

  const params = (body.params ?? {}) as Record<string, unknown>;
  const key = makeApiCacheKey(`dev-sample:${apiName}`, params);
  const hit = getApiCacheRecord(key);
  if (hit) {
    const sampleFile = writeSample(apiName, hit.entry.payload);
    return NextResponse.json({
      ok: true,
      apiName,
      cache: "hit",
      payload: hit.entry.payload,
      sampleFile,
      meta: {
        key,
        fetchedAt: hit.entry.fetchedAt,
        expiresAt: hit.entry.expiresAt,
      },
    });
  }

  const result = await executeSample(apiName, params);
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        apiName,
        error: result.error,
        message: result.message,
      },
      { status: result.status ?? 502 },
    );
  }

  const entry = setApiCache(key, result.payload, TTL_SECONDS[apiName], {
    status: 200,
    meta: {
      upstream: apiName,
      params: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    },
  });

  const sampleFile = writeSample(apiName, result.payload);
  return NextResponse.json({
    ok: true,
    apiName,
    cache: "miss",
    payload: result.payload,
    sampleFile,
    meta: {
      key,
      fetchedAt: entry.fetchedAt,
      expiresAt: entry.expiresAt,
    },
  });
}

async function executeSample(apiName: ApiName, params: Record<string, unknown>): Promise<
  | { ok: true; payload: unknown }
  | { ok: false; error: string; message: string; status?: number }
> {
  if (apiName === "kexim-fx") {
    const date = typeof params.date === "string" ? params.date : "";
    const currencies = Array.isArray(params.currencies)
      ? params.currencies.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      : ["USD", "JPY"];
    const result = await getExchangeQuotes(date, currencies);
    if (!result.ok) return { ok: false, error: result.error.code, message: result.error.message, status: result.error.code === "CONFIG" ? 503 : 502 };
    return {
      ok: true,
      payload: {
        quotes: result.data.slice(0, 5).map((q) => ({ currency: q.currency, rate: q.rate, asOfDate: q.asOfDate, source: q.source })),
        count: result.data.length,
      },
    };
  }

  if (apiName === "molit-sales") {
    const regionCode = typeof params.regionCode === "string" ? params.regionCode : "11680";
    const month = typeof params.month === "string" ? params.month : defaultMonth();
    const areaBand = typeof params.areaBand === "string" ? params.areaBand : "84";
    const result = await getHousingSalesBenchmark(regionCode, month, areaBand);
    if (!result.ok) return { ok: false, error: result.error.code, message: result.error.message, status: result.error.code === "CONFIG" ? 503 : 502 };
    return { ok: true, payload: result.data };
  }

  if (apiName === "molit-rent") {
    const regionCode = typeof params.regionCode === "string" ? params.regionCode : "11680";
    const month = typeof params.month === "string" ? params.month : defaultMonth();
    const areaBand = typeof params.areaBand === "string" ? params.areaBand : "84";
    const result = await getHousingRentBenchmark(regionCode, month, areaBand);
    if (!result.ok) return { ok: false, error: result.error.code, message: result.error.message, status: result.error.code === "CONFIG" ? 503 : 502 };
    return { ok: true, payload: result.data };
  }

  if (apiName === "mois-benefits") {
    const query = typeof params.query === "string" ? params.query : "주거";
    const result = await searchBenefits(query);
    if (!result.ok) return { ok: false, error: result.error.code, message: result.error.message, status: 502 };
    return { ok: true, payload: { query, count: result.data.length, items: result.data.slice(0, 5) } };
  }

  if (apiName === "reb-subscription") {
    const region = typeof params.region === "string" ? params.region : "서울";
    const result = await listSubscriptionNotices(region);
    if (!result.ok) return { ok: false, error: result.error.code, message: result.error.message, status: 502 };
    return { ok: true, payload: { region, count: result.data.length, items: result.data.slice(0, 5) } };
  }

  const corpCode = typeof params.corpCode === "string" ? params.corpCode : "00126380";
  const result = await getDartCompany(corpCode);
  if (!result.ok) return { ok: false, error: result.error.code, message: result.error.message, status: result.error.code === "CONFIG" ? 503 : 502 };
  return {
    ok: true,
    payload: {
      corpCode: result.data.corp_code,
      corpName: result.data.corp_name,
      stockCode: result.data.stock_code,
      ceo: result.data.ceo_nm,
      industry: result.data.induty_code,
      homepage: result.data.hm_url,
    },
  };
}

function writeSample(apiName: ApiName, payload: unknown): string {
  const baseDir = path.join(process.cwd(), "tmp", "api-samples", apiName);
  fs.mkdirSync(baseDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(baseDir, `${ts}.json`);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");
  return path.relative(process.cwd(), filePath);
}

function defaultMonth(): string {
  const now = new Date();
  now.setDate(1);
  now.setMonth(now.getMonth() - 1);
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
}
