import { DartError, fetchDartJson } from "@/lib/publicApis/dart/fetch";
import { toDartApiError } from "@/lib/publicApis/dart/opendartErrors";
import { type DartApiResult, type DartCompany, type DartCompanyRawResponse } from "@/lib/publicApis/dart/types";

function isCorpCode(value: string): boolean {
  return /^\d{8}$/.test(value);
}

export async function getDartCompany(corpCode: string): Promise<DartApiResult<DartCompany>> {
  if (!isCorpCode(corpCode)) {
    return {
      ok: false,
      error: {
        code: "INPUT",
        message: "corpCode는 숫자 8자리여야 합니다.",
      },
    };
  }

  try {
    const json = (await fetchDartJson("company.json", { corp_code: corpCode })) as DartCompanyRawResponse;

    if (json.status !== "000") {
      console.error("[dart] company upstream status", {
        corpCode,
        status: json.status,
        message: json.message,
      });
      return {
        ok: false,
        error: toDartApiError(json.status, typeof json.message === "string" ? json.message : undefined, "company"),
      };
    }

    const data: DartCompany = {
      corp_code: String(json.corp_code ?? corpCode),
      corp_name: asOptionalString(json.corp_name),
      corp_name_eng: asOptionalString(json.corp_name_eng),
      stock_name: asOptionalString(json.stock_name),
      stock_code: asOptionalString(json.stock_code),
      ceo_nm: asOptionalString(json.ceo_nm),
      corp_cls: asOptionalString(json.corp_cls),
      jurir_no: asOptionalString(json.jurir_no),
      bizr_no: asOptionalString(json.bizr_no),
      adres: asOptionalString(json.adres),
      hm_url: asOptionalString(json.hm_url),
      ir_url: asOptionalString(json.ir_url),
      phn_no: asOptionalString(json.phn_no),
      fax_no: asOptionalString(json.fax_no),
      induty_code: asOptionalString(json.induty_code),
      est_dt: asOptionalString(json.est_dt),
      acc_mt: asOptionalString(json.acc_mt),
      raw: json as Record<string, unknown>,
    };

    return { ok: true, data };
  } catch (error) {
    if (error instanceof DartError) {
      return { ok: false, error: error.info };
    }

    console.error("[dart] company unexpected error", {
      corpCode,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return {
      ok: false,
      error: {
        code: "INTERNAL",
        message: "요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.",
      },
    };
  }
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
