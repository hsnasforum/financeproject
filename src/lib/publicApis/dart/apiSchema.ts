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
    return invalidCompanyResponse();
  }

  if (!raw.ok) {
    if (!isRecord(raw.error) || typeof raw.error.code !== "string" || typeof raw.error.message !== "string") {
      return invalidCompanyResponse();
    }
    return {
      ok: false,
      error: {
        code: toKnownErrorCode(raw.error.code),
        message: raw.error.message,
      },
    };
  }

  const dataRaw = isRecord(raw.data) ? raw.data : null;
  const responseRaw = dataRaw && isRecord(dataRaw.raw) ? dataRaw.raw : null;
  if (!dataRaw || typeof dataRaw.corp_code !== "string" || typeof dataRaw.corp_name !== "string" || !responseRaw || typeof responseRaw.status !== "string") {
    return invalidCompanyResponse();
  }

  const data: DartCompany = {
    ...dataRaw,
    corp_code: dataRaw.corp_code,
    corp_name: dataRaw.corp_name,
    corp_name_eng: pickString(dataRaw.corp_name_eng),
    stock_name: pickString(dataRaw.stock_name),
    stock_code: pickString(dataRaw.stock_code),
    ceo_nm: pickString(dataRaw.ceo_nm),
    corp_cls: pickString(dataRaw.corp_cls),
    adres: pickString(dataRaw.adres),
    hm_url: pickString(dataRaw.hm_url),
    induty_code: pickString(dataRaw.induty_code),
    est_dt: pickString(dataRaw.est_dt),
    acc_mt: pickString(dataRaw.acc_mt),
    raw: {
      status: responseRaw.status,
      message: pickString(responseRaw.message),
    },
  };

  return { ok: true, data };
}

function pickString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function toKnownErrorCode(code: string): DartApiErrorCode {
  const known = new Set<DartApiErrorCode>(["CONFIG", "INPUT", "AUTH", "FORBIDDEN", "NO_DATA", "RATE_LIMIT", "MAINTENANCE", "UPSTREAM", "INTERNAL"]);
  return known.has(code as DartApiErrorCode) ? (code as DartApiErrorCode) : "INTERNAL";
}

function invalidCompanyResponse(): DartApiResult<DartCompany> {
  return {
    ok: false,
    error: {
      code: "INTERNAL",
      message: "응답 형식이 올바르지 않습니다.",
    },
  };
}
