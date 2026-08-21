import { mapOpenDartStatus } from "@/lib/publicApis/dart/opendartErrors";
import { DartError, fetchDartJsonDetailed } from "@/lib/publicApis/dart/fetch";
import { type DartApiError, type DartApiErrorCode, type DartApiResult, type DartCompany } from "@/lib/publicApis/dart/types";

function isCorpCode(value: string): boolean {
  return /^\d{8}$/.test(value);
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toError(
  code: DartApiErrorCode,
  message: string,
  details: Pick<DartApiError, "upstreamStatus" | "retryAfterSeconds" | "timeout" | "aborted"> = {},
): DartApiResult<DartCompany> {
  return { ok: false, error: { code, message, ...details } };
}

export async function getDartCompany(
  corpCode: string,
  signal?: AbortSignal | null,
): Promise<DartApiResult<DartCompany>> {
  if (!isCorpCode(corpCode)) {
    return toError("INPUT", "corpCode는 숫자 8자리여야 합니다.");
  }

  const apiKey = (process.env.OPENDART_API_KEY ?? "").trim();
  if (!apiKey) {
    return toError("CONFIG", "OPENDART_API_KEY 필요");
  }

  let fetched: Awaited<ReturnType<typeof fetchDartJsonDetailed>>;
  try {
    fetched = await fetchDartJsonDetailed("company.json", { corp_code: corpCode }, 10_000, signal);
  } catch (error) {
    if (error instanceof DartError) {
      return { ok: false, error: error.info };
    }
    console.error("[dart] company fetch failed", {
      corpCode,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return toError("UPSTREAM", "OpenDART 호출 실패");
  }

  const payload = fetched.body;
  const upstreamDetails = {
    upstreamStatus: fetched.upstreamStatus,
    retryAfterSeconds: fetched.retryAfterSeconds,
  };

  if (!isRecord(payload)) {
    return toError("UPSTREAM", "OpenDART 응답 형식이 올바르지 않습니다.", upstreamDetails);
  }

  const status = asOptionalString(payload.status) ?? "";
  const message = asOptionalString(payload.message);

  if (status === "000") {
    const data: DartCompany = {
      ...payload,
      corp_code: asOptionalString(payload.corp_code) ?? corpCode,
      corp_name: asOptionalString(payload.corp_name) ?? "",
      corp_name_eng: asOptionalString(payload.corp_name_eng),
      stock_name: asOptionalString(payload.stock_name),
      stock_code: asOptionalString(payload.stock_code),
      ceo_nm: asOptionalString(payload.ceo_nm),
      corp_cls: asOptionalString(payload.corp_cls),
      adres: asOptionalString(payload.adres),
      hm_url: asOptionalString(payload.hm_url),
      induty_code: asOptionalString(payload.induty_code),
      est_dt: asOptionalString(payload.est_dt),
      acc_mt: asOptionalString(payload.acc_mt),
      raw: { status, message },
    };
    return { ok: true, data };
  }

  if (status === "013") {
    return toError("NO_DATA", "조회된 데이터가 없습니다.", upstreamDetails);
  }

  if (status === "020") {
    return toError("RATE_LIMIT", "요청 제한", upstreamDetails);
  }

  const mapped = mapOpenDartStatus(status, message, "company");
  return toError((mapped.code || "UPSTREAM") as DartApiErrorCode, mapped.message, upstreamDetails);
}
