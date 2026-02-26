import { jsonError, jsonOk, statusFromCode } from "@/lib/http/apiResponse";
import { attachFallback } from "@/lib/http/fallbackMeta";
import { ExternalApiError, fetchExternal } from "@/lib/http/fetchExternal";
import { setCooldown, shouldCooldown } from "@/lib/http/rateLimitCooldown";
import { pushError } from "../../../../../lib/observability/errorRingBuffer";
import { attachTrace, getOrCreateTraceId, setTraceHeader } from "../../../../../lib/observability/trace";
import { mapOpenDartStatus } from "@/lib/publicApis/dart/opendartErrors";

export const runtime = "nodejs";

const SOURCE_KEY = "opendart_list";
const DEFAULT_COOLDOWN_SECONDS = 120;

type DisclosureItem = {
  corpCode?: string;
  corpName?: string;
  stockCode?: string;
  corpCls?: string;
  reportName?: string;
  receiptNo?: string;
  filerName?: string;
  receiptDate?: string;
  remark?: string;
  viewerUrl?: string;
};

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parsePositiveInt(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function toYyyyMmDdString(value: Date): string {
  const y = String(value.getUTCFullYear());
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  const d = String(value.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function parseDateInput(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{8}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed.replace(/-/g, "");
  return null;
}

function shiftMonths(yyyymmdd: string, months: number): string {
  const year = Number(yyyymmdd.slice(0, 4));
  const month = Number(yyyymmdd.slice(4, 6)) - 1;
  const day = Number(yyyymmdd.slice(6, 8));
  const date = new Date(Date.UTC(year, month, day));
  date.setUTCMonth(date.getUTCMonth() + months);
  return toYyyyMmDdString(date);
}

function parseFinalOnly(value: string | null): "Y" | "N" {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "y") return "Y";
  return "N";
}

function normalizeDateRange(input: {
  corpCode?: string;
  fromRaw: string | null;
  toRaw: string | null;
}): { from: string; to: string; issues: string[]; assumptions: string[] } {
  const issues: string[] = [];
  const assumptions: string[] = [];
  const today = toYyyyMmDdString(new Date());
  const to = parseDateInput(input.toRaw) ?? today;
  let from = parseDateInput(input.fromRaw) ?? shiftMonths(to, -3);

  if (input.toRaw && !parseDateInput(input.toRaw)) {
    issues.push("to must be YYYYMMDD or YYYY-MM-DD");
  }
  if (input.fromRaw && !parseDateInput(input.fromRaw)) {
    issues.push("from must be YYYYMMDD or YYYY-MM-DD");
  }
  if (from > to) {
    issues.push("from must be less than or equal to to");
  }

  if (!input.corpCode) {
    const minFrom = shiftMonths(to, -3);
    if (from < minFrom) {
      from = minFrom;
      assumptions.push("corpCode 미지정으로 from을 to 기준 3개월 이내로 자동 조정했습니다.");
    }
  }

  return { from, to, issues, assumptions };
}

function mapItems(listRaw: unknown): DisclosureItem[] {
  const rows = Array.isArray(listRaw) ? listRaw : [];
  return rows
    .map((row): DisclosureItem | null => {
      if (!isRecord(row)) return null;
      const receiptNo = asString(row.rcept_no);
      const item: DisclosureItem = {};

      const corpCode = asString(row.corp_code);
      if (corpCode) item.corpCode = corpCode;
      const corpName = asString(row.corp_name);
      if (corpName) item.corpName = corpName;
      const stockCode = asString(row.stock_code);
      if (stockCode) item.stockCode = stockCode;
      const corpCls = asString(row.corp_cls);
      if (corpCls) item.corpCls = corpCls;
      const reportName = asString(row.report_nm);
      if (reportName) item.reportName = reportName;
      if (receiptNo) item.receiptNo = receiptNo;
      const filerName = asString(row.flr_nm);
      if (filerName) item.filerName = filerName;
      const receiptDate = asString(row.rcept_dt);
      if (receiptDate) item.receiptDate = receiptDate;
      const remark = asString(row.rm);
      if (remark) item.remark = remark;
      if (receiptNo) item.viewerUrl = `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${receiptNo}`;

      return item;
    })
    .filter((item): item is DisclosureItem => item !== null);
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const traceId = getOrCreateTraceId(request);
  const traceMeta = (meta: unknown = {}) => attachTrace(meta, traceId);
  const withTrace = <T extends Response>(response: T) => setTraceHeader(response, traceId);
  const fail = (
    code: string,
    message: string,
    options?: {
      issues?: string[];
      debug?: Record<string, unknown>;
      status?: number;
    },
  ) => {
    const status = options?.status ?? statusFromCode(code);
    pushError({
      time: new Date().toISOString(),
      traceId,
      route: "/api/public/disclosure/list",
      source: "dart",
      code,
      message,
      status,
      elapsedMs: Date.now() - startedAt,
    });
    return withTrace(jsonError(code, message, { ...options, meta: traceMeta() }));
  };

  const { searchParams } = new URL(request.url);
  const debug = searchParams.get("debug") === "1";
  const corpCode = (searchParams.get("corpCode") ?? "").trim();
  const pageNo = parsePositiveInt(searchParams.get("pageNo"), 1, 1, 1000);
  const pageCount = parsePositiveInt(searchParams.get("pageCount"), 20, 1, 100);
  const type = (searchParams.get("type") ?? "").trim();
  const finalOnly = parseFinalOnly(searchParams.get("finalOnly"));

  if (corpCode && !/^\d{8}$/.test(corpCode)) {
    return fail("INPUT", "입력값을 확인해주세요.", {
      issues: ["corpCode must be 8 digits"],
      status: 400,
    });
  }

  const normalizedRange = normalizeDateRange({
    corpCode: corpCode || undefined,
    fromRaw: searchParams.get("from"),
    toRaw: searchParams.get("to"),
  });

  if (normalizedRange.issues.length > 0) {
    return fail("INPUT", "입력값을 확인해주세요.", {
      issues: normalizedRange.issues,
      status: 400,
    });
  }

  const apiKey = (process.env.OPENDART_API_KEY ?? "").trim();
  if (!apiKey) {
    return fail("CONFIG", "OpenDART 설정이 필요합니다. OPENDART_API_KEY를 확인하세요.", {
      status: 400,
    });
  }

  const cooldown = shouldCooldown(SOURCE_KEY);
  if (cooldown.cooldown) {
    return fail("RATE_LIMIT", "요청 제한으로 잠시 후 다시 시도해주세요.", {
      status: 429,
      ...(debug
        ? {
            debug: {
              nextRetryAt: cooldown.nextRetryAt,
            },
          }
        : {}),
    });
  }

  const base = (process.env.OPENDART_BASE_URL ?? "https://opendart.fss.or.kr").trim().replace(/\/+$/, "");
  const upstreamParams = new URLSearchParams({
    crtfc_key: apiKey,
    bgn_de: normalizedRange.from,
    end_de: normalizedRange.to,
    page_no: String(pageNo),
    page_count: String(pageCount),
    last_reprt_at: finalOnly,
  });
  if (corpCode) upstreamParams.set("corp_code", corpCode);
  if (type) upstreamParams.set("pblntf_ty", type);

  const upstreamUrl = `${base}/api/list.json?${upstreamParams.toString()}`;
  const generatedAt = new Date().toISOString();

  try {
    const fetched = await fetchExternal(upstreamUrl, {
      sourceKey: SOURCE_KEY,
      timeoutMs: 10_000,
      retries: 1,
      throwOnHttpError: false,
      retryOn: [429, 500, 502, 503, 504],
    });

    if (!fetched.ok) {
      let nextRetryAt: string | undefined;
      if (fetched.status === 429) {
        nextRetryAt = setCooldown(SOURCE_KEY, fetched.retryAfterSeconds ?? DEFAULT_COOLDOWN_SECONDS).nextRetryAt;
      } else if (fetched.status >= 500) {
        nextRetryAt = setCooldown(SOURCE_KEY, DEFAULT_COOLDOWN_SECONDS).nextRetryAt;
      }
      return fail("UPSTREAM", "OpenDART 목록 조회에 실패했습니다.", {
        status: fetched.status === 429 ? 429 : 502,
        ...(debug
          ? {
              debug: {
                upstreamStatus: fetched.status,
                nextRetryAt,
              },
            }
          : {}),
      });
    }

    if (!isRecord(fetched.body)) {
      return fail("UPSTREAM", "OpenDART 응답 형식이 올바르지 않습니다.", { status: 502 });
    }

    const status = asString(fetched.body.status) ?? "";
    const message = asString(fetched.body.message);
    if (status !== "000") {
      const mapped = mapOpenDartStatus(status, message, "list");
      if (mapped.code === "RATE_LIMIT") {
        setCooldown(SOURCE_KEY, fetched.retryAfterSeconds ?? DEFAULT_COOLDOWN_SECONDS);
      }
      if (mapped.noData) {
        return fail(mapped.code, mapped.message, { status: mapped.httpStatus });
      }
      return fail(mapped.code, mapped.message, { status: mapped.httpStatus });
    }

    const items = mapItems(fetched.body.list);
    return withTrace(jsonOk({
      data: {
        pageNo: Number(fetched.body.page_no ?? pageNo),
        pageCount: Number(fetched.body.page_count ?? pageCount),
        totalCount: Number(fetched.body.total_count ?? 0),
        totalPage: Number(fetched.body.total_page ?? 0),
        assumptions: normalizedRange.assumptions,
        items,
      },
      meta: attachFallback(
        {
          generatedAt,
        },
        {
          mode: "LIVE",
          sourceKey: SOURCE_KEY,
          reason: "live_ok",
          generatedAt,
        },
      ),
    }, { meta: traceMeta() }));
  } catch (error) {
    if (error instanceof ExternalApiError) {
      let nextRetryAt: string | undefined;
      if (error.status === 429) {
        nextRetryAt = setCooldown(SOURCE_KEY, error.retryAfterSeconds ?? DEFAULT_COOLDOWN_SECONDS).nextRetryAt;
      } else if ((typeof error.status === "number" && error.status >= 500) || error.timeout) {
        nextRetryAt = setCooldown(SOURCE_KEY, DEFAULT_COOLDOWN_SECONDS).nextRetryAt;
      }
      return fail(error.detail.code, error.detail.message, {
        status: error.status === 429 ? 429 : 502,
        ...(debug
          ? {
              debug: {
                nextRetryAt,
                timeout: error.timeout === true,
              },
            }
          : {}),
      });
    }

    return fail("INTERNAL", "공시 목록 조회 중 오류가 발생했습니다.", { status: 502 });
  }
}
