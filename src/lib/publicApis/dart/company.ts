import { mapOpenDartStatus } from "@/lib/publicApis/dart/opendartErrors";
import { type DartApiErrorCode, type DartApiResult, type DartCompany } from "@/lib/publicApis/dart/types";

const DEFAULT_DART_BASE_URL = "https://opendart.fss.or.kr";

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

function getBaseUrl(): string {
  const raw = (process.env.OPENDART_BASE_URL ?? DEFAULT_DART_BASE_URL).trim();
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

function toError(code: DartApiErrorCode, message: string): DartApiResult<DartCompany> {
  return { ok: false, error: { code, message } };
}

export async function getDartCompany(corpCode: string): Promise<DartApiResult<DartCompany>> {
  if (!isCorpCode(corpCode)) {
    return toError("INPUT", "corpCode는 숫자 8자리여야 합니다.");
  }

  const apiKey = (process.env.OPENDART_API_KEY ?? "").trim();
  if (!apiKey) {
    return toError("CONFIG", "OPENDART_API_KEY 필요");
  }

  const query = new URLSearchParams({
    crtfc_key: apiKey,
    corp_code: corpCode,
  });

  const endpoint = `${getBaseUrl()}/api/company.json?${query.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    console.error("[dart] company fetch failed", {
      corpCode,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return toError("UPSTREAM", "OpenDART 호출 실패");
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    return toError("UPSTREAM", "OpenDART 호출 실패");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return toError("UPSTREAM", "OpenDART 응답 형식이 올바르지 않습니다.");
  }

  if (!isRecord(payload)) {
    return toError("UPSTREAM", "OpenDART 응답 형식이 올바르지 않습니다.");
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
    return toError("NO_DATA", "조회된 데이터가 없습니다.");
  }

  if (status === "020") {
    return toError("RATE_LIMIT", "요청 제한");
  }

  const mapped = mapOpenDartStatus(status, message, "company");
  return toError((mapped.code || "UPSTREAM") as DartApiErrorCode, mapped.message);
}
