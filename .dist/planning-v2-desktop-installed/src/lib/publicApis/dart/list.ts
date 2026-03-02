import { DartError, fetchDartJson } from "./fetch";
import { mapOpenDartStatus, toDartApiError } from "./opendartErrors";
import { type DartApiResult } from "./types";

type RawListItem = {
  corp_name?: string;
  corp_code?: string;
  stock_code?: string;
  corp_cls?: string;
  report_nm?: string;
  rcept_no?: string;
  flr_nm?: string;
  rcept_dt?: string;
  rm?: string;
  [key: string]: unknown;
};

type RawListResponse = {
  status?: string;
  message?: string;
  page_no?: string;
  page_count?: string;
  total_count?: string;
  total_page?: string;
  list?: RawListItem[];
  [key: string]: unknown;
};

export type DartListQuery = {
  corp_code?: string;
  bgn_de?: string;
  end_de?: string;
  last_reprt_at?: "Y" | "N";
  pblntf_ty?: string;
  pblntf_detail_ty?: string;
  corp_cls?: "Y" | "K" | "N" | "E";
  sort?: "date" | "crp" | "rpt";
  sort_mth?: "asc" | "desc";
  page_no?: number;
  page_count?: number;
};

export type DartDisclosureList = {
  pageNo: number;
  pageCount: number;
  totalCount: number;
  totalPage: number;
  assumptions: string[];
  items: Array<{
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
  }>;
};

export function normalizeListQuery(input: URLSearchParams): { params: DartListQuery; assumptions: string[] } {
  const assumptions: string[] = [];
  const params: DartListQuery = {};

  const corpCode = (input.get("corp_code") ?? "").trim();
  if (corpCode) params.corp_code = corpCode;

  const today = yyyymmdd(new Date());
  const endInput = (input.get("end_de") ?? "").trim();
  const startInput = (input.get("bgn_de") ?? "").trim();

  const end = isDate(endInput) ? endInput : today;
  let begin = isDate(startInput) ? startInput : yyyymmdd(shiftMonths(parseYmd(end), -3));

  if (!params.corp_code) {
    const minBegin = yyyymmdd(shiftMonths(parseYmd(end), -3));
    if (begin < minBegin) {
      begin = minBegin;
      assumptions.push("corp_code 미지정으로 bgn_de를 end_de 기준 3개월 이내로 자동 조정했습니다.");
    }
  }

  params.bgn_de = begin;
  params.end_de = end;

  const lastReprtAt = (input.get("last_reprt_at") ?? "").trim().toUpperCase();
  if (lastReprtAt === "Y" || lastReprtAt === "N") params.last_reprt_at = lastReprtAt;

  const pblntfTy = (input.get("pblntf_ty") ?? "").trim();
  if (pblntfTy) params.pblntf_ty = pblntfTy;

  const pblntfDetailTy = (input.get("pblntf_detail_ty") ?? "").trim();
  if (pblntfDetailTy) params.pblntf_detail_ty = pblntfDetailTy;

  const corpCls = (input.get("corp_cls") ?? "").trim().toUpperCase();
  if (corpCls === "Y" || corpCls === "K" || corpCls === "N" || corpCls === "E") params.corp_cls = corpCls;

  const sort = (input.get("sort") ?? "").trim().toLowerCase();
  if (sort === "date" || sort === "crp" || sort === "rpt") params.sort = sort;

  const sortMth = (input.get("sort_mth") ?? "").trim().toLowerCase();
  if (sortMth === "asc" || sortMth === "desc") params.sort_mth = sortMth;

  const pageNo = Number(input.get("page_no") ?? "1");
  params.page_no = Number.isInteger(pageNo) && pageNo >= 1 ? pageNo : 1;

  const pageCount = Number(input.get("page_count") ?? "10");
  params.page_count = Number.isInteger(pageCount) && pageCount >= 1 ? Math.min(pageCount, 100) : 10;

  return { params, assumptions };
}

export async function getDartDisclosureList(input: URLSearchParams): Promise<DartApiResult<DartDisclosureList>> {
  const { params, assumptions } = normalizeListQuery(input);

  try {
    const raw = (await fetchDartJson("list.json", toStringParams(params))) as RawListResponse;
    const status = String(raw.status ?? "");

    if (status !== "000") {
      const mapped = mapOpenDartStatus(status, typeof raw.message === "string" ? raw.message : undefined, "list");
      if (mapped.noData) {
        return {
          ok: true,
          data: {
            pageNo: Number(raw.page_no ?? params.page_no ?? 1),
            pageCount: Number(raw.page_count ?? params.page_count ?? 10),
            totalCount: 0,
            totalPage: 0,
            assumptions,
            items: [],
          },
        };
      }

      return {
        ok: false,
        error: toDartApiError(status, typeof raw.message === "string" ? raw.message : undefined, "list"),
      };
    }

    const list = Array.isArray(raw.list) ? raw.list : [];
    return {
      ok: true,
      data: {
        pageNo: Number(raw.page_no ?? params.page_no ?? 1),
        pageCount: Number(raw.page_count ?? params.page_count ?? 10),
        totalCount: Number(raw.total_count ?? 0),
        totalPage: Number(raw.total_page ?? 0),
        assumptions,
        items: list.map((row) => ({
          corpCode: asString(row.corp_code),
          corpName: asString(row.corp_name),
          stockCode: asString(row.stock_code),
          corpCls: asString(row.corp_cls),
          reportName: asString(row.report_nm),
          receiptNo: asString(row.rcept_no),
          filerName: asString(row.flr_nm),
          receiptDate: asString(row.rcept_dt),
          remark: asString(row.rm),
          viewerUrl: asString(row.rcept_no) ? `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${asString(row.rcept_no)}` : undefined,
        })),
      },
    };
  } catch (error) {
    if (error instanceof DartError) {
      return { ok: false, error: error.info };
    }

    return {
      ok: false,
      error: {
        code: "INTERNAL",
        message: "공시검색 요청을 처리하지 못했습니다.",
      },
    };
  }
}

function toStringParams(params: DartListQuery): Record<string, string> {
  const out: Record<string, string> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    out[key] = String(value);
  });
  return out;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function isDate(value: string): boolean {
  return /^\d{8}$/.test(value);
}

function parseYmd(value: string): Date {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6)) - 1;
  const day = Number(value.slice(6, 8));
  return new Date(Date.UTC(year, month, day));
}

function shiftMonths(base: Date, amount: number): Date {
  const cloned = new Date(base.getTime());
  cloned.setUTCMonth(cloned.getUTCMonth() + amount);
  return cloned;
}

function yyyymmdd(date: Date): string {
  const y = String(date.getUTCFullYear());
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}
