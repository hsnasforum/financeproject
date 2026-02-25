import { type CorpIndexItem, type DartApiResult, type DartCompany, type DartApiErrorCode } from "@/lib/publicApis/dart/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseError(raw: unknown): { code: string; message: string } {
  if (!isRecord(raw)) return { code: "UNKNOWN", message: "요청을 처리하지 못했습니다." };
  return {
    code: typeof raw.code === "string" ? raw.code : "UNKNOWN",
    message: typeof raw.message === "string" ? raw.message : "요청을 처리하지 못했습니다.",
  };
}

export function parseDartSearchResponse(raw: unknown):
  | { ok: true; data: { generatedAt?: string; count?: number; items: CorpIndexItem[] } }
  | { ok: false; error: { code: string; message: string } } {
  if (!isRecord(raw) || typeof raw.ok !== "boolean") {
    throw new Error("DART 검색 응답 형식이 올바르지 않습니다.");
  }

  if (!raw.ok) {
    return { ok: false, error: parseError(raw.error) };
  }

  const dataRaw = isRecord(raw.data) ? raw.data : {};
  const itemsRaw = Array.isArray(dataRaw.items) ? dataRaw.items : [];
  const items = (itemsRaw as unknown[])
    .map((item) => {
      if (!isRecord(item)) return null;
      const corp_code = typeof item.corp_code === "string" ? item.corp_code : "";
      const corp_name = typeof item.corp_name === "string" ? item.corp_name : "";
      if (!corp_code || !corp_name) return null;
      const result: CorpIndexItem = {
        corp_code,
        corp_name,
      };
      if (typeof item.stock_code === "string") {
        result.stock_code = item.stock_code;
      }
      return result;
    })
    .filter((v): v is CorpIndexItem => v !== null);

  return {
    ok: true,
    data: {
      generatedAt: typeof dataRaw.generatedAt === "string" ? dataRaw.generatedAt : undefined,
      count: typeof dataRaw.count === "number" ? dataRaw.count : undefined,
      items,
    },
  };
}

export function parseDartCompanyResponse(raw: unknown): DartApiResult<DartCompany> {
  if (!isRecord(raw) || typeof raw.ok !== "boolean") {
    throw new Error("DART 기업개황 응답 형식이 올바르지 않습니다.");
  }

  if (!raw.ok) {
    const error = parseError(raw.error);
    const known = new Set(["CONFIG", "INPUT", "UPSTREAM", "NO_INDEX", "NO_DATA", "RATE_LIMIT", "AUTH", "FORBIDDEN", "MAINTENANCE", "INTERNAL"]);
    return {
      ok: false,
      error: {
        code: known.has(error.code) ? (error.code as DartApiErrorCode) : "UPSTREAM",
        message: error.message,
      },
    };
  }

  const dataRaw = isRecord(raw.data) ? raw.data : null;
  if (!dataRaw || typeof dataRaw.corp_code !== "string") {
    throw new Error("DART 기업개황 data 형식이 올바르지 않습니다.");
  }

  const data: DartCompany = {
    corp_code: dataRaw.corp_code,
    corp_name: typeof dataRaw.corp_name === "string" ? dataRaw.corp_name : undefined,
    corp_name_eng: typeof dataRaw.corp_name_eng === "string" ? dataRaw.corp_name_eng : undefined,
    stock_code: typeof dataRaw.stock_code === "string" ? dataRaw.stock_code : undefined,
    ceo_nm: typeof dataRaw.ceo_nm === "string" ? dataRaw.ceo_nm : undefined,
    corp_cls: typeof dataRaw.corp_cls === "string" ? dataRaw.corp_cls : undefined,
    jurir_no: typeof dataRaw.jurir_no === "string" ? dataRaw.jurir_no : undefined,
    bizr_no: typeof dataRaw.bizr_no === "string" ? dataRaw.bizr_no : undefined,
    adres: typeof dataRaw.adres === "string" ? dataRaw.adres : undefined,
    hm_url: typeof dataRaw.hm_url === "string" ? dataRaw.hm_url : undefined,
    ir_url: typeof dataRaw.ir_url === "string" ? dataRaw.ir_url : undefined,
    phn_no: typeof dataRaw.phn_no === "string" ? dataRaw.phn_no : undefined,
    fax_no: typeof dataRaw.fax_no === "string" ? dataRaw.fax_no : undefined,
    induty_code: typeof dataRaw.induty_code === "string" ? dataRaw.induty_code : undefined,
    est_dt: typeof dataRaw.est_dt === "string" ? dataRaw.est_dt : undefined,
    acc_mt: typeof dataRaw.acc_mt === "string" ? dataRaw.acc_mt : undefined,
    raw: isRecord(dataRaw.raw) ? dataRaw.raw : {},
  };

  return { ok: true, data };
}
